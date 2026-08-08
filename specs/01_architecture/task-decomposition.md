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
[22a] [Add own activity-log history endpoint]: `GET /api/activity-logs/mine`, with optional `?status=` filter and a `take` limit. Added after the fact — `api-design.md` uses it twice (the dashboard's recent-activity feed and the Notices tab's "your logs the partner approved" section) but no task covered it, and frontend tasks [46] and [50] both depend on it. Numbered `22a` rather than renumbering [23]–[67], since every task number is referenced by the chat logs in `/specs/2_chat_logs/` and by code comments.
[23] [Add competition settlement service + unit tests]: lazy, on-request settlement logic covering win/lose/win-win (including the "both must have ≥1 approved log" rule) and the "day off" void case (if either partner redeemed a `PausesCompetition` reward for that calendar day, the daily period settles as voided — no winner, no loot box for either side — rather than running normal win/lose logic), tested against fabricated period data before wiring to any endpoint.
[24] [Add competitions current-standing endpoint]: `GET /api/households/{id}/competitions/current`, triggers settlement of any newly-closed period.
[25] [Add loot box open endpoint + unit tests]: `POST .../open-box` — weighted random Coins/bonus-reward roll, idempotent on repeat calls.
[26] [Add win-streak tracking + badge unlock logic + unit tests]: updates `CurrentWinStreak`/`LongestWinStreak` on settlement, checks badge criteria.
[27] [Add badges list endpoint]: `GET /api/badges` with unlocked/locked state per user.
[28] [Add rewards list endpoint]: `GET /api/rewards` with sort/filter/search/pagination.
[29] [Add rewards create/update/delete endpoints]: either partner may edit/delete any of their household's own rewards — same reasoning as [18].
[30] [Add redemption create endpoint + unit tests]: balance check against Coins, rejects insufficient/negative/tampered costs.
[31] [Add redemption history endpoint]: `GET /api/redemptions/mine`.
[31a] [Add household redemption feed endpoint]: `GET /api/redemptions?scope=household&excludeMine=true`, the data source for the Notices tab's partner-achievements section. Added after the fact — `api-design.md` documents it and introduces it as the correction to using `/redemptions/mine` for that section, and frontend task [49] depends on it, but no backend task covered it. Numbered `31a` rather than renumbering [32]–[67], for the same reason as `22a`: every task number is referenced by the chat logs and by code comments.
[32] [Add input validation/sanitisation layer + unit tests]: covers custom chore/reward name sanitisation and negative-value rejection across the endpoints above — this is half of the Security advanced requirement, so its tests matter for the README writeup.
[33] [Add global exception handling middleware]: consistent error response shape.

## Backend delivery

[34] [Replace Swagger with Scalar API docs]: swap the default OpenAPI UI.
[35] [Configure CORS for the frontend origin].
[36] [Fill remaining backend unit test gaps]: sweep for controllers/services not yet covered.
[37] [Deploy backend]: push to hosting platform, confirm at least one endpoint is reachable live — the vertical-slice check from `api-design.md`.

## Frontend foundation

[38] [Scaffold React + TypeScript + Vite project].
[39] [Add MUI + base theme tokens]: light/dark color tokens defined, switch not wired yet. **Diverged — MUI was dropped during this task.** A component library's own theme is a second styling system that has to be kept in step with the tokens, and this project wanted a distinct hand-drawn visual identity rather than a themed default one. Replaced by Tailwind CSS v4 with the whole palette declared in `theme.css` and parsed by `tokens.test.ts`. The original spec is kept as `02_prompts/039-mui-theme-tokens-superseded.md`; the replacement is `039-theme-tokens.md`.
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
[57] [Wire up theme switching]: light/dark toggle connected to the theme tokens from task [39] (**not** MUI's — see the divergence note there). Shipped with a third mode, "follow system", resolved in JavaScript rather than by a CSS media query so an explicit choice can override the OS.
[58] [Responsive layout pass]: mobile breakpoints across all screens. **Grew a [58a]** — week/month periods, day-boundary chore clearing, the approval prompt and the nav badge, all of which the responsive pass surfaced as missing.
[59] [Add frontend unit tests]: dashboard widget, log-activity form, approval queue, store. **Revised:** the test harness landed in [39], so this became a coverage *sweep* — the frontend counterpart of [36] — rather than the first tests.

## Closeout

[60] [Deploy frontend]: confirm it talks to the deployed backend from task 37.
[61] [Finalize README]: deployment links, intro, theme section, unique features, advanced-features checklist, security writeup, self-reflection.
[62] [Finalize /specs folder]: confirm `prompts.md` covers the whole build, not just planning.
[63] [Record and edit the submission video].

## Should-have (only after every task above is done)

[64] [Dockerize the backend]: Dockerfile + local dev compose alongside the database.
[65] [Dockerize the frontend]: Dockerfile, added to the same compose setup.
[66] [Add WebSockets for live dashboard updates]: SignalR hub pushing Point/loot-box updates to both partners' dashboards in near-real-time. **Not built.** Superseded by `liveSync.ts` — interval polling with refetch on focus and reconnect, pinned by a source-scanning coverage test. A hub would replace the transport; it would not replace those two, because sockets drop and nothing replays missed messages. The migration path is recorded rather than the option being closed.
[67] [Add WebSockets to the Notices tab]: live-push new pending approvals and partner achievements instead of requiring a refresh. **Not built** — same reasoning as [66].

---

## Added after [60] — the plan above stopped here, the build did not

Everything below was added to the plan *during* the build, either because a gap was found or because
a review of the running app called for it. They are listed here so this document describes the
project that exists rather than the one that was first imagined.

### Features and fixes

[68] [Store changes need the partner's approval]: a new `reward_change_requests` table; solo households apply immediately, paired households queue add/edit/delete for the other person to decide. Closes a real exploit found by review — re-price a reward down, buy it, restore the price.
[69] [The pausing reward is server-owned]: `pausesCompetition` removed from every client request. The reward that voids a day is undeletable but still re-priceable, because price is the abuse gate, not existence.
[70] [A solo user can accept an invite code]: joining moves them atomically and deletes their emptied household. A wrong code costs nothing.
[71] [Delete a pending activity log]: own logs only, Pending only. Safe as a hard delete because everything downstream reads Approved — and deleting a mis-tap *unblocks* a period stuck awaiting approvals.
[72] [Preset avatars]: a nullable `avatar_key` with a server-side allow-list, chosen from the pairing screen or the Me screen. An unknown key degrades to the generated identicon.
[73] [The quick-log wall is curatable]: `activities.is_quick`, household-shared, with a manager beside the wall itself — a curatable list needs a visible way to curate it.
[36a] [Household prize feed]: merges redemptions, the partner's redemptions and household prizes, so everything either partner *obtains* appears whether bought or won. A live production bug fell out of building it.
[74] [The approval prompt fires only for overdue chores]: "is anything stuck?" is a different question from "is there anything for me?", and only the first deserves an interruption.
[77] [App icons and manifest]: the designed icon set into `client/public/`, a web manifest, and the Open Graph tags.

### Visual identity and design review

[75] [Brand tokens and icons]: `icons.tsx` — three currency marks, twenty UI icons, twelve badge motifs — transcribed path-for-path from the design source, which a test parses from disk. `lucide-react` removed entirely.
[76] [Badge wall]: a honeycomb of twelve, locked badges desaturated with the state in the accessible name.
[53a]/[53b] [The loot reveal becomes a centre-screen dialog]: a chest that rattles and opens, coins that fountain out, then the prize.
[80]/[81] [Motion]: a survey, then six one-shot CSS animations, each with a `prefers-reduced-motion` answer. No animation library.
[82] [Landing page]: what a signed-out visitor sees at `/`.
[84] [One implementation per idea]: the de-duplication round. Four surfaces rendered the same idea from their own copies and each copy was tested against itself, so changing one left the front page stale and the suite green. Structural fix, and the rule the codebase now holds to.
[86] [Session cache reset]: a 401 belonging to a dead session survived into the next one. Store middleware, because "the identity changed" is a property of the action, not of any component.
[75a]–[75e], [76a]–[76c], [78], [79], [83], [85], [87], [88] — owner-directed design-review rounds, consolidated into `02_prompts/ui-exp02-design-review-rounds.md`.

### Cut

[64a] [Real avatar upload] — deferred behind presets; storage, a size cap and content-type validation for a feature presets already serve.
Two-factor authentication: cut. Out of proportion for a two-person household app with no sensitive data and no payment surface.
A read-only demo mode and onboarding coach-marks: planned, not built, cut for time.
