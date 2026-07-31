## Task

[30] Add redemption create endpoint + unit tests: balance check against Coins, rejects
insufficient/negative/tampered costs.

## Spec

From `api-design.md`:

```
POST /api/redemptions
{ "rewardId": 5 }
→ 201 { "id": 41, "rewardId": 5, "redeemedAt": "2026-07-29T11:00:00Z" }
→ 400 { "error": "Not enough Coins" }
```

This task arrives carrying **four obligations recorded by earlier logs**, and closes a verification gap
the handover has been tracking since task [24]. Those are listed first, because they are most of the
work.

### Obligation 1 — `EvaluateBadgesAsync` must be called (log `026`)

Two of the six badges — First redemption and Big spender — count `redemptions` rows. Log `026` wired
badge evaluation into settlement, approve and bulk-approve, and recorded that redemption was the
remaining trigger. Without it, spending Coins for the first time would not unlock First redemption until
the next day boundary.

### Obligation 2 — archived rewards must be excluded (log `029`)

You cannot buy what is not in the store. `RewardService.FindOwnedAsync` is the lookup to copy: it
matches on id **and** household **and** `ArchivedAt == null`, so "no such reward", "another household's
reward" and "archived reward" collapse into one **404** with a byte-identical body, and ids cannot be
enumerated.

### Obligation 3 — `Redemption` needs a cost snapshot (log `029`)

`ActivityLog.PointsAwarded` exists because editing a chore would otherwise re-value every unsettled log
(§3.3). Task [29] made reward prices editable, so the mirror-image drift is now reachable: without a
snapshot, editing a reward from 30 Coins to 5 makes every past purchase of it read as having cost 5.

So **`Redemption.CoinsSpent`** is added, copied from `Reward.CoinCost` at redemption time, constrained
`> 0` in the database exactly as `points_awarded` is. This is the second half of a symmetry the schema
now states in both directions: neither a catalog price nor a catalog point value can rewrite history.

### Obligation 4 — the balance check is application-level (handover §6)

`coins >= coin_cost` compares `users.coins` against `rewards.coin_cost` — two tables — so a portable
row-level `CHECK` cannot see it. It stays in application code, returning **400**, per §3.14's constraint
boundary.

But `coins >= 0` _is_ a single-row rule, so by the same boundary it belongs in the database. A new
`ck_users_coins_not_negative` check constraint goes in this task's migration. It is not the race fix
(see below) — it is the backstop against any single write path that would overdraw, including a future
refactor that forgets the application check.

### "Tampered costs" — structurally unexpressible

The task says the endpoint must reject tampered costs. It cannot receive one: the request body is
`{ "rewardId": 5 }` and the cost is read from the reward row on the server. There is no cost field to
tamper with, the same way `CreateActivityRequest` has no `HouseholdId` — "a body that cannot express the
change beats one that is filtered afterwards" (log `017`).

Worth a test regardless, asserting `CoinsSpent` equals the reward's current `CoinCost` and the balance
falls by exactly that, so the value is provably server-derived.

Negative costs are equally unreachable: `[Range(1, int.MaxValue)]` on `CoinCost` (task [29]), the
application guard, and `ck_rewards_coin_cost_positive` (task [7]) all stand between a client and a
non-positive price.

### The concurrent double-redeem race — named, not fixed, and here is why

Two simultaneous redemptions both read `coins = 30`, both pass the check, both write `coins = 0`. The
user gets two rewards for one balance. A double-clicked Redeem button makes this the most plausible race
in the app — more so than the approve race §3.13 added a token for, because it is a user action rather
than a timing coincidence.

Three fixes were considered and all three were rejected:

1. **A concurrency token on `User.Coins`.** §3.13's established pattern, and free in DDL terms. Rejected
   because it is _not_ free in behaviour: a concurrency token joins the `WHERE` clause of **every**
   update to that row, so settlement writing win streaks, approval crediting `LifetimePoints`, and a
   loot box crediting Coins would all throw `DbUpdateConcurrencyException` if a redemption committed in
   their read-to-write window. That turns a dashboard `GET` into a 500, and handling it would mean
   editing four services belonging to tasks [21], [23] and [25].
2. **An atomic `ExecuteUpdateAsync` decrement** — `UPDATE users SET coins = coins - @cost WHERE id = @id
AND coins >= @cost`, with zero rows affected meaning insufficient. Correct and surgical. **Rejected
   after empirical check: the in-memory provider does not support it** — it throws
   `InvalidOperationException: The methods 'ExecuteUpdate' and 'ExecuteUpdateAsync' are not supported by
the current database provider`. That would make the entire feature untestable in the existing suite,
   not merely one assertion. A fifth confirmed divergence for §4.3.
3. **A serializable transaction or `SELECT … FOR UPDATE`.** Also correct; also unverifiable in-memory,
   since that provider ignores transactions.

So the implementation is read-check-write, the `coins >= 0` constraint is the backstop against a
negative balance, and **the race is recorded as deferred debt with its fix**: adopt option 2 and accept
that the happy path's unit coverage moves to end-to-end, or add option 1 plus concurrency handling in the
four User-writing services. This is a knowing simplification of the same kind as one app-level timezone
(§3.6), and it is stated rather than left for someone to find.

Note the constraint does **not** catch this race, and the reason is worth writing down so nobody assumes
it does: EF writes absolute values, so both racing updates set `coins = 0` and neither goes negative.

### Closes a tracked verification gap

The handover's "things that cannot be verified over HTTP yet" lists **`voided: true` (log `024`) — needs
`POST /api/redemptions` from [30]**. Redeeming a `PausesCompetition` reward is the only thing that voids
a day, and until now nothing could create a redemption. The end-to-end pass will redeem the day off and
read `voided: true` back from `GET .../competitions/current`.

### Shape

`RedemptionService` in `API/Services/`, status enum plus payload record per the house convention.

Response is `{ id, rewardId, coinsSpent, coinsRemaining, redeemedAt }` — two fields beyond
`api-design.md`'s example:

- **`coinsSpent`**, because it is now a real column and the confirmation should say what was charged.
- **`coinsRemaining`**, the authoritative post-spend balance. The store screen disables Redeem on an
  insufficient balance, so it has to re-evaluate the moment a purchase succeeds; returning the server's
  number avoids both an extra `/auth/me` round trip and a wrong figure on screen if the client's cached
  balance was stale.

| File                                                 | Change                                                                |
| ---------------------------------------------------- | --------------------------------------------------------------------- |
| `API/Entities/Redemption.cs`                         | Add `CoinsSpent`.                                                     |
| `API/Data/Configurations/RedemptionConfiguration.cs` | `coins_spent > 0` check; refresh the now-stale reward-delete comment. |
| `API/Data/Configurations/UserConfiguration.cs`       | `ck_users_coins_not_negative`.                                        |
| `API/Migrations/…_SnapshotCoinsOnRedemption.cs`      | New. Column + backfill + two check constraints.                       |
| `API/Dtos/Redemptions/RedemptionDtos.cs`             | New. `CreateRedemptionRequest`, `RedemptionResponse`.                 |
| `API/Services/RedemptionService.cs`                  | New.                                                                  |
| `API/Controllers/RedemptionsController.cs`           | New. `POST /api/redemptions`.                                         |
| `API/Program.cs`                                     | Register `IRedemptionService`.                                        |
| `Tests/Services/RedemptionServiceTests.cs`           | New.                                                                  |

The migration adds a non-nullable column to a table that may already hold hand-inserted rows (log
`025`'s `psql` snippet), and the `> 0` constraint would reject a default of 0. So the generated
migration is hand-edited to **backfill from `rewards.coin_cost` between the `AddColumn` and the
`AddCheckConstraint`**.

## Test requirement

`Tests/Services/RedemptionServiceTests.cs`, with the standing countermeasures: a **decoy household
first** so the subject is never id 1, persistence asserted **through a second context**, rejected writes
asserted to have **changed nothing**, and boundaries expressed as **absolute literals** rather than in
terms of the values under test.

1. A successful redemption is persisted, with `CoinsSpent` and `RedeemedAt` set (second context).
2. **The balance falls by exactly the cost** — asserted with absolute literals (balance 50, cost 30,
   expect 20), not `before - cost`.
3. **`InsufficientCoins` when the balance is short, and nothing changes** — no redemption row, balance
   untouched. Assert the absence.
4. **The boundary is inclusive**: a balance exactly equal to the cost succeeds and leaves 0. Asserted on
   its own with literals, so a `>` / `>=` slip cannot hide.
5. A balance one Coin short fails. The other half of the boundary.
6. **An archived reward is `RewardNotFound`** — obligation 2.
7. Another household's reward is `RewardNotFound`, **and that household's owner can still redeem it**,
   so the guard is scoping rather than a blanket refusal.
8. A nonexistent reward id is `RewardNotFound`.
9. No household → `NoHousehold`; unknown user → `UserNotFound`.
10. **`CoinsSpent` is the reward's price at redemption time, and editing the reward afterwards does not
    change it** — obligation 3, the whole reason for the column. Redeem at 30, `PATCH` the reward to 5,
    re-read the redemption: still 30.
11. **First redemption unlocks immediately** — obligation 1, asserted through the badge rows rather than
    through a return value.
12. **Big spender unlocks on the fifth redemption and not the fourth** — absolute counts.
13. **A `PausesCompetition` redemption voids that day's competition** — driven through real settlement,
    not asserted on a flag. The behaviour `api-design.md` promises and nothing could reach until now.
14. An ordinary redemption does **not** void the day. The contrast test, without which 13 passes against
    a service that voids everything.
15. Both partners can redeem from the same catalog, and each spends only their own Coins — asserted in
    **both directions**.

Then mutation testing, and an end-to-end pass against real PostgreSQL that must include `voided: true`
from `GET .../competitions/current`.
