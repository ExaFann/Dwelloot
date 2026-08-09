## Task

[27] Add badges list endpoint: `GET /api/badges` with unlocked/locked state per user.

## Spec

Source material: `api-design.md` (the `GET /api/badges` worked example on screen 5),
`relational-model.md` (`badges(id, name, criteria)`, `user_badges(id, unlocked_at, *user_id,
*badge_id)`), `wireframes.md` screen 5 ("badge grid"), and logs `008` (the entities and the seed) and
`026` (the unlock logic this reads back).

`api-design.md`:

```
GET /api/badges
→ 200 { "items": [ { "id": 2, "name": "3-day win streak", "unlocked": true,
                     "unlockedAt": "2026-07-27T00:00:00Z" },
                   { "id": 3, "name": "First redemption", "unlocked": false } ] }
```

### This closes a verification gap, and that is half the point of the task

Log `026` had to record that badge unlocks "cannot be read back over HTTP until task [27] adds
`GET /api/badges`", so all of [26]'s unlock behaviour rests on unit tests. The endpoint is small; the
end-to-end pass at the bottom of this log is the part that pays off the debt. Approving a first chore
and then _seeing_ First chore unlocked over HTTP is the check that has been unavailable since task
[9] seeded the badges.

### `criteria` is returned — answering log `008`'s open question

Log `008` flagged that `api-design.md`'s example returns `name`, `unlocked` and `unlockedAt` but not
`criteria`, and left the decision to this task. **Included.**

`Badge.Criteria` exists for exactly this: its own doc comment calls it "human-readable 'how do I earn
this', shown on the badge grid". `wireframes.md` screen 5 is a grid of all six badges, most of them
locked for most of a new household's life. A locked badge with no requirement text is a grey square
that tells the user nothing — the column would be written, seeded, pinned by a test (log `026` asserts
the thresholds against this copy), and then never read by anything. That is the definition of dead
data.

Additive to the response, no schema change. `api-design.md`'s example gets updated rather than left
stale.

### `unlockedAt` is emitted as `null` when locked, not omitted

`api-design.md`'s locked example omits the key entirely. `DateTime?` under this project's JSON
settings serialises as `"unlockedAt": null` instead, and that is kept deliberately: log `021` made
the same call for `ActivityLogDecisionResponse.ApprovedAt` — "reject returns `"approvedAt": null` and
a client parses one shape for both outcomes". A client that has to branch on key presence rather than
value is worse off, and TypeScript models a nullable field more naturally than an optional one.
Recorded as a divergence from the worked example, and the example is updated.

### The response envelope is not `PagedResponse<T>`

`api-design.md` documents `{ "items": [...] }` with no `total`, and this endpoint takes **no query
parameters at all** — no page, no page size, no filter, no sort. A dedicated
`BadgeListResponse(Items)` matches that exactly.

Reusing `PagedResponse<T>` would add a `total` whose own doc comment says it is "how many rows match
the filters in total, **not** how many are in `Items` — that is what lets the UI render 'showing 5 of
12' and size its pager". With six fixed rows, no filters and no pager, `total` is always
`items.Length`. The project has form for both directions here: fields were _added_ where a client
needed them (`skipped`, `rejectReason`, `pointsAwarded`) and a documented parameter was _removed_
where it had no column behind it (`?category=all`, log `006`). A redundant `total` belongs in the
second group.

### No household scope — deliberately unlike every other list endpoint

`GET /api/activities`, `GET /api/rewards` and both activity-log lists open with a household check and
return **409** when the caller has none, because their data is household-owned. Badges are the one
catalog with **no `household_id`** (log `008`), and `user_badges` hangs off the user, not the
household.

So a caller with no household gets a 200 and the full all-locked grid. That is the honest answer:
they genuinely have no badges yet, and none of the six criteria can be met without a household
anyway. Adding a 409 would be copying a guard rather than applying one.

### The read does not write

`GET .../competitions/current` triggers settlement, so a read-that-writes is already precedent here.
This one deliberately does not call `EvaluateBadgesAsync`.

The reason settlement has to happen on read is that periods close on wall-clock time and there is no
scheduler — nothing else _can_ notice a boundary passed. Badge criteria are different: every one of
them changes only as the result of a write, and every such write already evaluates — settlement (task
[26]), approve and bulk-approve (task [26]'s amendment to [21]/[22]), and redemption (task [30]'s
recorded obligation). There is no path that satisfies a criterion without evaluation running.

One residual staleness is worth naming rather than papering over: streak badges depend on
`CurrentWinStreak`, which is recomputed at settlement, which is lazy. Three unopened winning days
leave both the streak _and_ the streak badge behind until someone loads the dashboard. That is
settlement's laziness, not this endpoint's — `users.current_win_streak` is equally stale on
`GET /api/auth/me` — and fixing it here would mean settling a household from a route that has no
household id in it. Task [24] owns that surface.

### Ordering

`OrderBy(Id)`, explicitly. That is the seeded order — First chore, 3-day, First redemption, 7-day,
Century, Big spender — which reads as rough progression order and, more importantly, is **stable**:
a badge grid that reshuffles itself when you unlock something is a worse grid. Sorting unlocked-first
was considered and rejected for that reason.

The explicit sort is not decoration. PostgreSQL guarantees no order without an `ORDER BY`, and log
`016` established that the in-memory provider hides exactly this class of bug because
LINQ-to-Objects `OrderBy` is stable. A test asserts the order; **the test cannot fail if the sort is
dropped**, so the claim rests on the end-to-end pass. Said here rather than left implied.

> **Superseded during implementation.** The sentence above was written before mutation testing and
> is wrong to give up so early — dropping the `OrderBy` did survive the test as first written, and
> the fix was to build a fixture that makes the sort observable rather than to document the hole.
> See Results. The original is kept rather than edited, per log `008`'s convention.

### Shape

A new `IBadgeQueryService` in `Services/Progression/`, mirroring the split already in
`Services/Competitions/`: `ICompetitionSettlementService` writes, `ICompetitionQueryService` reads.
`IProgressionService` is the write side of progression, so the read side is its sibling rather than a
seventh method on it.

Status enum + payload record per the house convention, with two members — `Ok` and `UserNotFound`.
The user lookup is the same one every other read service opens with, and it is not ceremony: without
it, a token naming a user who does not exist would get a cheerful 200 with six locked badges instead
of a 401.

Implemented as two queries and a client-side join rather than a `GroupJoin`. Six catalog rows against
at most six unlock rows — the join is over a rounding error, and the readable version is worth more
than a left-join expression tree.

| File                                            | Change                                                 |
| ----------------------------------------------- | ------------------------------------------------------ |
| `API/Dtos/Badges/BadgeDtos.cs`                  | New. `BadgeResponse`, `BadgeListResponse`.             |
| `API/Services/Progression/BadgeQueryService.cs` | New. `IBadgeQueryService`, status enum, result record. |
| `API/Controllers/BadgesController.cs`           | New. One `GET`.                                        |
| `API/Program.cs`                                | Register `IBadgeQueryService`.                         |
| `Tests/Services/Progression/BadgeListTests.cs`  | New.                                                   |
| `specs/01_architecture/api-design.md`     | `criteria` and the explicit `unlockedAt: null`.        |

## Test requirement

A real test file: `Tests/Services/Progression/BadgeListTests.cs`.

Standing countermeasures from the earlier logs apply — a **decoy household created first** so the
subject is never id 1, plus `Assert.NotEqual(1, ...)` to guard that premise, and **both directions**
asserted wherever "per-user" is the claim.

1. All six badges come back for a user with nothing unlocked, every one `unlocked: false` with
   `unlockedAt: null`.
2. An unlocked badge reports `unlocked: true` and the stored `UnlockedAt`, while the rest stay locked
   in the same response.
3. **Per-caller, both directions.** Alex unlocks one badge and Sam a _different_ one; each list shows
   the caller's own unlock and the partner's as locked. Asserting only one side would pass against a
   service that ignored `userId` for a household-wide join.
4. `criteria` is populated for locked badges too — the reason it is in the response at all.
5. `name` and `criteria` match the seeded `badges` rows, read from `db.Badges` rather than restated as
   literals, so the DTO cannot drift from the seed.
6. Items are ordered by id, and the ids are exactly the `BadgeCode` values — so a seventh badge
   appears without touching this endpoint. (See the ordering caveat above: this assertion is
   insensitive to the sort being removed. **Split into two tests during implementation, one of which
   is sensitive — see Results.**)
7. A user with **no household** still gets all six. Pins the deliberate absence of the household
   guard.
8. An unknown user id returns `UserNotFound`, not a 200 of locked badges.
9. **Listing writes nothing.** `user_badges` is unchanged afterwards, asserted **through a second
   context** (`TestDbContextFactory.Create(name)`, log `015`) so the check is about the store and not
   the change tracker. This is what pins the "no `EvaluateBadgesAsync` on read" decision.
10. The count is driven by the enum, not a literal `6`.

Then the standard closeout: mutation testing, and an end-to-end pass against real PostgreSQL that
finally reads a badge unlock back over HTTP.
