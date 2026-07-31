## Task

[29] Add rewards create/update/delete endpoints: either partner may edit/delete any of their
household's own rewards — same reasoning as [18].

## Spec

The sibling of task [18] (log `017`), and built to mirror it — including the reversal [18] had to make
part-way through.

### Archive-on-delete, decided up front this time

Log `028` flagged that `reward → redemptions` is **`Cascade`**, so a hard delete would take the
reward's redemption rows with it. **Owner confirmed: archive, exactly as activities do.** So
`Reward.ArchivedAt` (nullable) is added and `DELETE /api/rewards/{id}` sets it rather than deleting the
row.

Worth writing down _why_ it matters for rewards specifically, because the consequences are not the
same as they were for chores. `redemptions` is read in three places:

1. **The daily void check** in settlement (`HasPausingRedemptionAsync`) — this is the integrity hole,
   and it is the direct mirror of the one log `017` had to close. A partner redeems "Full chore day
   off" today; the _other_ partner deletes that reward before the period settles; the redemption row
   cascades away; the void condition no longer holds and the day settles as an ordinary win/lose. One
   partner would be able to change a competition outcome by editing the shared catalog.
2. **Badge counts** — First redemption and Big spender count `redemptions` rows, so a delete would set
   the partner's Big-spender progress back. (An already-unlocked badge survives, since
   `EvaluateBadgesAsync` only ever inserts.)
3. **The Notices partner-redemptions feed** — the partner's history would silently lose entries.

Archiving keeps the row, so all three are untouched. Same shape as log `017`: _the current
competition must not be rewritten by a catalog edit._

Two consequences beyond the delete path:

- **`competitions.bonus_reward_id` can no longer be orphaned through the API.** It is `SetNull`, and
  the handover carries a note for this task — "deleting a reward that was once a loot box prize leaves
  `bonus_reward_id` null, render as 'a bonus reward (since removed)'". With archiving, nothing the API
  does can null it; only deleting the household can, and that cascades the competitions too. The
  column stays nullable because most competitions award Coins rather than a bonus reward, so a client
  must still handle null — but it no longer needs a "since removed" case. Recorded so task [53] does
  not build one.
- **`LootBoxService`'s doc comment is currently wrong, and this task makes it true.**
  `EligibleRewardPoolAsync` already says "Archived rewards are excluded too — they are no longer part
  of the store", written in task [25] against a column that did not exist. The query has no such
  filter. Adding one here is required, not optional: an archived reward must not be handed out as a
  loot box prize, because opening the box writes a zero-cost `Redemption` for it and would resurrect a
  reward the household removed.

### Where archived rewards must _not_ be filtered

Stated explicitly, because the natural instinct is to add the filter everywhere and two of these
would be bugs:

| Reader                                                   | Filter archived? | Why                                                                                                                                                                         |
| -------------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RewardService.ListAsync`                                | **Yes**          | It is the store catalog. Removed means not offered.                                                                                                                         |
| `LootBoxService.EligibleRewardPoolAsync`                 | **Yes**          | Winning a removed reward would resurrect it.                                                                                                                                |
| `CompetitionSettlementService.HasPausingRedemptionAsync` | **No**           | The redemption already happened. Filtering here would let archiving a reward retroactively un-void a settled or in-progress day — the exact hole archiving exists to close. |
| `LootBoxService.DescribeAsync` (past prize lookup)       | **No**           | A box already opened must keep describing its prize. `SingleAsync` would throw if this filtered.                                                                            |
| `POST /api/redemptions` (task [30])                      | **Yes**          | Recorded as an obligation below — you cannot buy what is not in the store.                                                                                                  |

A comment goes on the settlement query saying so, since "why is there no archived filter here" is the
question a future reader will ask.

### `PausesCompetition` is client-settable — the rejected alternative is worth recording

The first instinct was to withhold it: it is the only reward property that changes how scoring
behaves, `DefaultRewards` calls it "the single, deliberate exception, and only 'Full chore day off'
uses it", and the pattern for a field a client must not control already exists twice — `HouseholdId`
is absent from both activity request DTOs precisely so the change cannot be expressed.

**Rejected, because it prevents nothing.** The thing that actually gates abuse is the _price_: at 80
Coins the day off is a rare, considered purchase; at 1 Coin it is spammable. But price is already
fully client-controlled through `PATCH` — a partner can edit "Full chore day off" from 80 Coins to 1
whatever this task does. Withholding the flag would leave the exploit intact while adding two real
costs:

- It breaks §3.1's "every row is equally owned and equally editable" — the whole point of
  copy-on-creation. The copied day-off row would carry a capability no user-created row could ever
  have.
- Archiving that one row would destroy the capability permanently, with no way to recreate it.

So it is settable on create and clearable on update, symmetrically. The real mitigation is the one
every document already asks for and task [28] just enabled: the store **discloses** what a pausing
reward does at the point of redemption, derived from the flag. Disclosure, not restriction.

### Otherwise identical to task [18]

- Either partner may create, edit or archive **any** of the household's rewards. No default-vs-custom
  distinction — after copy-on-creation there is nothing to distinguish (§3.1).
- `HouseholdId` is absent from both request DTOs, so no request can create a reward in someone else's
  household or move one between households.
- Editing or re-archiving an **archived** reward → **404**. It is no longer in the catalog.
- **404 for both "no such reward" and "another household's reward"**, byte-identically, so ids cannot
  be enumerated.
- `CoinCost` must be positive: `[Range(1, int.MaxValue)]` on the DTO, an application check returning
  **400**, and the existing `ck_rewards_coin_cost_positive` database constraint underneath. Three
  layers, as with `points > 0`.
- Titles are trimmed. `PATCH` treats null as "leave alone".
- `DELETE` returns **204**, matching activities.

### A finding for task [30]: `Redemption` has no cost snapshot

`ActivityLog.PointsAwarded` exists because editing a chore would otherwise re-value every unsettled
log (§3.3, log `018`). **`Redemption` has no equivalent `CoinsSpent` column**, and this task is the one
that makes reward prices editable, so the mirror-image drift becomes reachable: edit a reward from 30
Coins to 5 and every past purchase of it reads as having cost 5.

Latent rather than live today — nothing creates redemptions until [30], and no documented response
returns a redemption's cost. But by the same logic that put `PointsAwarded` in task [19] (the task that
_creates_ logs, not the one that edits chores), a `CoinsSpent` snapshot belongs in **[30]**. Recorded
there rather than pre-empted here; adding a column for rows that cannot yet exist would be building
[30] inside [29].

| File                                                        | Change                                                             |
| ----------------------------------------------------------- | ------------------------------------------------------------------ |
| `API/Entities/Reward.cs`                                    | Add `ArchivedAt`.                                                  |
| `API/Migrations/…_ArchiveRewardsInsteadOfDeleting.cs`       | New. One nullable column.                                          |
| `API/Dtos/Rewards/RewardDtos.cs`                            | Add `CreateRewardRequest`, `PatchRewardRequest`.                   |
| `API/Services/RewardService.cs`                             | Add create/update/archive; `ListAsync` filters archived.           |
| `API/Controllers/RewardsController.cs`                      | Add `POST`, `PATCH`, `DELETE`.                                     |
| `API/Services/Competitions/LootBoxService.cs`               | Exclude archived from the prize pool — makes its own comment true. |
| `API/Services/Competitions/CompetitionSettlementService.cs` | Comment recording why the void check does _not_ filter archived.   |
| `Tests/Services/RewardServiceMutationTests.cs`              | New.                                                               |

## Test requirement

A real test file, `Tests/Services/RewardServiceMutationTests.cs`, mirroring
`ActivityServiceMutationTests` and carrying the standing countermeasures: a **decoy household created
first** so the subject is never id 1, persistence asserted **through a second context**, and rejected
writes asserted to have **left the row unchanged** rather than merely returned an error.

**Create**

1. Adds a reward to the caller's household, persisted (second context).
2. A caller with no household → `NoHousehold`.
3. Non-positive `CoinCost` (0 and negative) → `InvalidCoinCost`, and **nothing is inserted**.
4. `PausesCompetition` round-trips as set.
5. Titles are trimmed.

**Update** 6. Changes the supplied fields. 7. **Leaves omitted fields alone** — the whole point of PATCH. 8. Refuses another household's reward and **leaves it unchanged**. 9. Non-positive `CoinCost` → `InvalidCoinCost`, row unchanged. 10. `PausesCompetition` can be both set and cleared.

**Archive** 11. Removes the reward from `ListAsync` while **the row survives** (second context, `ArchivedAt` set). 12. **Redemptions of an archived reward survive** — the integrity property this whole approach exists
for, and the direct analogue of log `017`'s "keeps the logged history". 13. **An archived pausing reward still voids its day.** Constructed as a real settlement: a redemption
of a pausing reward inside a closed period, the reward then archived, and the period settled →
still `IsVoided`. This is the hole a hard delete opened; asserting the error message alone would
not prove it closed. 14. An archived reward can no longer be edited or archived again → `NotFound`. 15. Refuses another household's reward, which stays listed for its owner. 16. **Archived rewards are excluded from the loot box prize pool** — makes `LootBoxService`'s existing
comment true, and asserted by archiving every non-pausing reward and confirming the roll cannot
return one. 17. A default-copied reward behaves exactly like a custom one — no default-vs-custom distinction.

Then mutation testing and an end-to-end pass against real PostgreSQL, including a `psql` check that
`archived_at` is set rather than the row deleted.
