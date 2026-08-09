## Task

[60] Deploy frontend: confirm it talks to the deployed backend from task [37].

### Correction — the backend **is** deployed

This started from "the backend from [37] is not deployed", based on probing
`dwelloot-api.azurewebsites.net`. That was an error: the hostname came from log `037`'s runbook,
where it is a **worked example**, and was treated as the real one instead of asked about. The live
API is **`https://dwelloot-api-exa.azurewebsites.net`**, verified: `/health` 200 (and it runs
`DatabaseHealthCheck`, so the database is reachable *and* migrated), `/scalar/` 200,
`/openapi/v1.json` 200, `/api/badges` with no token 401, and plain `http://` returns 200 with no
redirect loop — [37]'s forwarded-headers work held up.

Worth naming rather than quietly fixing the URL: **a probe that returns nothing is evidence about the
address probed, not about the world**, and the stronger claim was reported.

## Scope

Creating hosting resources, pushing to a public host and setting production configuration are owner
actions, and the working agreement forbids `git push` at all. So this task splits the way [37] did:

- **Everything that makes the deployment work** is code and configuration, and is done and verified
  here.
- **The deployment itself** is a runbook.

### What is missing, and it is one thing

`VITE_API_BASE_URL` handling was already built in [41] and is thorough. The build warning was already
built in [38]/[41]. What does **not** exist is the single most common way a React SPA deploy fails.

**There is no SPA fallback configuration of any kind.**

Every route below the root — `/log`, `/notices`, `/store`, `/me`, `/login`, `/pairing` — is resolved
by React Router *after* `index.html` loads. The build output is one HTML file; there is no
`store/index.html`. A static host answering literally returns **404** for a refresh on `/store`, for
a shared link, and for a bookmark — while the site "works" as long as you only ever click your way in
from the root, which is exactly how it would pass a casual smoke test.

Two configs ship in `public/`, so Vite copies them into `dist/` on every build:

| Host | File | Ships |
|---|---|---|
| Azure Static Web Apps | `staticwebapp.config.json` | yes |
| Netlify / Cloudflare Pages | `_redirects` | yes |
| Vercel | `vercel.json` | **no** — needs a rewrite added |
| nginx | — | `try_files $uri /index.html;` |

Both are carried because each platform reads only its own and ignores the other, so the build does
not depend on having chosen the host first.

`staticwebapp.config.json` also sets `X-Content-Type-Options`, `Referrer-Policy` and
`X-Frame-Options`, and caches `assets/*` immutably while keeping `index.html` uncached — the
hashed-filename pattern Vite produces makes that safe, and the reverse would serve a stale shell
pointing at deleted bundles.

**No CSP is set.** `index.html` carries one **inline script**: [57]'s pre-paint theme applier, which
cannot move into React because React renders after the first paint. Under `script-src 'self'` it is
blocked and every load flashes the light theme before correcting. The runbook carries the current
hash and the one-liner to recompute it, because it changes whenever that script changes.

### `client/README.md` is replaced

It is still the **Vite scaffold template README** — *"This template provides a minimal setup to get
React working in Vite"* — which for a deployment task is actively the wrong document. Replaced with
the frontend's own: how to run it, why the dev port is pinned, the single environment variable and
what happens when it is missing, the SPA fallback, the CORS setting, and the CSP note. The assessed
product README stays with [61]; this one is the build-and-ship document.

## Test requirement

Nothing here is unit-testable in a useful way. The verification is a **production-bundle rehearsal**,
which is the strongest check available without a host, plus one measurement on the deployed API.

1. **Build for production, serve `dist/`, and drive it against the real API cross-origin.** Not the
   dev server: [38] deliberately refused a proxy so that development exercises the same CORS path as
   production, and the dev server would prove less.
   - Confirm the document carries **no Vite client** — it is genuinely the production bundle.
   - **Deep link straight to `/store`, never visiting `/` first** → 200, renders `Store`. This is the
     check the fallback config exists for.
   - Confirm real data is fetched and rendered.
   - Confirm the origin every API request goes to is the **baked-in** value, not the page's own
     origin, and that the requests are genuinely cross-origin (page and API on different ports).

2. **The missing-variable guard, both halves**, confirmed rather than assumed:
   - Build **without** `VITE_API_BASE_URL` → the build must print the warning.
   - Load that build → the app must render nothing and throw a readable error.
   - Build **with** it → no warning, and the origin compiled in.

3. **The dead fallback must actually be dead.** `http://localhost:5193` *is* present in the production
   bundle as the exported `DEV_FALLBACK_BASE_URL` constant. Read the minified call site and confirm it
   compiles to `resolveApiBaseUrl(undefined, false)` — `isDev` a literal `false`, the fallback branch
   unreachable, the throw the thing that runs. Getting this wrong would defeat the whole guard, so it
   is checked rather than trusted. Also confirm a trailing slash on the variable is stripped at
   runtime, matching [35]'s backend normaliser.

4. **Measure what the deployed API currently allows**, rather than assuming:
   ```
   OPTIONS /api/badges   Origin: <any>   → 204, no CORS headers
   ```
   `appsettings.json` ships `"AllowedOrigins": []` and nothing has overridden it, so **every** browser
   origin is refused. A preflight answers 204 with no `Access-Control-Allow-Origin` and the browser
   discards the real response — the failure that reads as a frontend bug and is not one.

5. **After the owner deploys**, the checks that close the vertical slice:
   - Preflight from the real origin returns `Access-Control-Allow-Origin: <that origin>`.
   - `/`, `/store`, `/me`, `/notices` and an unknown path all return **200** — the fallback is working
     on the host actually chosen.
   - The deployed bundle's API origin is the baked-in one.
   - A deep link in a browser boots the app and lets `AuthGate` redirect.
   - **A cross-origin `fetch` from the deployed page returns 401 with a readable body.** This is the
     row that closes the slice: a browser only exposes a cross-origin response body when
     `Access-Control-Allow-Origin` matched, so reading the API's own error envelope proves the real
     frontend origin can talk to the real API — and confirms [33]'s single error shape survived
     deployment.

### One constraint the runbook has to record

**Azure Static Web Apps is impossible on this subscription.** `az staticwebapp create` fails in every
permitted region with `RequestDisallowedByAzure`, structurally: the subscription policy allows
`koreacentral`/`japaneast`/`newzealandnorth`/`chilecentral`/`australiaeast`, and
`Microsoft.Web/staticSites` is offered in Central US / East US 2 / West US 2 / West Europe / East
Asia. **The intersection is empty.** The API is unaffected — it is App Service in `australiaeast`.

Three ways out, for the owner to choose between: a non-Azure static host (no region policy, proper
SPA fallback, no change to a working backend, and it preserves the cross-origin production shape [38]
chose deliberately); serving `dist/` from the existing App Service (one URL, no CORS, but it means
redeploying a working backend and production would never exercise [35]); or Azure Blob static website
(stays in-region, but its only SPA fallback is the error document, which serves `index.html` with a
**404 status**, and it ignores `staticwebapp.config.json` entirely).
