# API design (comprehensive)

Supersedes the earlier draft. Same conventions: return DTOs, not EF entities directly; JSON in camelCase; dates as ISO 8601 UTC. Fixes one real gap the earlier version glossed over — `GET /redemptions/mine` returns _your own_ redemptions, which is the wrong data source for the Notices tab's "partner achievements" section; that's corrected below with a scoped query instead.

## Quick reference

| Method & path                                                                | Purpose                                                                                                                                | Who                                                     |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `POST /api/auth/register`                                                    | create account                                                                                                                         | anyone                                                  |
| `POST /api/auth/login`                                                       | authenticate                                                                                                                           | anyone                                                  |
| `GET /api/auth/me`                                                           | current user summary                                                                                                                   | authenticated                                           |
| `POST /api/households`                                                       | create a household (also copies the default Activity/Reward templates into this household's own rows — see below)                      | authenticated, no household yet                         |
| `POST /api/households/join`                                                  | join via invite code                                                                                                                   | authenticated, no household yet                         |
| `GET /api/households/{id}`                                                   | details + both members                                                                                                                 | either partner                                          |
| `PATCH /api/households/{id}`                                                 | rename                                                                                                                                 | either partner                                          |
| `POST /api/households/{id}/leave`                                            | leave (frees the household or deletes it if last member)                                                                               | either partner                                          |
| `GET /api/activities`                                                        | catalog: this household's own chores (started as copies of the suggested defaults, or added custom — no distinction once copied)       | either partner                                          |
| `POST /api/activities`                                                       | add a custom chore                                                                                                                     | either partner                                          |
| `PATCH /api/activities/{id}` / `DELETE /api/activities/{id}`                 | edit/remove any of this household's chores                                                                                             | either partner                                          |
| `POST /api/activity-logs`                                                    | log a chore                                                                                                                            | either partner                                          |
| `GET /api/activity-logs?status=pending`                                      | approval queue                                                                                                                         | either partner (excludes own logs)                      |
| `GET /api/activity-logs/mine`                                                | own history, optional `?status=` filter                                                                                                | either partner                                          |
| `PATCH /api/activity-logs/{id}/approve`                                      | approve                                                                                                                                | the other partner only                                  |
| `PATCH /api/activity-logs/{id}/reject`                                       | reject with reason                                                                                                                     | the other partner only                                  |
| `POST /api/activity-logs/bulk-approve`                                       | approve several at once                                                                                                                | the other partner only                                  |
| `GET /api/households/{id}/competitions/current`                              | live standing, triggers lazy settlement                                                                                                | either partner                                          |
| `GET /api/households/{id}/competitions/history`                              | past settled periods                                                                                                                   | either partner                                          |
| `POST /api/households/{id}/competitions/{id}/open-box`                       | reveal loot box result                                                                                                                 | the winner (or either partner on a win-win); idempotent |
| `GET /api/rewards`                                                           | catalog: this household's own rewards (same copy-on-creation model as activities); `?affordable=` filters on the caller's Coin balance | either partner                                          |
| `POST /api/rewards` / `PATCH /api/rewards/{id}` / `DELETE /api/rewards/{id}` | manage any of this household's rewards; `DELETE` **archives** the row so its redemptions survive                                       | either partner                                          |
| `POST /api/redemptions`                                                      | redeem a reward                                                                                                                        | either partner                                          |
| `GET /api/redemptions/mine`                                                  | own redemption history                                                                                                                 | either partner                                          |
| `GET /api/redemptions?scope=household&excludeMine=true`                      | partner's redemptions, for the Notices feed                                                                                            | either partner                                          |
| `GET /api/badges`                                                            | all badges + unlocked state                                                                                                            | either partner                                          |

## Error responses (task [33])

Every error, from any source — a controller, model validation, an unhandled exception, or a status the
pipeline never wrote a body for — has one shape:

```
{ "error": "Reward not found.", "errors": null, "traceId": "00-…-00" }

{ "error": "One or more fields are invalid.",
  "errors": { "Title": ["Title must contain at least one visible character…"],
              "Points": ["The field Points must be between 1 and 2147483647."] },
  "traceId": "00-…-00" }

{ "error": "An unexpected error occurred.", "errors": null, "traceId": "00-…-00" }
```

- `error` is always a human-readable sentence. Every message documented in the walkthroughs below is
  unchanged.
- `errors` is the per-field map from model validation, and is **always present, null when empty** — a
  client tests its value rather than a key's presence.
- `traceId` correlates the response with the server logs, and is the same id the log line records.

`ProblemDetails` was considered and rejected: it would rewrite every documented example for fields this
API does not need (`status` duplicates the status line, `type` would point at an RFC section), while
still needing the field map bolted on.

**Unhandled exceptions return no detail in any environment** — not the message, not the type, not a
stack trace. The exception is logged in full server-side; the caller gets the trace id to quote. A
request the client aborted is logged at information level and writes nothing.

Two responses that used to have empty bodies now do not: an unmatched route (**404**, "That endpoint
does not exist.") and an unauthenticated request (**401**, "Authentication is required.").

The 404-not-403 rule still holds. `traceId` varies per _request_, not per outcome, so "not found" and
"not yours" remain indistinguishable — the bodies are identical once the trace id is masked.

## Screen walkthroughs

Each section: what the screen fetches on load, what actions it can trigger, and example payloads. Field names match `relational-model.md` in camelCase.

### Onboarding (not in `wireframes.md` as a numbered screen, but needed before any of them apply)

Register →

```
POST /api/auth/register
{ "name": "Alex", "email": "alex@example.com", "password": "•••••" }
→ 201 { "id": 1, "name": "Alex", "email": "alex@example.com" }
```

Log in →

```
POST /api/auth/login
{ "email": "alex@example.com", "password": "•••••" }
→ 200 { "token": "...", "user": { "id": 1, "name": "Alex" } }
```

Check pairing state (drives routing: no household yet → pairing screen, household set → main app) →

```
GET /api/auth/me
→ 200 { "id": 1, "name": "Alex", "householdId": null, "lifetimePoints": 0, "coins": 0, "currentWinStreak": 0 }
```

Create a household →

```
POST /api/households
{ "name": "Our place" }
→ 201 { "id": 10, "name": "Our place", "inviteCode": "7F3K9Q", "isFull": false }
```

Server-side, this also copies the default Activity/Reward templates into household 10's own rows — no separate call needed, and nothing in the response changes to reflect it (the new household's `GET /api/activities` and `GET /api/rewards` are simply already populated).

Join with a partner's code →

```
POST /api/households/join
{ "inviteCode": "7F3K9Q" }
→ 200 { "id": 10, "isFull": true }
→ 409 { "error": "This household already has 2 members" }
```

### 1. Dashboard

On load:

```
GET /api/auth/me
→ 200 { "id": 1, "name": "Alex", "householdId": 10, "lifetimePoints": 240, "coins": 60, "currentWinStreak": 2 }

GET /api/households/10/competitions/current
→ 200 {
  "periodType": "Daily", "periodStart": "2026-07-29T00:00:00Z", "periodEnd": "2026-07-30T00:00:00Z",
  "myPoints": 15, "partnerPoints": 10, "settled": false, "voided": false,
  "unopenedLootBox": null
}
```

`voided: true` (with `settled` staying `false` and `unopenedLootBox` staying `null`) means someone redeemed a `pausesCompetition` reward for this day — no winner will be computed for it.
If a period closed since the last check, `unopenedLootBox` is populated instead of `null`:

```
"unopenedLootBox": { "competitionId": 55, "periodType": "Daily", "won": true, "isWinWin": false }
```

Quick-add row and recent feed:

```
GET /api/activities?category=Chore&pageSize=5&sort=title
→ 200 { "items": [ { "id": 3, "title": "Wash dishes", "points": 10 } ], "total": 12 }

GET /api/activity-logs/mine?take=5
→ 200 { "items": [ { "id": 88, "activityTitle": "Wash dishes", "status": "Approved", "completedAt": "2026-07-28T19:03:00Z" } ] }
```

Opening a revealed loot box:

```
POST /api/households/10/competitions/55/open-box
→ 200 { "competitionId": 55, "result": "coins", "coinsAwarded": 18 }
  or  { "competitionId": 55, "result": "bonusReward", "reward": { "id": 7, "title": "Foot massage" } }
```

### 2. Log activity

```
GET /api/activities?category=Chore&sort=title
→ 200 { "items": [ { "id": 3, "title": "Wash dishes", "points": 10 } ], "total": 12 }

POST /api/activity-logs
{ "activityId": 3 }
→ 201 { "id": 90, "activityId": 3, "status": "Pending", "completedAt": "2026-07-29T09:15:00Z" }
```

### 3. Notices

Pending queue (top section) — always excludes the caller's own logs:

```
GET /api/activity-logs?status=pending
→ 200 { "items": [ { "id": 90, "activityTitle": "Wash dishes", "loggedByUserId": 2, "completedAt": "2026-07-29T09:15:00Z" } ] }

POST /api/activity-logs/bulk-approve
{ "ids": [90, 91] }
→ 200 { "approved": [90, 91] }

PATCH /api/activity-logs/90/approve
→ 200 { "id": 90, "status": "Approved", "approvedAt": "2026-07-29T10:00:00Z" }

PATCH /api/activity-logs/90/reject
{ "reason": "Not actually done yet" }
→ 200 { "id": 90, "status": "Rejected" }
```

Partner's achievements/redemptions (middle section) — this is the corrected query, not `/redemptions/mine`:

```
GET /api/redemptions?scope=household&excludeMine=true
→ 200 { "items": [ { "id": 40, "userId": 2, "rewardTitle": "Takeout of choice", "redeemedAt": "2026-07-28T20:00:00Z" } ] }
```

That query is the **household-scoped** one, and it is a different endpoint from
`GET /api/redemptions/mine` — using `/mine` here was the earlier draft's mistake, since the section
shows the _partner's_ activity. It had no backend task; **built as [31a]**, the same way
`GET /api/activity-logs/mine` became [22a].

The response carries two fields beyond the example above — `rewardId`, so a feed entry naming a catalog
item carries its identifier instead of forcing a title match, and `coinsSpent`, the snapshot from task
[30]. Without the snapshot the feed would show a reward's _current_ price against a past purchase, and
"they redeemed the day off" reads very differently at 80 Coins than at whatever it was repriced to
since.

`scope` is optional and `household` is the only implemented value; anything else is a **400** rather
than a silent fallback. The direction of the fallback is why: a client that mistypes `scope` or
`excludeMine` and is quietly handed the whole household's rows has received _more_ data than it asked
for. `excludeMine` defaults to false, so an unfiltered call honestly means the whole household.

With `excludeMine=true`, this and `GET /api/redemptions/mine` **partition** the household's redemptions
— every row appears in exactly one of them. Paging is `take` / `page` / `pageSize` as elsewhere, newest
first, capped at 100.

A **departed** partner's redemptions stay in the feed: membership is resolved through
`reward.household_id`, never the redeemer's `user.household_id`, which is nullable and cleared on
leaving. Redemptions of **archived** rewards stay too, with their titles.

Own logs the partner has approved (lighter, bottom section):

```
GET /api/activity-logs/mine?status=approved
→ 200 { "items": [ { "id": 85, "activityTitle": "Vacuum", "approvedAt": "2026-07-28T18:00:00Z" } ] }
```

### 4. Store

```
GET /api/rewards?sort=coinCost&affordable=true&search=massage&page=1&pageSize=20
→ 200 { "items": [ { "id": 5, "title": "Takeout of choice", "coinCost": 30, "pausesCompetition": false } ], "total": 8 }

POST /api/redemptions
{ "rewardId": 5 }
→ 201 { "id": 41, "rewardId": 5, "coinsSpent": 30, "coinsRemaining": 20, "redeemedAt": "2026-07-29T11:00:00Z" }
→ 400 { "error": "Not enough Coins." }
→ 404 { "error": "Reward not found." }
```

Task [30] added two response fields and settled the error surface.

`coinsSpent` is a **snapshot** of the reward's price, stored on the redemption row
(`redemptions.coins_spent`). Task [29] made prices editable, so without it every past purchase would
re-price itself whenever the reward changed — the same reason `activity_logs.points_awarded` exists.
`coinsRemaining` is the authoritative post-spend balance, so the store can re-evaluate its disabled
Redeem buttons without a second call to `/auth/me` and without trusting a possibly stale cached figure.

The request body is **only** `rewardId`. There is no cost field, so a tampered price is not something a
client can express — the charge is read from the reward row on the server. Extra fields in the body are
ignored.

`404 { "error": "Reward not found." }` covers a nonexistent reward, another household's reward, and an
**archived** reward alike, byte-identically, so ids cannot be enumerated. A caller with no household
gets 409.

The affordability rule is `coins >= coinCost` — **inclusive**, so a balance of exactly the price
completes the purchase and leaves zero. It lives in application code because it compares two tables;
`coins >= 0` is a single-row rule and lives in the database as `ck_users_coins_not_negative`.

Own purchase history (task [31]), used by the Me screen:

```
GET /api/redemptions/mine?take=5
→ 200 { "items": [ { "id": 41, "rewardId": 5, "rewardTitle": "Takeout of choice",
                     "coinsSpent": 30, "redeemedAt": "2026-07-29T11:00:00Z" } ], "total": 12 }
```

Newest first, with `take` / `page` / `pageSize` behaving exactly as on `GET /api/activity-logs/mine`
(`take` is a page size; `pageSize` wins if both are given; the cap is 100). Scoped to the caller **and**
their current household, so leaving a household does not bleed its history into the next one.

`coinsSpent` is the stored snapshot, so a purchase keeps its price even after the reward is repriced —
this endpoint is what makes that column observable. Purchases of **archived** rewards stay in the
history with their titles intact: archiving removes a reward from the store, not from what already
happened.
This query previously read `?sort=coinCost&category=all`. Corrected during task [7]: rewards have
no category column — `relational-model.md`, `er-diagram.md` and `project-plan.md`'s attribute list
all agree the columns are `id, title, coin_cost, pauses_competition, household_id`, and the
parameter had been copied from the adjacent activities query, which does have a real category.
Adding a single-valued category to rewards purely to satisfy the parameter would have been dead
code.

That left the store's filter axis open, since `wireframes.md` screen 4 promises
sort/filter/search/pagination. The filter the screen actually implies is **affordability** — it
already disables Redeem when the balance is short, so "show only what I can afford" is the natural
control.

**Settled in task [28]: the filter axis is affordability.** `?affordable=true` narrows to rewards the
caller's Coin balance covers, `?affordable=false` is the complement (the "what am I saving for" view),
and omitting it filters nothing. The boundary is inclusive — a reward priced at exactly the balance is
affordable, because that purchase can be completed. `sort` is `title` or `coinCost` with an optional
`descending`; an unknown value is a 400 rather than a silent fallback. `pageSize` is capped at 100.

**Also added in task [28]: `pausesCompetition` on each item.** The example above originally showed
`{ id, title, coinCost }` only. The flag is required here because the store must warn, at the point of
redemption, that redeeming the day off voids that day's duel for _both_ partners — and that copy is
deliberately **derived from this flag** rather than stored in a description column, so it cannot drift
from what settlement actually does (see `Reward.PausesCompetition` and `DefaultRewards`). Before this
endpoint the column was read by settlement and the loot-box pool only and exposed by nothing, which
would have left task [51] matching on the reward's title.

There is deliberately no per-item `affordable` flag: it is `coinCost <= coins`, and the client holds
both halves already — the cost is in the item and the balance comes from `GET /api/auth/me`.

Managing the catalog (task [29]) — either partner may edit or remove any of the household's rewards,
with no default-vs-custom distinction, exactly as for chores:

```
POST /api/rewards
{ "title": "Breakfast in bed", "coinCost": 50, "pausesCompetition": false }
→ 201 { "id": 201, "title": "Breakfast in bed", "coinCost": 50, "pausesCompetition": false }
→ 400 { "error": "Coin cost must be greater than zero." }

PATCH /api/rewards/201        // null/omitted fields are left alone
{ "coinCost": 65 }
→ 200 { "id": 201, "title": "Breakfast in bed", "coinCost": 65, "pausesCompetition": false }

DELETE /api/rewards/201
→ 204
→ 404 { "error": "Reward not found." }
```

**`DELETE` archives the reward; it does not delete the row.** `redemptions` cascades from `rewards`, and
those rows are not merely history — settlement reads them to decide whether a `pausesCompetition`
purchase voided a day, the First-redemption and Big-spender badges count them, and the Notices feed
lists them. A hard delete would let one partner un-void a day the other had paid to pause, and set
their badge progress back. So the row survives with `archived_at` set: it stops appearing in
`GET /api/rewards` and in the loot-box prize pool, while everything that already happened is untouched.
Same reasoning and same shape as `DELETE /api/activities/{id}`.

Consequences worth knowing:

- Editing or re-deleting an archived reward is a **404**, as is another household's reward and a
  nonexistent id — byte-identically, so ids cannot be enumerated.
- **`competitions.bonus_reward_id` can no longer be orphaned through the API.** It is `SetNull`, but
  nothing the API does deletes a reward any more. The column stays nullable because most competitions
  award Coins rather than a bonus reward, so clients must still handle null — but there is no "reward
  since removed" case to render.
- `pausesCompetition` **is** client-settable on create and update. Withholding it was considered and
  rejected: price is what actually gates abuse of a day-off reward and price is editable regardless, so
  withholding the flag would prevent nothing while breaking "every row equally editable" and making the
  seeded day-off reward impossible to recreate once archived. The mitigation is disclosure — the store
  shows what a pausing reward does at the point of redemption, which is why `GET /api/rewards` returns
  the flag.

If the redeemed reward has `pausesCompetition: true` (e.g. "full chore day off"), that day's daily competition is voided for both partners as a side effect — no winner/loser recorded, no daily loot box for either side. Applies to the calendar day of redemption, not a scheduled future day (no date picker in scope). `GET .../competitions/current` reflects this with `"voided": true` on that day's daily entry once redeemed. Weekly/monthly totals are unaffected — they're independent Points sums, not derived from daily results.

### 5. Me

```
GET /api/auth/me
GET /api/badges
→ 200 { "items": [ { "id": 2, "name": "3-day win streak", "criteria": "Win the daily duel three days in a row.", "unlocked": true, "unlockedAt": "2026-07-27T00:00:00Z" }, { "id": 3, "name": "First redemption", "criteria": "Spend Coins in the Store for the first time.", "unlocked": false, "unlockedAt": null } ] }
```

Two additions to the badges response were made during task [27], both to the payload only — the
`badges(id, name, criteria)` schema is unchanged.

`criteria` is now returned. Task [9] had left this open, since the original example omitted it: the
column holds the badge grid's "how do I earn this" line, and screen 5 renders all six badges whether
or not they are unlocked, so a locked badge without it is a grey square. `unlockedAt` is now shown
explicitly as `null` when locked rather than omitted, so a client parses one shape either way — the
same call task [21] made for `approvedAt` on a rejected log.

The endpoint takes no query parameters and is **not** household-scoped: badges are the one catalog
with no `household_id`, and unlocks belong to the user. A caller with no household gets all six,
all locked, rather than the 409 the activity and reward lists return.

```
GET /api/households/10
→ 200 { "id": 10, "name": "Our place", "inviteCode": "7F3K9Q", "members": [ { "id": 1, "name": "Alex" }, { "id": 2, "name": "Sam" } ] }

PATCH /api/households/10
{ "name": "The Nest" }
→ 200 { "id": 10, "name": "The Nest" }

POST /api/households/10/leave
→ 200 { "left": true }
```

## Before building out every entity — one vertical slice first

Still true: don't build every entity's CRUD before deploying once. Get Activity → migration → one endpoint → deployed and reachable, first. Competition settlement is the riskiest piece — build and test it in isolation before wiring it to the UI or these screen walkthroughs.
