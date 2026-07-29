## Task

[10] Add Competition entity: class + EF configuration

## Spec

`project-plan.md` lists twelve columns for Competition; `relational-model.md` and `er-diagram.md`
list nine. The three missing ones are `UserAPoints`, `UserBPoints` and `BonusRewardId`. Separately,
`api-design.md` returns `"voided": true` from the current-standing endpoint, but no spec file has a
column for it.

This is not cosmetic — it decides whether tasks [23] and [25] can meet requirements the task decomposition
already states for them. Raised in review, and the **full column set was chosen**: the nine
documented, plus `bonus_reward_id`, `winner_points`, `loser_points`, `is_voided`. Thirteen columns.
`relational-model.md` and `er-diagram.md` are updated to match rather than left contradicting the
code.

Why each addition earns its place:

- **`bonus_reward_id`** (nullable) — task [25] requires `POST .../open-box` to be _idempotent on
  repeat calls_. The Coins outcome persists in `coins_awarded`; without this column the
  bonus-reward outcome has nowhere to live, so a second call could not return the same result. The
  requirement would have to be reworded rather than met.
- **`winner_points` / `loser_points`** — `project-plan.md`'s stated reason for persisting a
  competition at all is that the result is "stable on reload". Scores were the one part still
  recomputed from live `activity_logs`, and those logs are deletable: deleting a chore cascades
  away its history (task [6]). A past period would then display scores that no longer add up to
  the winner recorded beside them. Persisting both scores makes a settled row genuinely immutable.
- **`is_voided`** — same argument for the "day off" rule. Void status was derivable by looking for
  a `PausesCompetition` redemption in that day, but redemptions are deletable too (task [8]), so
  deleting the reward would silently un-void a past day.

**Naming:** `winner_points`/`loser_points` rather than `project-plan.md`'s `UserAPoints`/
`UserBPoints`, which never says which partner is A. Winner/loser is unambiguous, and on a win-win
the two values are equal by definition, so not recording whose is whose loses nothing.

### Entity

`API/Entities/Competition.cs`:

| Property                        | Type                    | Notes                                                                   |
| ------------------------------- | ----------------------- | ----------------------------------------------------------------------- |
| `Id`                            | `int`                   | Surrogate PK.                                                           |
| `HouseholdId` / `Household`     | `int` / nav             | Required.                                                               |
| `PeriodType`                    | `CompetitionPeriodType` | `Daily` / `Weekly` / `Monthly`. Enum → string, as with the other enums. |
| `PeriodStart` / `PeriodEnd`     | `DateTime`              | Half-open `[start, end)`.                                               |
| `WinnerUserId` / `Winner`       | `int?` / nav            | **Nullable** — null on a win-win and on a voided period.                |
| `WinnerPoints` / `LoserPoints`  | `int`                   | Equal on a win-win.                                                     |
| `IsWinWin`                      | `bool`                  | Genuine tie _and_ both partners had ≥1 approved log.                    |
| `IsVoided`                      | `bool`                  | A `PausesCompetition` reward was redeemed in this period.               |
| `CoinsAwarded`                  | `int`                   | Rolled at settlement. 0 when voided.                                    |
| `BonusRewardId` / `BonusReward` | `int?` / nav            | The rare drop, when the roll produced one instead of Coins.             |
| `SettledAt`                     | `DateTime`              | **Not nullable** — see below.                                           |

### A row exists if and only if the period has been settled

Settlement is lazy: `project-plan.md` has the first request after a period boundary compute and
persist the result. So no row is created while a period is live, which makes `SettledAt`
non-nullable and turns the row's existence into the "has this settled?" answer. No separate
`settled` flag is needed.

That is consistent with `api-design.md` returning `"settled": false, "voided": true` for the
current standing — that response describes a live period, computed on the fly, which by definition
has no row yet.

A voided period **does** get a row, with `IsVoided = true`, no winner and zero Coins. Writing the
void down is what makes it permanent; leaving it as "no row" would mean the period looked unsettled
forever and settlement would keep retrying it.

### Unique index on `(household_id, period_type, period_start)`

The most important constraint on this table, and it guards a real race. Lazy settlement fires on
the first request after a boundary — and this app has exactly two users who both open the dashboard
in the morning. Two concurrent `GET /competitions/current` calls would both find the period
unsettled and both try to settle it. Without the constraint that is two rows for one period, two
loot boxes, and doubled Coins.

With it, one insert wins and the other fails; task [24] can catch the violation and re-read the
winner's row. That is a well-trodden pattern and much simpler than locking.

### Delete behaviours

- **`HouseholdId` → `households`: Cascade.** The household owns its competition history.
- **`WinnerUserId` → `users`: Restrict**, consistent with every other user FK.
- **`BonusRewardId` → `rewards`: SetNull.** Forced, and the reasoning is worth recording: rewards
  cascade from households, so Restrict here would make deleting a household fail on its own
  cascade, while Cascade would delete competition _history_ because a prize was later removed from
  the store — clearly wrong. SetNull leaves the competition intact. Consequence for task [29]:
  deleting a reward that was once a loot box prize leaves that competition showing a bonus win with
  no reward attached. The UI should render that as "a bonus reward (since removed)" rather than
  crashing on a null.

### Two questions this task deliberately does not answer

Both belong to tasks [24]/[25], and both are recorded here so they are not discovered late:

1. **Win-win produces one prize, not two.** `coins_awarded` and `bonus_reward_id` are single
   columns, so on a tie both partners receive the _same_ rolled result rather than rolling
   independently. That is a coherent reading of `relational-model.md`'s note that a win-win is
   "tracked as two loot-box-claim events, not modeled as a separate table for v1", and it needs no
   extra columns — but [25] should confirm it is the intended feel before building the reveal.
2. **Nothing records that a loot box has been _opened_.** Because the roll happens at settlement
   and `open-box` merely reveals the stored value, [25]'s idempotency requirement is satisfied for
   free — the same call returns the same persisted result every time. But `api-design.md`'s
   dashboard payload includes `unopenedLootBox`, and "unopened" is not derivable from this schema.
   [25] must either add an `opened_at` column or decide the frontend tracks it. Flagged, not
   settled, since it is a behavioural decision rather than a shape one.
