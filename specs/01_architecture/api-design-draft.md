# API design (comprehensive)

Supersedes the earlier draft. Same conventions: return DTOs, not EF entities directly; JSON in camelCase; dates as ISO 8601 UTC. Fixes one real gap the earlier version glossed over — `GET /redemptions/mine` returns *your own* redemptions, which is the wrong data source for the Notices tab's "partner achievements" section; that's corrected below with a scoped query instead.

## Quick reference

| Method & path | Purpose | Who |
|---|---|---|
| `POST /api/auth/register` | create account | anyone |
| `POST /api/auth/login` | authenticate | anyone |
| `GET /api/auth/me` | current user summary | authenticated |
| `POST /api/households` | create a household (also copies the default Activity/Reward templates into this household's own rows — see below) | authenticated, no household yet |
| `POST /api/households/join` | join via invite code | authenticated, no household yet |
| `GET /api/households/{id}` | details + both members | either partner |
| `PATCH /api/households/{id}` | rename | either partner |
| `POST /api/households/{id}/leave` | leave (frees the household or deletes it if last member) | either partner |
| `GET /api/activities` | catalog: this household's own chores (started as copies of the suggested defaults, or added custom — no distinction once copied) | either partner |
| `POST /api/activities` | add a custom chore | either partner |
| `PATCH /api/activities/{id}` / `DELETE /api/activities/{id}` | edit/remove any of this household's chores | either partner |
| `POST /api/activity-logs` | log a chore | either partner |
| `GET /api/activity-logs?status=pending` | approval queue | either partner (excludes own logs) |
| `GET /api/activity-logs/mine` | own history, optional `?status=` filter | either partner |
| `PATCH /api/activity-logs/{id}/approve` | approve | the other partner only |
| `PATCH /api/activity-logs/{id}/reject` | reject with reason | the other partner only |
| `POST /api/activity-logs/bulk-approve` | approve several at once | the other partner only |
| `GET /api/households/{id}/competitions/current` | live standing, triggers lazy settlement | either partner |
| `GET /api/households/{id}/competitions/history` | past settled periods | either partner |
| `POST /api/households/{id}/competitions/{id}/open-box` | reveal loot box result | the winner (or either partner on a win-win); idempotent |
| `GET /api/rewards` | catalog: this household's own rewards (same copy-on-creation model as activities) | either partner |
| `POST /api/rewards` / `PATCH /api/rewards/{id}` / `DELETE /api/rewards/{id}` | manage any of this household's rewards | either partner |
| `POST /api/redemptions` | redeem a reward | either partner |
| `GET /api/redemptions/mine` | own redemption history | either partner |
| `GET /api/redemptions?scope=household&excludeMine=true` | partner's redemptions, for the Notices feed | either partner |
| `GET /api/badges` | all badges + unlocked state | either partner |

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

Own logs the partner has approved (lighter, bottom section):
```
GET /api/activity-logs/mine?status=approved
→ 200 { "items": [ { "id": 85, "activityTitle": "Vacuum", "approvedAt": "2026-07-28T18:00:00Z" } ] }
```

### 4. Store

```
GET /api/rewards?sort=coinCost
→ 200 { "items": [ { "id": 5, "title": "Takeout of choice", "coinCost": 30 } ], "total": 8 }

POST /api/redemptions
{ "rewardId": 5 }
→ 201 { "id": 41, "rewardId": 5, "redeemedAt": "2026-07-29T11:00:00Z" }
→ 400 { "error": "Not enough Coins" }
```
This query previously read `?sort=coinCost&category=all`. Corrected during task [7]: rewards have
no category column — `relational-model.md`, `er-diagram.md` and `project-plan.md`'s attribute list
all agree the columns are `id, title, coin_cost, pauses_competition, household_id`, and the
parameter had been copied from the adjacent activities query, which does have a real category.
Adding a single-valued category to rewards purely to satisfy the parameter would have been dead
code.

That leaves the store's filter axis open, since `wireframes.md` screen 4 promises
sort/filter/search/pagination. The filter the screen actually implies is **affordability** — it
already disables Redeem when the balance is short, so "show only what I can afford" is the natural
control. Settle that in tasks [28]/[51] rather than here.

If the redeemed reward has `pausesCompetition: true` (e.g. "full chore day off"), that day's daily competition is voided for both partners as a side effect — no winner/loser recorded, no daily loot box for either side. Applies to the calendar day of redemption, not a scheduled future day (no date picker in scope). `GET .../competitions/current` reflects this with `"voided": true` on that day's daily entry once redeemed. Weekly/monthly totals are unaffected — they're independent Points sums, not derived from daily results.

### 5. Me

```
GET /api/auth/me
GET /api/badges
→ 200 { "items": [ { "id": 2, "name": "3-day win streak", "unlocked": true, "unlockedAt": "2026-07-27T00:00:00Z" }, { "id": 3, "name": "First redemption", "unlocked": false } ] }

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
