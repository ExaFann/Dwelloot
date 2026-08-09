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
| `GET /api/households/{id}/competitions/history` | **Built as `[36a]`.** The "what have we won" feed: one row per *opened* box, so a win-win gives two. Driven off `competition_claims`, not `competitions` — a competition has no single "who" or "when" once both partners open it. Reuses `result` / `coinsAwarded` / `reward` from `open-box`. Paged with the usual `take`/`page`/`pageSize`. | ✅ |
| `POST /api/households/{id}/competitions/{id}/open-box` | reveal loot box result | the winner (or either partner on a win-win); idempotent |
| `GET /api/rewards` | catalog: this household's own rewards (same copy-on-creation model as activities); `?affordable=` filters on the caller's Coin balance | either partner |
| `POST /api/rewards` / `PATCH /api/rewards/{id}` / `DELETE /api/rewards/{id}` | manage any of this household's rewards; `DELETE` **archives** the row so its redemptions survive | either partner |
| `POST /api/redemptions` | redeem a reward | either partner |
| `GET /api/redemptions/mine` | own redemption history | either partner |
| `GET /api/redemptions?scope=household&excludeMine=true` | partner's redemptions, for the Notices feed | either partner |
| `GET /api/badges` | all badges + unlocked state | either partner |

## Health and deployment (task [37])

| Path | |
|---|---|
| `/health` | **200** if the database is reachable, **503** if not — anonymous, and with an empty body either way |

The body is empty deliberately: an unauthenticated endpoint should not describe why the database is
unhappy, the same disclosure rule the error handler follows. It is what a platform polls, and the
"at least one endpoint is reachable live" check this project is measured by.

Deployment configuration is entirely environment variables — `ASPNETCORE_ENVIRONMENT`,
`ConnectionStrings__Default`, `Jwt__Key`, `Cors__AllowedOrigins__0`. Two behaviours exist purely for
running behind a platform:

- **`PORT` is honoured** when `ASPNETCORE_URLS` is not already set, binding `0.0.0.0`. Render, Railway
  and Fly publish the port that way; Azure App Service sets `ASPNETCORE_URLS` itself and wins.
- **Forwarded headers are trusted**, so `X-Forwarded-Proto: https` stops HTTPS redirection firing behind
  an edge that has already terminated TLS. Without it every request — preflights included — redirects in
  a loop.

**Migrations are applied at startup** in every environment except Development, where they stay a
deliberate `dotnet ef database update`. Several platforms have no release-command step, so a first
deploy would otherwise connect successfully and then fail every query.

Note that `appsettings.json` ships **no** CORS origins. Environment-variable array overrides are applied
per index, so a shipped default at index 1 would survive a deployment that sets only index 0 — the dev
origins therefore live in `appsettings.Development.json`, which a deployment never loads.

## Interactive docs (task [34])

The API serves its own OpenAPI 3.1 document and a Scalar UI:

| Path | |
|---|---|
| `/openapi/v1.json` | the OpenAPI document — 21 paths |
| `/scalar` | the interactive reference |

Both are available in **every environment**, not Development only, so the deployed backend from task
[37] has a human-visible surface. That is a considered trade-off: an OpenAPI document enumerates routes
and payload shapes, but it exposes no data, every endpoint behind it still requires a valid JWT, and an
assessed project whose deployed API answers only 404 demonstrates nothing.

The document declares an HTTP **bearer** security scheme (`JWT` format) at the document level, so
Scalar's "send request" button can authenticate — paste the token from `POST /api/auth/login`. Without
it, all but two endpoints would answer 401 and the page would be a listing rather than something you can
try.

Scalar's assets are served by the application itself (`/scalar/scalar.js` and friends), not from a CDN,
so the docs work on a deployment with no outbound internet access and under a strict CSP.

## CORS (task [35])

The browser-based frontend calls this API cross-origin, so a named policy allows it:

- Allowed origins come from `Cors:AllowedOrigins`. `appsettings.json` ships **none**;
  `appsettings.Development.json` holds Vite's dev origins (`http://localhost:5173` and
  `http://127.0.0.1:5173`, both spellings, since they are distinct origins), and a deployment sets its
  own with `Cors__AllowedOrigins__0` and friends. See the note under Health and deployment for why the
  defaults were moved out of the base file in task [37].
- The frontend holds up its end: the Vite dev server pins port 5173 with `strictPort` (task [38]), so
  a busy port fails at startup instead of silently moving the app to 5174 — an origin this policy does
  not allow, and whose failure is invisible server-side. A request from 5174 gets a normal 401 or a
  204 preflight; only the missing `Access-Control-Allow-Origin` distinguishes it, and only the browser
  acts on that.
- **Never `AllowAnyOrigin`.** Origins are named.
- **No `AllowCredentials`.** Authentication is a JWT in the `Authorization` header, not a cookie, so
  nothing needs the browser to attach anything automatically — which removes the CORS-plus-cookie CSRF
  surface rather than mitigating it. `Access-Control-Allow-Credentials` is absent from every response.
- Any header and any method, so `Authorization`, `Content-Type` and `PATCH`/`DELETE` all work.

A configured origin's trailing slash is stripped before use. `https://app.example.com/` would otherwise
never match: the `Origin` header is scheme + host + port with no trailing slash, and the comparison is
literal. A path, query or fragment is deliberately left alone — that is a misconfiguration the deployer
should see rather than have quietly repaired.

A request from a disallowed origin still gets a normal response; it simply lacks
`Access-Control-Allow-Origin`. The server does not block — the browser does. Non-browser clients (curl,
the deployed frontend's server-side calls, Scalar) are unaffected by any of this.

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

### Known exception — `POST /api/auth/register` (found in task [42], not yet fixed)

**One endpoint does not keep the contract above.** When ASP.NET Identity rejects a registration —
most commonly a duplicate email — `AuthController.cs:46` returns `ValidationProblem(ModelState)`,
which emits **ProblemDetails** instead of this API's envelope:

```json
{ "type": "https://tools.ietf.org/html/rfc9110#section-15.5.1",
  "title": "One or more validation errors occurred.",
  "status": 400,
  "errors": { "DuplicateEmail":    ["Email 'alex@example.com' is already taken."],
              "DuplicateUserName": ["Username 'alex@example.com' is already taken."] },
  "traceId": "00-…-00" }
```

Differences that matter to a client: the message is under **`title`**, not `error`; `type` and
`status` are added; and the same problem is reported twice, because Identity treats the email as both
a duplicate email and a duplicate username.

This is the **only** `ValidationProblem` or `Problem()` call in the API — verified by grep — so the
envelope holds everywhere else, including every other failure of this same endpoint. It is on the
first request a new user ever makes.

**Frontend status:** handled, not blocked. `toApiError` falls back to `title`, and the two `Duplicate*`
messages surface through the unclaimed-field-error path, since neither key is bound to a form input.
So registration reports duplicates correctly today.

**Backend fix when someone picks it up:** map `IdentityResult.Errors` into `this.Failure(...)` with
the standard envelope, the way every other controller does. That also removes the duplicated message.
Until then this section is the record that the invariant above has one documented exception.

### Undocumented status — `POST /api/auth/login` returns **423**

Also found in [42]. After five failed attempts the lockout from task [13] engages and login answers
**423 Locked**, "Too many failed attempts. Try again later." The envelope is correct; the status was
simply missing from these walkthroughs. A client that only distinguishes "wrong password" from
"server error" tells a locked-out user to keep guessing, which extends the lockout each time.

Note also that a **failed login is 401**, not 400 — the same status as a missing or expired token,
and distinguishable only by the message. A client that treats every 401 as a dead session will sign
users out when they mistype a password.

The 404-not-403 rule still holds. `traceId` varies per *request*, not per outcome, so "not found" and
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

#### Open gap — the quick log is not a curated list, and the API cannot make it one (owner, 2026-08-05)

What [46] actually built is **not** the `pageSize=5` row above. `QuickLogTiles` calls
`GET /api/activities?category=Chore&sort=title` with **no page size**, so it renders the household's
whole chore catalogue as tiles, capped only by `ActivityService.DefaultPageSize` (**20**).

Two consequences, and the second is a defect rather than a missing feature:

1. **The user cannot choose what appears there.** "Quick log" implies a short list of the chores you
   actually reach for; it is currently every chore you own, in alphabetical order.
2. **It silently truncates at 20.** A household that adds nine custom chores gets a 21-item catalogue
   and a quick log that drops one with no pagination, no indication, and no way to influence which.

**Nothing in the schema can express this.** `activities` is
`id, title, points, category, household_id, archived_at` and `ActivityResponse` is
`{ id, title, points }` — there is no favourite, pinned, or display-order field, and no per-user
preference table anywhere in the model.

Three ways to close it, recorded so the choice is made rather than defaulted into. See `[18a]`.

| | Approach | Cost | Trade-off |
|---|---|---|---|
| **A** | A boolean on `activities` (`is_quick_log`), returned by `ActivityResponse`, settable on create/patch, filterable via `?quickLog=true` | One column, one migration, one query param | **Household-shared** — both partners see one quick list. Consistent with §3.1's "every row is equally owned and equally editable", which is the model the whole catalogue already follows |
| **B** | A per-user join table (`user_quick_activities`) | New table, new endpoints | Each partner curates their own. More faithful to two people with different habits, and materially more work |
| **C** | Derive it from logging frequency — the caller's most-logged chores | **No schema change**; the client already has `/api/activity-logs/mine` | Not user-editable, which is the thing being asked for. Records habit, not intent |

**A is the recommendation**: it matches the household-shared ownership model already in use, and the
client change lands inside `ChoreEditor`, which already exists. Whichever is chosen, that task also
has to decide **whether the quick list is capped** — a "quick" log of thirty tiles is not quick.

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
shows the *partner's* activity. It had no backend task; **built as [31a]**, the same way
`GET /api/activity-logs/mine` became [22a].

The response carries two fields beyond the example above — `rewardId`, so a feed entry naming a catalog
item carries its identifier instead of forcing a title match, and `coinsSpent`, the snapshot from task
[30]. Without the snapshot the feed would show a reward's *current* price against a past purchase, and
"they redeemed the day off" reads very differently at 80 Coins than at whatever it was repriced to
since.

`scope` is optional and `household` is the only implemented value; anything else is a **400** rather
than a silent fallback. The direction of the fallback is why: a client that mistypes `scope` or
`excludeMine` and is quietly handed the whole household's rows has received *more* data than it asked
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
redemption, that redeeming the day off voids that day's duel for *both* partners — and that copy is
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
