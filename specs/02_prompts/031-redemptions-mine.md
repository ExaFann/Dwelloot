## Task

[31] Add redemption history endpoint: `GET /api/redemptions/mine`.

## Spec

`api-design.md`'s quick reference lists it as "own redemption history", and unlike most endpoints there
is **no worked example** for its response — the store section shows only `POST /api/redemptions`, and
the Notices section shows the _household-scoped_ query, which is a different endpoint (see the gap
below). So the item shape is this task's call, taken from what the two consuming screens actually need.

The direct sibling is `GET /api/activity-logs/mine` (task [22a], log `022`), and this is built to match
it: same paging vocabulary, same scoping rule, same newest-first ordering.

### A gap in the plan, of exactly the shape [22a] was

`api-design.md` documents **two** redemption read endpoints:

| Path                                                    | Purpose                                         | Task                |
| ------------------------------------------------------- | ----------------------------------------------- | ------------------- |
| `GET /api/redemptions/mine`                             | own history                                     | **[31]** — this one |
| `GET /api/redemptions?scope=household&excludeMine=true` | the partner's redemptions, for the Notices feed | **none**            |

The second has no backend task, and frontend task **[49]** ("Notices tab — partner
achievements/redemptions section") consumes it. `api-design.md` is emphatic about it — it opens by
saying the earlier draft's use of `/redemptions/mine` for that section was "the wrong data source" and
that this scoped query is the correction.

This is the same situation as `GET /api/activity-logs/mine` before log `021` flagged it: documented,
depended on by a frontend task, covered by no backend task. That was resolved by adding **[22a]** rather
than renumbering, precisely because task numbers are referenced throughout the logs and the code.

**Recommended: add it as [31a].** Not built here — the working agreement is one task per turn, and
folding a second endpoint into [31] would be exactly the batching that rule prevents. It is a sibling
of this task and would reuse the same service and controller. Flagged for a decision.

### Item shape

`{ id, rewardId, rewardTitle, coinsSpent, redeemedAt }`.

- **`rewardTitle`** — a history of ids is not a history. It also demonstrates why task [29] archives
  rather than deletes: the reward row survives, so a purchase of a since-removed reward still resolves
  its title instead of showing a hole.
- **`coinsSpent`** — recorded as an obligation in log `030`. It is a real column now
  (`redemptions.coins_spent`), snapshotted at purchase time, and the entire reason it exists is to be
  displayed rather than recomputed from the reward's current price. Reading it back here is what makes
  the snapshot observable at all.
- **`rewardId`** kept alongside the title so a client can link to the store entry.

Deliberately **not** included: `pausesCompetition`. It would explain why a past day was voided, which is
mildly interesting, but no documented screen asks for it and adding a field on a guess is the padding
that kept `category` out of `ActivityResponse` (log `016`). Additive later if [55] wants it.

### Archived rewards are included, and that is the point

A redemption of a since-archived reward stays in the history. Archiving removes a reward from the store,
not from what already happened — the same rule log `022` applied to logs of archived chores. Given task
[29] exists specifically so these rows survive, filtering them out here would undo it at the read layer.

Worth a test, because "filter archived" is now the habit in two other queries and the instinct to be
consistent is what would break it.

### Scoping — the caller **and** their current household

Filtered to `UserId == caller` and the reward's household matching the caller's.

The user filter alone is correct in the narrow sense — they are the caller's own purchases either way —
but log `022` chose to add the household filter so that someone who left a household and joined another
does not see their old household's history bleed into the new one, and consistency between the two
`/mine` endpoints is worth more than a marginal argument either way. The rejected alternative is a
lifetime history that spans households; it can be reinstated by deleting one clause.

**The household is reached through `reward.household_id`, never through the redeemer's
`user.household_id`** — §3.15's rule, and the reason it exists: `users.household_id` is nullable and
cleared on leaving, so joining that way silently returns wrong data.

### Paging and ordering

`PagedResponse<T>`, with `take` / `page` / `pageSize` exactly as log `022` settled them: `take` is an
alias for a page size (`api-design.md` uses `?take=5` on the sibling endpoint), `pageSize` wins if both
are given, values are clamped rather than rejected, and the cap is 100.

Ordered **newest first** — `RedeemedAt` descending with `Id` descending as the tiebreaker. Two
redemptions can share a timestamp closely enough to tie, and without the tiebreaker paging can repeat or
drop rows (log `016`). The index `(user_id, redeemed_at)` added in task [8] exists for this query;
`RedemptionConfiguration`'s comment already says so.

There is no status filter — redemptions have no status. The sibling's `?status=` has no counterpart here.

| File                                       | Change                                           |
| ------------------------------------------ | ------------------------------------------------ |
| `API/Dtos/Redemptions/RedemptionDtos.cs`   | Add `MyRedemptionQuery`, `MyRedemptionResponse`. |
| `API/Services/RedemptionService.cs`        | Add `ListMineAsync` + result record.             |
| `API/Controllers/RedemptionsController.cs` | Add `GET /api/redemptions/mine`.                 |
| `Tests/Services/RedemptionHistoryTests.cs` | New.                                             |

## Test requirement

`Tests/Services/RedemptionHistoryTests.cs`, carrying the standing countermeasures: a **decoy household
first**, **both directions** asserted wherever "own" is the claim, and **absolute literals** for
boundaries.

1. Returns the caller's redemptions with the right total and the right fields.
2. **Own only, both directions** — Alex sees Alex's and not Sam's, _and_ Sam sees Sam's and not Alex's.
   Asserting one side would pass against a service that ignored the user filter and returned the
   household's.
3. Another household's redemptions never appear, asserted on ids.
4. **Newest first**, with ties broken by descending id — ties constructed by hand with **explicit ids
   inserted in ascending order**, so insertion order and the expected order disagree. Log `016`'s trap:
   with the in-memory provider's stable sort, a fixture whose natural order already matches the sort key
   cannot fail. Same fix as logs `027` and `028`.
5. **`coinsSpent` is the stored snapshot, not the reward's current price** — redeem at 30, edit the
   reward to 5, and the history still reads 30. The obligation from log `030`, now observable.
6. **A redemption of an archived reward is still listed, with its title intact.** The property task [29]
   exists to protect.
7. `take` limits the page while `total` stays the unpaginated count.
8. `pageSize` wins over `take` when both are supplied.
9. Page size is capped, seeded **past** the cap — asserting a cap against a handful of rows is vacuous
   (log `016`'s first survivor).
10. `page` below 1 clamps to the first page.
11. **Paging through the whole history yields every row exactly once** — the property a missing
    tiebreaker actually breaks.
12. A caller with no household gets `NoHousehold`, not an empty page; an unknown user gets
    `UserNotFound`.
13. A user with no redemptions gets an empty page and `total: 0` — the legitimate empty state, distinct
    from the error above.

Then mutation testing and an end-to-end pass against real PostgreSQL.
