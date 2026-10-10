# Dwelloot

Chore-gamification app for two flatmates.

- `API/`: .NET 10 Web API (EF Core, PostgreSQL, ASP.NET Identity + JWT)
- `Tests/`: xUnit tests for the API
- `client/`: React 19 + Vite + Redux Toolkit / RTK Query + Tailwind v4
- Deployed: client on Netlify; API on Azure App Service with Azure Postgres

## Source of truth

- The current code and tests are the source of truth. Read them before relying on any document.
- `specs/` and `project-state-handover.md` are a historical record of how v1 was planned
  (July–August 2026). They may be out of date. Use them only to understand why something
  was built the way it was.
- When a spec and the code disagree, trust the code. Tell me about the difference.
  Do not change code to match an old spec, and do not edit the old specs.
- Comments that cite task numbers like `[57]` or spec files are history. Do not add new ones.
- Record new design decisions in `docs/adr/NNNN-short-title.md`
  with four headings: Context, Options, Decision, Consequences.

## Commands

- Backend tests: `dotnet test`
- Single backend test: `dotnet test --filter "FullyQualifiedName~StreakTests"`
- Single frontend test: `npm --prefix client exec vitest run src/features/activity/choreQuery.test.ts` (add `-t "name"` to filter by test name)
- Frontend install: `npm --prefix client ci`
- Frontend checks: `npm --prefix client run lint`, `npm --prefix client test`, `npm --prefix client run build`
- Database migrations: `dotnet ef database update --project API`
- Run API: `dotnet run --project API` (http://localhost:5193)
- Run client: `npm --prefix client run dev` (http://localhost:5173)

## Local setup

- Secrets come from .NET user-secrets: `ConnectionStrings:Default` (the full string,
  including Password) and `Jwt:Key` (at least 32 bytes). The API refuses to start without them.
- Development does not migrate on startup. Run the migration command above.
- Dev CORS only allows http://localhost:5173, so keep the client on that port.

## Architecture

- API request flow: thin `[Authorize]` controller → `User.GetUserId()` → `I*Service` (registered in `Program.cs`) returns a result record with a status enum → controller maps it to HTTP.
- Every error body is `ApiErrorResponse { error, errors, traceId }`. Validation, status-code pages and `GlobalExceptionHandler` all produce it.
- No background jobs. Competitions settle lazily when standings are read (`CompetitionQueryService` → `SettleDueAsync`), with periods in local time via `PeriodCalculator`.
- Approving a log awards Points and triggers `ProgressionService` (streaks, badges). Winners open loot boxes per settled competition via `LootBoxService`.
- Activities and rewards are archived, never deleted. Points and prices are snapshotted onto logs and redemptions. In a paired household, store edits queue as `RewardChangeRequest`s for the partner.
- Client: `app/routes.tsx` wraps routes in `AuthGate` (`household` / `anonymous` / `pairing`). The JWT lives in Redux, is mirrored to `localStorage`, and is sent as a Bearer header (no cookies).
- All server data goes through RTK Query: `api/baseApi.ts` plus per-feature `injectEndpoints`. Cache tags must be listed in the closed `API_TAGS`.
- The partner's changes arrive by polling. Queries spread `liveQueryOptions` (`app/liveSync.ts`), and `liveSyncCoverage.test.ts` fails if one doesn't.
- UI uses no component or icon library. Colours are tokens in `styles/theme.css`, and source-scanning tests (`tokens.test.ts`, `icons.test.tsx`) enforce both.

## Definition of done

- `dotnet test` and all three frontend checks pass.
- New or changed behaviour has tests. Never delete or weaken a test to make it pass.
- Backend tests use EF in-memory (`Tests/TestDbContextFactory.cs`), which enforces no check constraints
  and no unique indexes. A rule that relies on one also needs a service-layer guard, and a passing test
  doesn't prove PostgreSQL would accept the write.
- Report the commands you ran and their results. Do not say tests pass unless you ran
  them in this session.

## Never

- Never read, print or commit secrets: user-secrets, `.env` files, `appsettings.*.Local.json`.
- Never add a dependency by editing `package.json` or a `.csproj` by hand.
  Use `npm install` or `dotnet add package`, so the latest version is installed.
