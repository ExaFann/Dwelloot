## Task

[35] Configure CORS for the frontend origin.

## Spec

The frontend does not exist yet — it starts at task [38] and is deployed at [60] — so this task
configures a policy whose allowed origins are **configuration, not code**. The same pattern as the
connection string and the JWT key: a sensible local default in `appsettings.json`, overridden by
environment variables when deployed.

### Never `AllowAnyOrigin`

The whole point of the task. `AllowAnyOrigin()` would make every check below meaningless and is the
single most common way this gets "fixed" when a frontend cannot connect. The policy names its origins.

Default: `http://localhost:5173` and `http://127.0.0.1:5173` — Vite's dev server, which task [38]
scaffolds. Both spellings, because a browser sends whichever the address bar holds and the two are
distinct origins.

### No credentials, and that is a security property rather than an omission

Authentication is a **JWT in the `Authorization` header**, not a cookie. So the policy does _not_ call
`AllowCredentials()`, and it should not:

- Nothing needs it. The header is sent because the client chooses to, not because the browser attaches
  it automatically to a same-site request.
- Not calling it removes the classic CORS-plus-cookie CSRF surface entirely. A cross-origin page cannot
  make the browser attach anything of ours, because there is nothing attached automatically.
- `AllowCredentials()` combined with `AllowAnyOrigin()` throws at runtime in ASP.NET Core — a guard rail
  worth not needing.

Worth stating in the README's security section as a deliberate design consequence of bearer tokens.

### Trailing slashes: a real misconfiguration, guarded

`https://dwelloot.example.com/` will **never** match. A browser's `Origin` header is scheme + host +
port with no trailing slash, and ASP.NET Core compares the configured string literally. Setting the
deployed origin by copying it out of the address bar — which is what a person does — produces exactly
this and fails silently at the worst moment.

So origins go through a small normaliser: trim whitespace, strip trailing slashes, drop blanks. That is
ordinary code with a branch in it, so it gets a test file; the rest of this task is wiring.

### Where it sits in the pipeline, and why before `UseHttpsRedirection`

`UseCors` goes after the error middleware and **before** `UseHttpsRedirection`, `UseAuthentication` and
`UseAuthorization`.

The HTTPS ordering is the non-obvious one. A CORS preflight is an `OPTIONS` request, and **browsers do
not follow redirects for preflight** — a 307 to `https://` fails the preflight outright and the real
request is never sent. With `UseCors` first, the preflight is answered with a 204 and short-circuits
before the redirect can happen.

After the exception handler, so a 500 still carries the CORS headers. Without that a browser reports a
generic "blocked by CORS policy" instead of the real error, which is a bad afternoon for whoever debugs
the frontend.

### Startup logging rather than fail-fast

The connection string and JWT key throw at boot when missing, because the app genuinely cannot work
without them. An empty CORS list is different: the API still serves Scalar and any non-browser client
perfectly well, so throwing would break a legitimate backend-only deployment.

Instead the configured origins are logged once at startup. A deployment that forgot
`Cors__AllowedOrigins__0` then shows the reason in its own logs rather than presenting as an
inexplicable browser error.

| File                              | Change                                            |
| --------------------------------- | ------------------------------------------------- |
| `API/Cors/CorsSettings.cs`        | New. Bound options plus the normaliser.           |
| `API/appsettings.json`            | `Cors:AllowedOrigins` with the Vite dev defaults. |
| `API/Program.cs`                  | Register and apply the policy; log the origins.   |
| `Tests/Cors/CorsSettingsTests.cs` | New.                                              |

## Test requirement

Most of this is wiring and is verified end to end. The normaliser is not, and it is where the real
misconfiguration lives.

**`CorsSettingsTests`**

1. A trailing slash is stripped — `https://app.example.com/` normalises to `https://app.example.com`,
   the form a browser actually sends. **Multiple** trailing slashes too.
2. Surrounding whitespace is trimmed, since an environment variable set from a copied value often keeps
   it.
3. Blank and whitespace-only entries are dropped rather than becoming an origin of `""`, which would
   match nothing and hide a typo.
4. A path, query or fragment is **left alone** rather than silently stripped — `https://app.com/callback`
   is a misconfiguration the deployer must see, and quietly turning it into a working origin would teach
   the wrong lesson. Only the trailing slash, which is what copying an address bar produces, is
   forgiven.
5. Case is **preserved** — origins are compared literally by ASP.NET Core, and lower-casing here would
   silently diverge from what the browser sends for a host with unusual casing.
6. Duplicates collapse, so listing an origin twice does not produce a duplicated policy entry.
7. Normalising is idempotent.
8. The default configuration parses to the two Vite origins — pins the shipped default so a typo in
   `appsettings.json` fails a test rather than a frontend.

Then an end-to-end pass with a real `Origin` header, which is all CORS is — no browser required:

- A **simple request** from an allowed origin comes back with `Access-Control-Allow-Origin`.
- The same request from a **disallowed** origin comes back **without** it, and the response body is
  still the normal one (the server does not block; the browser does — worth demonstrating so nobody
  expects a 403).
- A **preflight** `OPTIONS` with `Access-Control-Request-Method` and
  `Access-Control-Request-Headers: authorization` is answered with the allowed method and header.
- The preflight is **not redirected** by HTTPS redirection.
- `Access-Control-Allow-Credentials` is **absent** — the no-cookies decision, asserted rather than
  assumed.
- An authenticated cross-origin `GET` works end to end with both `Origin` and `Authorization` set.
