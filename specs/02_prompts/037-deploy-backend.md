## Task

[37] Deploy backend: push to hosting platform, confirm at least one endpoint is reachable live — the
vertical-slice check from `api-design.md`.

## Scope

This is the first task in the project whose completion is **outward-facing and not mine to perform**.
Creating a hosting account, provisioning a production database, handling production secrets and pushing
to a public host are all owner actions — and the working agreement already forbids me from running
`git add`, `git commit` or `git push` at all.

So this task splits:

- **Everything that makes the deployment work**, which is code and configuration, is done and verified
  here.
- **The deployment itself** is a runbook handed to the owner, plus the platform choice, which is theirs.

Stating that up front because "task [37] complete" would otherwise imply a live URL exists.

### Three things would break a first deploy, and none of them existed

Found by checking rather than assuming — the repository has no Dockerfile, no platform config, and
nothing in `Program.cs` touching ports, proxies or migrations.

**1. The app would bind to the wrong port and be unreachable.** Render, Railway and Fly.io publish the
port to bind in the `PORT` environment variable. ASP.NET Core does not read `PORT`; it reads
`ASPNETCORE_URLS` and otherwise defaults to 5000/5001. The platform routes to `$PORT`, finds nothing,
and the deploy reports success while every request times out. (Azure App Service sets `ASPNETCORE_URLS`
itself, so it is the exception.)

**2. HTTPS redirection would cause an infinite redirect loop.** On every PaaS, TLS terminates at the
edge and the application receives plain HTTP with `X-Forwarded-Proto: https`. Without
`UseForwardedHeaders`, `Request.Scheme` is `http`, so `UseHttpsRedirection` issues a 307 to `https://…`
— which the edge terminates and forwards as HTTP again. Every request loops until the browser gives up.

This one also interacts with task [35]: a preflight `OPTIONS` caught in that loop never completes, so
the frontend fails with a CORS error whose actual cause is the proxy configuration. Log `035` verified
the CORS-before-redirect ordering precisely because preflights and redirects interact badly; this is the
same hazard from the other side.

**3. The deployed database would have no schema.** Migrations have always been applied by hand with
`dotnet ef database update`. Nothing applies them at startup, and several free tiers have no release-
command step, so a first deploy would connect successfully and then 500 on every query.

### Decisions

**Migrations run at startup, enabled by default everywhere except Development.**
`Database:MigrateOnStartup` is overridable, but its default is `!IsDevelopment()`, which gives the right
behaviour in both places without anyone remembering a flag: locally, migrations stay a deliberate
`dotnet ef database update` (so generating a migration and then running the app cannot apply it by
surprise); deployed, the schema follows the code automatically.

`Migrate()` is idempotent, and the concurrent-instance objection does not apply to a two-person app on a
single instance. If it ever does, the fix is a release command rather than a code change.

**A `/health` endpoint.** Platforms poll one, and the task's own success criterion is "confirm at least
one endpoint is reachable live". It reports whether the database is reachable, and reports it as
**200 or 503 with no detail** — an unauthenticated endpoint should not describe the failure. Scalar at
`/scalar` (task [34]) remains the human-facing check.

**Forwarded headers are trusted from any proxy.** `KnownProxies`/`KnownNetworks` are cleared, which
would be wrong on a network where an attacker can reach the app directly, and is right behind a PaAS
edge that is the only route in. Named as a trade-off rather than left as a default nobody examined.

### What is not done here

- **No Dockerfile.** Task [64] owns it, and Render, Railway and Azure all build .NET from source without
  one. Adding it now would pre-empt a should-have task for no benefit.
- **No platform config file** (`render.yaml`, `fly.toml`, …) until the platform is chosen.
- **No CI workflow.** Not in the plan.

| File                                               | Change                                                           |
| -------------------------------------------------- | ---------------------------------------------------------------- |
| `API/Program.cs`                                   | `PORT` binding, forwarded headers, startup migration, `/health`. |
| `API/appsettings.json`                             | `Database:MigrateOnStartup` documented as absent-means-default.  |
| `Tests/Deployment/DeploymentConfigurationTests.cs` | New.                                                             |
| `specs/01_architecture/api-design.md`        | `/health` and the deployment notes.                              |

## Test requirement

Most of this is host wiring, verified by running the app the way a platform runs it. Two pieces are
ordinary code and get tests:

1. **The port resolution.** `PORT=8080` produces `http://0.0.0.0:8080`; `PORT` absent leaves the URL
   alone so `ASPNETCORE_URLS` and `launchSettings.json` still win; a non-numeric or out-of-range `PORT`
   is ignored rather than crashing the host at boot.
2. **The migrate-on-startup default.** False under Development, true otherwise, and an explicit setting
   beats both — asserted in both directions so a default that ignored configuration would fail.

Then a **local production rehearsal**, which is the part that actually de-risks the deploy:

- Run with `--no-launch-profile` and `ASPNETCORE_ENVIRONMENT=Production`, configured **entirely by
  environment variables**, as a platform would. This is the first time the app has ever run outside
  Development, and the handover flags that `dotnet run` silently forces Development without that flag.
- Confirm it binds to `PORT`.
- Confirm `/health` returns 200 with the database up.
- Send a request with `X-Forwarded-Proto: https` and confirm **no redirect** — the loop above.
- Confirm the same request _without_ the header still redirects, so the test can fail.
- Confirm a real endpoint answers, and that the error shape and CORS headers still behave in Production.
- Confirm startup migration is a no-op against an already-migrated database.
