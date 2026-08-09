## Task

[8] Add Redemption entity: class + EF configuration.

## Spec

Source material: `relational-model.md` (`redemptions(id, redeemed_at, *user_id, *reward_id)`),
`er-diagram.md`, `api-design.md` (`POST /api/redemptions`, `GET /api/redemptions/mine`,
`GET /api/redemptions?scope=household&excludeMine=true`), and `wireframes.md` screens 3 and 4.

### Entity

`API/Entities/Redemption.cs` — the smallest entity in the model, four columns:

| Property              | Type        | Notes                                                      |
| --------------------- | ----------- | ---------------------------------------------------------- |
| `Id`                  | `int`       | Surrogate PK.                                              |
| `UserId` / `User`     | `int` / nav | Who spent the Coins.                                       |
| `RewardId` / `Reward` | `int` / nav | What they bought. Supplies `rewardTitle` in API responses. |
| `RedeemedAt`          | `DateTime`  | Set server-side. Load-bearing — see below.                 |

### `RedeemedAt` carries more weight than it looks

It is not just an audit timestamp. Task [23] reads it to answer "did either partner redeem a
`PausesCompetition` reward during this calendar day?", which is what voids a daily competition.
That makes the **calendar day** of this column part of the scoring rules, and gives it two
consequences worth stating now rather than discovering in [23]:

- It must be stored UTC and compared as a calendar day in a consistent zone. Postgres
  `timestamp with time zone` is what EF already emits for `DateTime`, so the column type is right;
  the day-boundary decision itself belongs to [23], which owns period maths for daily/weekly/monthly
  alike. Flagged, not settled here.
- The pause applies to the day of redemption only. There is deliberately no scheduling — no future
  date can be chosen — so this column is always "now" at insert time.

### Delete behaviours

- **`RewardId` → `rewards`: Cascade.** Same forced reasoning as `ActivityLog.ActivityId` in task
  [6]: households cascade to rewards, so restricting here would make deleting a household fail on
  its own cascade. Deleting a reward therefore erases its redemption history. Nothing derived
  breaks — `Coins` is a stored running total, not recomputed from redemptions, so a deleted
  redemption does not refund anyone.
- **`UserId` → `users`: Restrict.** Consistent with both user FKs on `ActivityLog`: v1 has no
  user-deletion flow, and Restrict forces a later account-deletion feature to decide deliberately
  what happens to spend history.

One edge case the cascade creates, recorded for [23] and [29]: deleting a `PausesCompetition`
reward deletes the redemptions that voided days. For an **already settled** day that is harmless,
because settlement persists its own `Competition` row. For a day not yet settled, deleting the
reward would flip that day from voided back to a normal competition. Rare, and arguably correct —
but it should be a known consequence rather than a surprise.

### Index

One composite index on `(user_id, redeemed_at)`, replacing the plain FK index EF would create on
`user_id`. It serves `GET /api/redemptions/mine` including its reverse-chronological ordering.
The FK index on `reward_id` — created automatically — serves the join settlement uses to find
paused days.

### Scoping a redemption to a household: use the reward, not the user

`redemptions` has no `household_id`, matching `relational-model.md`, so the Notices query
`GET /api/redemptions?scope=household&excludeMine=true` has to reach the household indirectly.
There are two available paths and they are **not** equivalent:

- via `reward_id → rewards.household_id` — stable, because rewards are permanently household-owned.
- via `user_id → users.household_id` — **wrong**, because `users.household_id` is nullable and is
  set to null when someone leaves (task [4]). Joining that way would make a departed partner's
  entire redemption history vanish from the feed retroactively, and would misattribute history if
  they later joined a different household.

Recorded here so tasks [31] and [49] take the reward path. This is the same class of trap as
`activity_logs` having no `household_id` (noted in log `005`), but with a sharper failure mode:
that one is merely an extra join, this one silently returns wrong data.

### Why the balance check is not a database constraint

`POST /api/redemptions` must reject a purchase the user cannot afford —
`400 { "error": "Not enough Coins" }`. That rule is deliberately **not** expressed as a check
constraint, and the reason is the same one `relational-model.md` gives for the max-2-members rule:
it depends on a value in a different row of a different table (`users.coins`), which a portable
row-level `CHECK` cannot see.

This is the boundary that has been applied consistently across tasks [3]–[8]: rules comparing
columns within one row go to the database (`points > 0`, `coin_cost > 0`, no self-approval), rules
needing another row stay in application code (max 2 members, sufficient balance). Task [30] owns
the balance check and its tests.
