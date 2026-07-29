# Task Decomposition

## Backend foundation

[1] [Initial solution and Web API scaffold]: `dotnet new sln` + `dotnet new webapi -n API -controllers`. _(Already done.)_
[2] [Add EF Core packages and DbContext skeleton]: Install EF Core + provider packages; add an empty `AppDbContext` and connection string configuration. No entities yet.
[3] [Add Household entity]: `Household` class + EF configuration (fluent API or attributes).
[4] [Add User entity with Identity integration]: `User` extending `IdentityUser` (or custom Identity-compatible class) + EF configuration.
[5] [Add Activity entity]: class + EF configuration. `HouseholdId` is required (not nullable) — every row belongs to exactly one household; defaults are copied in at household-creation time (task [14]), not stored as shared null-household rows. Define the default template list (name, points, category) as a static/code-level list here, ready for [14] to copy from.
[6] [Add ActivityLog entity]: class + EF configuration, including the `ApprovedByUserId ≠ LoggedByUserId` constraint expressed at the application level (documented in a code comment referencing `er-diagram-1`).
[7] [Add Reward entity]: class + EF configuration. `HouseholdId` required, same copy-on-creation model as Activity. Add `PausesCompetition` (bool, default false) for rewards like "full chore day off" that void a daily competition instead of guaranteeing the redeemer a loss (see [23]). Define the default reward template list here too.
[8] [Add Redemption entity]: class + EF configuration.
[9] [Add Badge and UserBadge entities]: both classes + EF configuration for the join relationship.
[10] [Add Competition entity]: class + EF configuration, including nullable `WinnerUserId`.
[11] [Create initial EF Core migration]: generate and apply the first migration against a local dev database.
[12] [Add default Activity/Reward template copy logic]: a service method that, given a household ID, copies the code-level default templates from [5]/[7] into that household's own `Activity`/`Reward` rows. Not a DB seed of shared rows — this runs per-household, invoked by [14].
[13] [Configure ASP.NET Core Identity]: registration + login wiring, password hashing confirmed working end to end.

## Backend business logic

[14] [Add household create endpoint]: `POST /api/households`. Also invokes the [12] copy logic so the new household starts with its own copies of the default Activities/Rewards.
[15] [Add household join endpoint]: `POST /api/households/join`, rejects once a household already has 2 members.
[16] [Add household details, rename, and leave endpoints]: `GET /api/households/{id}`, `PATCH /api/households/{id}`, `POST /api/households/{id}/leave`.
[17] [Add activities list endpoint]: `GET /api/activities` with sort/filter/search/pagination.
[18] [Add activities create/update/delete endpoints]: either partner may edit/delete any of their household's own activities — no default-vs-custom distinction, since every row is already household-owned after [12]/[14].
[19] [Add activity log create endpoint]: `POST /api/activity-logs`.
[20] [Add activity log pending-queue endpoint]: `GET /api/activity-logs?status=pending`, excludes the caller's own logs.
[21] [Add activity log approve/reject endpoints]: `PATCH .../approve`, `PATCH .../reject`.
[22] [Add activity log bulk-approve endpoint]: `POST /api/activity-logs/bulk-approve`.
[23] [Add competition settlement service + unit tests]: lazy, on-request settlement logic covering win/lose/win-win (including the "both must have ≥1 approved log" rule) and the "day off" void case (if either partner redeemed a `PausesCompetition` reward for that calendar day, the daily period settles as voided — no winner, no loot box for either side — rather than running normal win/lose logic), tested against fabricated period data before wiring to any endpoint.
[24] [Add competitions current-standing endpoint]: `GET /api/households/{id}/competitions/current`, triggers settlement of any newly-closed period.
[25] [Add loot box open endpoint + unit tests]: `POST .../open-box` — weighted random Coins/bonus-reward roll, idempotent on repeat calls.
[26] [Add win-streak tracking + badge unlock logic + unit tests]: updates `CurrentWinStreak`/`LongestWinStreak` on settlement, checks badge criteria.
[27] [Add badges list endpoint]: `GET /api/badges` with unlocked/locked state per user.
[28] [Add rewards list endpoint]: `GET /api/rewards` with sort/filter/search/pagination.
[29] [Add rewards create/update/delete endpoints]: either partner may edit/delete any of their household's own rewards — same reasoning as [18].
[30] [Add redemption create endpoint + unit tests]: balance check against Coins, rejects insufficient/negative/tampered costs.
[31] [Add redemption history endpoint]: `GET /api/redemptions/mine`.
[32] [Add input validation/sanitisation layer + unit tests]: covers custom chore/reward name sanitisation and negative-value rejection across the endpoints above — this is half of the Security advanced requirement, so its tests matter for the README writeup.
[33] [Add global exception handling middleware]: consistent error response shape.

## Backend delivery

[34] [Replace Swagger with Scalar API docs]: swap the default OpenAPI UI.
[35] [Configure CORS for the frontend origin].
[36] [Fill remaining backend unit test gaps]: sweep for controllers/services not yet covered.
[37] [Deploy backend]: push to hosting platform, confirm at least one endpoint is reachable live — the vertical-slice check from `api-design.md`.

## Frontend foundation

[38] [Scaffold React + TypeScript + Vite project].
[39] [Add MUI + base theme tokens]: light/dark color tokens defined, switch not wired yet.
[40] [Add React Router + route skeleton]: empty placeholder pages for every screen in `wireframes.md`.
[41] [Add Redux Toolkit store + base RTK Query API slice].
[42] [Add auth flow]: register/login pages, RTK Query endpoints, session persistence.
[43] [Add private route wrapper]: redirects unauthenticated users to login.
[44] [Add household create/join onboarding flow].

## Frontend features

[45] [Add dashboard head-to-head widget wired to the API]: pulls from `competitions/current`.
[46] [Add dashboard quick-add row and recent activity feed].
[47] [Add log-activity screen and form].
[48] [Add Notices tab — pending approvals section]: list + bulk-approve UI.
[49] [Add Notices tab — partner achievements/redemptions section].
[50] [Add Notices tab — own-logs-approved section]: lighter weight, informational.
[51] [Add reward store screen]: list with sort/filter/search/pagination.
[52] [Add redemption flow]: redeem button, balance check, confirmation state.
[53] [Add loot box reveal UI]: triggers when a settled competition hasn't been opened yet.
[54] [Add badges screen/shelf component].
[55] [Add Me/profile screen]: stats display.
[56] [Add household settings]: invite code, rename, leave.
[57] [Wire up theme switching]: light/dark toggle connected to the MUI theme tokens from task 39.
[58] [Responsive layout pass]: mobile breakpoints across all screens.
[59] [Add frontend unit tests]: dashboard widget, log-activity form, approval queue, store.

## Closeout

[60] [Deploy frontend]: confirm it talks to the deployed backend from task 37.
[61] [Finalize README]: deployment links, intro, theme section, unique features, advanced-features checklist, security writeup, self-reflection.
[62] [Finalize /specs folder]: confirm `prompts.md` covers the whole build, not just planning.
[63] [Record and edit the submission video].

## Should-have (only after every task above is done)

[64] [Dockerize the backend]: Dockerfile + local dev compose alongside the database.
[65] [Dockerize the frontend]: Dockerfile, added to the same compose setup.
[66] [Add WebSockets for live dashboard updates]: SignalR hub pushing Point/loot-box updates to both partners' dashboards in near-real-time.
[67] [Add WebSockets to the Notices tab]: live-push new pending approvals and partner achievements instead of requiring a refresh.
