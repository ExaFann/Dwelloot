## Task

[17] Add activities list endpoint: `GET /api/activities` with sort/filter/search/pagination.

`project-plan.md` lists "sort/filter/search/pagination on activity & reward catalogs" as a
must-have, so all four are in scope here rather than deferred to the UI.

## Spec

From `api-design.md`:

```
GET /api/activities?category=Chore&pageSize=5&sort=title
→ 200 { "items": [ { "id": 3, "title": "Wash dishes", "points": 10 } ], "total": 12 }
```

`total` is the count of everything matching the filters, **not** the number returned — that is what
lets the UI render "showing 5 of 12" and size its pager.

Item shape is `{ id, title, points }` exactly. `category` is deliberately not echoed per item: the
client filters by it through the query string and v1 has one value, so returning it would be
padding. Additive later if task [51] wants it.

### Scoping, and why an unpaired user is an error rather than an empty list

Results are restricted to the caller's household — the isolation guarantee the copy-on-creation
model exists to provide (task [12]).

A caller with no household gets **409**, not an empty page. An empty list would be
indistinguishable from "your household has no chores left", which is a legitimate state after
deleting them all. Conflating a routing bug with a real data state hides the bug; `GET /auth/me`
already tells the frontend to show the pairing screen instead.

### Sorting

`sort` ∈ {`title`, `points`}, with an additional `desc` boolean. `api-design.md` shows only
ascending field names; `desc` is a superset, and the store screen wants "most expensive first"
anyway.

Two things worth stating:

- **The sort field is mapped through a fixed switch, never interpolated into a query.** An unknown
  value returns 400 rather than silently falling back, so a frontend typo surfaces immediately
  instead of quietly returning mis-ordered data. Worth noting for the security writeup: sort
  parameters are a classic injection vector in hand-built SQL, and this design has no path from
  user input to a query fragment.
- **Every sort gets `Id` as a tiebreaker.** Sorting by `points` alone is not a total order — the
  default catalog has three chores at 15 points — and a non-deterministic order across pages makes
  rows repeat or vanish while paging. This is the sort of bug that only shows up with real data,
  so it is designed out rather than found later.

### Search

Case-insensitive substring match on the title, via `ToLower().Contains(...)`.

Npgsql's `EF.Functions.ILike` would be the idiomatic PostgreSQL choice, but it does not translate
on the in-memory provider, which would make this untestable in the existing suite.
`ToLower().Contains(...)` translates on both. The catalog is a dozen rows per household, so losing
index usage costs nothing measurable.

`Contains` also means the term is parameterised rather than pasted into a `LIKE` pattern: searching
for `%` finds a literal percent sign instead of matching everything. Free with this approach, and a
real bug in the hand-rolled `LIKE '%' + term + '%'` version.

### Pagination

`page` (1-based) and `pageSize`. `pageSize` is **capped at 100** — an uncapped page size lets one
request ask for every row in the table, which is a cheap denial-of-service and a memory spike. Out
of range values are clamped rather than rejected, since a client asking for page 0 wants the first
page.

### Shared response type

`PagedResponse<T>(IReadOnlyList<T> Items, int Total)` in `API/Dtos`, since task [28] does the same
job for rewards and the activity-log lists need it too.

## Test requirement

**`ActivityServiceTests`**:

1. Returns the household's chores with the right total.
2. **Never returns another household's chores**, even when the titles are identical — the isolation
   guarantee. Asserts on ids, not titles, since every household starts from the same templates and
   a title-based assertion would pass on the wrong rows.
3. A caller with no household gets `NoHousehold`, not an empty page.
4. A caller who is not the household's member cannot read it — covered by 2, but asserted for the
   explicit "wrong household id" path.
5. Search matches case-insensitively.
6. **Search treats `%` as a literal**, not a wildcard.
7. Sort by title ascending and descending.
8. Sort by points, **with ties broken by id** — asserted against the real default catalog, which
   contains three chores at 15 points.
9. An unknown sort field returns `InvalidSort`.
10. Pagination returns the right slice, and `total` stays the **unpaginated** count.
11. **Paging through the whole catalog yields every row exactly once** — the property that a
    missing tiebreaker actually breaks, and one a single-page assertion would miss.
12. `pageSize` is capped; `page` below 1 is clamped.
13. Category filter narrows the results.

Then end-to-end against the running API and real PostgreSQL — which also finally reads back the
twenty catalog rows task [14] could only prove were inserted.
