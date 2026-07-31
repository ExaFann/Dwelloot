## Task

[28] Add rewards list endpoint: `GET /api/rewards` with sort/filter/search/pagination.

`project-plan.md` lists "sort/filter/search/pagination on activity & reward catalogs" as a must-have,
so all four are in scope here, exactly as they were for task [17].

## Spec

From `api-design.md`:

```
GET /api/rewards?sort=coinCost
→ 200 { "items": [ { "id": 5, "title": "Takeout of choice", "coinCost": 30 } ], "total": 8 }
```

This is the direct sibling of task [17] (`GET /api/activities`, log `016`), and the structure is
deliberately the same: household scoping, a fixed sort switch with an `Id` tiebreaker, parameterised
substring search, a capped page size, and `PagedResponse<T>`. Log `016`'s three mutation findings are
treated as known traps rather than rediscovered — see the test requirement.

Two decisions this task owns are settled below.

### Decision 1: the filter axis is affordability

`wireframes.md` screen 4 promises sort/filter/search/pagination, but the filter had no axis. Task [7]
(log `006`) removed `?category=all` from `api-design.md` because rewards have no category column —
`relational-model.md`, `er-diagram.md` and `project-plan.md` all agree the columns are
`id, title, coin_cost, pauses_competition, household_id` — and the parameter had been copied from the
adjacent activities query. `api-design.md` then recorded the open question and recommended
**affordability**, deferring the call to [28]/[51].

**Taken.** `?affordable=true` narrows to rewards the caller can currently pay for, from `users.coins`.

It is the filter the screen already implies rather than one invented to fill the slot: screen 4
disables Redeem on an insufficient balance, so "show me only what I can actually redeem" is the
control the user is already reaching for. It also needs no new column.

Typed as `bool?`, and **all three states are honoured** — omitted means no filter, `true` means
`coinCost <= coins`, `false` means the complement. Declaring a nullable bool and quietly ignoring
`false` would be a trap: a client sending `affordable=false` to get "what am I saving for" would
receive the _whole_ catalog and have no way to tell. The complement is one clause, and the pair being
a genuine partition is asserted rather than assumed.

The boundary is `<=`, not `<`: a reward priced at exactly the balance is affordable, because
redeeming it is a transaction the caller can complete.

### Decision 2: `pausesCompetition` is returned per item, and it has to be

`api-design.md`'s example shows `{ id, title, coinCost }`. **A fourth field is added:
`pausesCompetition`.**

This is not padding, and it is the more consequential of the two decisions. Four separate places in
this project state that the day-off reward's consequence must be shown at the point of redemption:

- `Reward.PausesCompetition`'s own remarks — "the store must spell out the consequence at the point
  of redemption ... rather than letting one of them find out when their loot box never arrives. Tasks
  [29]/[51] own that copy; **it is derived from this flag** rather than stored per row, so it cannot
  drift from what settlement actually does."
- `DefaultRewards`' remarks say the same.
- `api-design.md`'s store section spells out the voiding behaviour.
- The handover's deferred-debt table assigns the copy to [29]/[51].

The copy is derived from the flag, and screen 4 is where Redeem lives — so the client needs the flag.
A grep confirms `PausesCompetition` is currently read by **settlement and the loot-box pool only**,
and is exposed by **no endpoint at all**. Without this field, task [51] cannot render the warning
every one of those four documents requires, and would be pushed toward hard-coding "Full chore day
off" by title — precisely the drift the flag exists to prevent.

Same class of gap as badge unlocks before task [27]: a column doing real work with no read path.
Unlike affordability, it is **not derivable** from anything the client already holds.

`api-design.md`'s example is updated rather than left stale.

### What is deliberately _not_ returned

**Per-item `affordable`.** It is `coinCost <= coins`, and the client holds both — `coinCost` is in
the item and the balance comes from `GET /api/auth/me`, which screens 1 and 5 already fetch. Echoing
a derived boolean is the same padding that kept `category` out of `ActivityResponse` in log `016`.

**The caller's balance in the envelope.** `PagedResponse<T>` is shared by four endpoints; widening it
for one screen's convenience is the wrong place to put it, and `/auth/me` is the documented source.

### Scoping and errors — identical to task [17] on purpose

- Household-scoped. A caller with no household gets **409**, not an empty page: an empty list is
  indistinguishable from "this household deleted all its rewards", which is a legitimate state.
- Unknown sort field → **400** listing the valid values, never a silent fallback.
- The sort goes through a **fixed switch**. No path from caller input into a query fragment.
- `pageSize` capped at **100**, out-of-range values clamped rather than rejected.

`ActivityService.MaxPageSize` / `DefaultPageSize` are reused rather than duplicated, following
`ActivityLogService`, which already does exactly this. The constants arguably want hoisting somewhere
neutral now that a third service reads them off `ActivityService`, but that means editing three
existing files and is not [28]'s business — flagged, not done.

### One asymmetry with activities: there is no `ArchivedAt`

`GET /api/activities` filters `ArchivedAt == null`. `Reward` has no such column, so there is nothing
to filter here and the query is simpler.

That is correct for [28], which is read-only, but it lands a question squarely on **[29]**, and it is
worth writing down now because it is the exact shape of the bug log `017` had to reverse: `reward →
redemptions` is **Cascade**, so hard-deleting a reward deletes its redemption rows. Redemptions are
read by the daily void check in settlement, by the First-redemption and Big-spender badge counts, and
by the Notices partner-redemptions feed. Deleting a reward would therefore silently reduce a
partner's badge progress and erase their feed history. Recorded for [29] rather than pre-empted here.

### Sort fields, and keeping the 400 message honest

`sort` ∈ {`title`, `coinCost`}, plus `desc`, matching `api-design.md`'s `?sort=coinCost`.

The service lowercases the caller's input before the switch, so the match keys are lowercase
(`coincost`). The 400 message must still show the **documented** spelling, so `RewardSortFields`
carries the display list separately — and a test asserts every display value, lowercased, is actually
accepted, so the two cannot drift apart.

| File                                        | Change                                                           |
| ------------------------------------------- | ---------------------------------------------------------------- |
| `API/Dtos/Rewards/RewardDtos.cs`            | New. `RewardResponse`, `RewardQuery`.                            |
| `API/Services/RewardService.cs`             | New. Scoping, affordability filter, search, sort, pagination.    |
| `API/Controllers/RewardsController.cs`      | New. `GET /api/rewards`.                                         |
| `API/Program.cs`                            | Register `IRewardService`.                                       |
| `Tests/Services/RewardServiceTests.cs`      | New.                                                             |
| `specs/1_architecture_and_ux/api-design.md` | `pausesCompetition` in the example, and the filter axis settled. |

## Test requirement

A real test file: `Tests/Services/RewardServiceTests.cs`, mirroring `ActivityServiceTests` and
carrying log `016`'s lessons in rather than relearning them.

1. Returns the household's rewards with the full total (`DefaultRewards.All.Count`).
2. **Never returns another household's rewards**, asserted on **ids, not titles** — every household
   starts from the same eight templates, so a title assertion would pass on the wrong rows.
3. No household → `NoHousehold`, not an empty page.
4. Unknown user → `UserNotFound`.
5. Search is case-insensitive.
6. Search treats `%` as a **literal**, not a wildcard.
7. Sort by title, both directions.
8. **Sort by coin cost with ties broken by id — and the ties must be constructed.** This is log
   `016`'s trap in a new place: the activities test could lean on three default chores tied at 15
   points, but the default reward prices are `15, 20, 25, 30, 35, 40, 45, 80` — **all distinct**. A
   tiebreaker test against tie-free data cannot fail. Rows with duplicate `CoinCost` are added
   explicitly, with a comment saying why.
9. Unknown sort field → `InvalidSort`.
10. Pagination returns the right slice and `total` stays the **unpaginated** count.
11. **Paging through the whole catalog yields every row exactly once**, run against the tied sort —
    the property a missing tiebreaker actually breaks.
12. `pageSize` is capped, seeded **past** the cap (`MaxPageSize + 50` rows), because asserting a cap
    against an eight-row catalog is vacuous — log `016`'s first survivor.
13. `page` below 1 clamps to the first page.
14. **Affordability, with absolute literals.** Balance set to `25` against the known default prices,
    so `affordable=true` returns exactly the rewards at `15`, `20` and `25`. Expressing the
    expectation in terms of the balance variable would pass at any comparison operator — that is the
    trap from logs `023`/`025`/`026`, four times over.
15. **`<=`, not `<`** — the reward priced at exactly the balance is included. Asserted on its own.
16. **The three filter states partition the catalog**, asserted **both directions**: `true` plus
    `false` equals omitted, with neither side empty and no overlap. Asserting only the `true` side
    would pass against a service that ignored `false`.
17. A zero balance affords nothing.
18. **`pausesCompetition` is reported per item** — true for "Full chore day off" and false for the
    other seven. The field task [51] depends on.
19. Every value in `RewardSortFields.All`, lowercased, is accepted — pins the 400 message's spellings
    against the switch's match keys.

Then mutation testing, and an end-to-end pass against real PostgreSQL including the affordability
filter against a hand-set Coin balance.
