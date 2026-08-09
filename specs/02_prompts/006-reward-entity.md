## Task

[7] Add Reward entity: class + EF configuration. `HouseholdId` required, same copy-on-creation
model as Activity. Add `PausesCompetition` (bool, default false) for rewards like "full chore day
off" that void a daily competition instead of guaranteeing the redeemer a loss (see [23]). Define
the default reward template list here too.

## Spec

Source material: `relational-model.md`
(`rewards(id, title, coin_cost, pauses_competition, *household_id)`), `er-diagram.md`,
`api-design.md` (`GET /api/rewards`, `POST /api/redemptions`), `wireframes.md` screen 4, and
`project-plan.md`'s "day off" rule.

### Entity

`API/Entities/Reward.cs` — deliberately close to `Activity`, since both are household-owned
catalog rows seeded by copy-on-creation:

| Property            | Type        | Notes                                              |
| ------------------- | ----------- | -------------------------------------------------- |
| `Id`                | `int`       | Surrogate PK.                                      |
| `Title`             | `string`    | Required, max 80 — same cap as `Activity.Title`.   |
| `CoinCost`          | `int`       | Priced in **Coins**, not Points. Must be positive. |
| `PausesCompetition` | `bool`      | Default false. See below.                          |
| `HouseholdId`       | `int`       | **Required**, not nullable.                        |
| `Household`         | `Household` | Reference navigation.                              |

No category property — see the spec discrepancy at the end of this section.

### `PausesCompetition`

The flag exists to stop a "full chore day off" reward from being self-defeating. Redeeming it
means contributing nothing that day, so under normal win/lose rules the redeemer would
mathematically lose the daily competition every single time they used the reward they had earned.
`project-plan.md` resolves this by voiding the day rather than handing the redeemer a loss: no
winner, no loser, no daily loot box for either partner.

Nothing enforces or interprets the flag in this task — it is a column that task [23] reads during
settlement, and task [30] writes a redemption against. Two scoping notes carried forward from
`project-plan.md` so [23] does not have to rediscover them:

- The pause applies to the **calendar day of redemption**, not a scheduled future day. There is
  deliberately no date picker to build.
- Weekly and monthly competitions are unaffected. They are independent Points sums, not derived
  from daily results, so a paused day just contributes fewer Points the way any quiet day would.

### EF configuration

`API/Data/Configurations/RewardConfiguration.cs`, mirroring `ActivityConfiguration`:

- `Title` required, `HasMaxLength(80)`.
- `PausesCompetition` default `false` in the database.
- `HouseholdId` required, `OnDelete(DeleteBehavior.Cascade)` — a reward catalog has no meaning
  without its household, same as the chore catalog.
- **A `coin_cost > 0` check constraint**, on the same reasoning as `points > 0` in task [5]:
  a portable row-level rule, and `project-plan.md` names validating Coin costs as part of the
  Security advanced requirement. A zero-cost reward would also be infinitely redeemable, which
  breaks the economy rather than merely being odd.

No collection navigation on `Household`, for the same reason as `Activity`: rewards are only ever
read through the paginated `GET /api/rewards`, never as a nested household object.

### Default reward templates

`API/Data/Defaults/DefaultRewards.cs`, alongside `DefaultActivities` from task [5]. Same
copy-on-creation model, same reasoning — a shared default row would be the same row every
household sees.

`record RewardTemplate(string Title, int CoinCost, bool PausesCompetition)`, eight entries.
Eight is chosen so `api-design.md`'s worked example — `GET /api/rewards` returning `"total": 8`
for an uncustomised household — stays literally true, the same way twelve chores kept the
activities example true. "Pick the takeout" at 30 Coins is fixed by that example.

Exactly one template sets `PausesCompetition` — "Full chore day off", priced highest at 80 Coins
because it voids a whole day's competition.

#### Selection rule (added during review — see the amendment section at the end)

**A default reward must be redeemable purely as a promise between the two partners, with no state
the system has to track.** `PausesCompetition` is the single deliberate exception.

The first draft of this list broke that rule twice, and the rule was written after review caught
it. Both offenders are described in the amendment section below.

### Spec discrepancy: `?category=all` on the rewards endpoint

`api-design.md`'s store walkthrough shows `GET /api/rewards?sort=coinCost&category=all`, but
rewards have no category. `relational-model.md`, `er-diagram.md` and `project-plan.md`'s attribute
list all agree the columns are `id, title, coin_cost, pauses_competition, household_id` — three
sources against one, and the parameter looks like it was copied from the adjacent activities query,
which does have a real category.

Resolution: no category column is added. Inventing one to satisfy a query parameter would mean a
single-valued enum on a table where nothing else asks for it, which is exactly the dead-code trap
avoided for `ActivityCategory` in task [5]. `api-design.md` is corrected instead, since the
kickoff asks for divergences to be fixed rather than left stale.

That leaves an open question this task does not answer: `wireframes.md` screen 4 promises
sort/filter/search/pagination on the store, and removing `category` removes the only documented
filter axis. The obvious candidate is affordability — "show only what I can afford" — which is
the filter the screen actually implies, given Redeem is disabled when the balance is short. That
is a UI decision belonging to tasks [28] and [51], flagged here rather than settled.
