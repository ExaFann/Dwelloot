## Task

[42] Add auth flow: register/login pages, RTK Query endpoints, session persistence.

## Three things found by probing the API first, before writing anything

Each one changes the design, and none is visible from `api-design.md` alone.

### 1. A failed login returns **401**, the same status as an expired token

The obvious session rule — "any 401 means the token died, so log out" — is wrong here. `POST /api/auth/login`
with bad credentials answers **401 `Invalid email or password.`**, byte-identical in shape to the
**401 `Authentication is required.`** that a missing or expired token produces.

A blanket interceptor would therefore treat a mistyped password as a session expiry. Auto-logout is
scoped to everything **except** the `login` and `register` endpoints, keyed on RTK Query's
`api.endpoint` rather than on URL matching.

### 2. Registration returns a **completely different error shape**

A duplicate email produces:

```json
{"type":"https://tools.ietf.org/html/rfc9110#section-15.5.1",
 "title":"One or more validation errors occurred.","status":400,
 "errors":{"DuplicateEmail":["Email 'x@example.com' is already taken."],
           "DuplicateUserName":["Username 'x@example.com' is already taken."]},
 "traceId":"00-…"}
```

That is **ProblemDetails** — `title` where the rest of the API has `error`, plus `type` and `status`.
It contradicts a documented invariant: `api-design.md` says every failure from every source has one
shape, and records that ProblemDetails was "considered and rejected".

Cause found: **`API/Controllers/AuthController.cs:46` returns `ValidationProblem(ModelState)`** to
surface Identity's `IdentityResult.Errors`. It is the **only** `ValidationProblem` or `Problem()` call
in the entire API — grepped to confirm. So the envelope holds everywhere except the first request a
new user ever makes.

Consequence if ignored: `toApiError` reads `body.error`, finds nothing, and falls back to
"Something went wrong. Please try again." on the one error a registration form most needs to explain.

**Handled here, flagged for a decision.** `toApiError` now falls back to `title` — worth doing on its
own merits, since ProblemDetails is what any un-caught ASP.NET model-binding path emits. But the
backend inconsistency is a backend fix in a frontend task, so it is raised rather than made.

### 3. There is a **423 Locked** state nobody had mentioned

`AuthController` returns **423** with "Too many failed attempts. Try again later." after five failures
— the lockout from task [13]. Not in `api-design.md`'s walkthroughs. A login form that only
distinguishes "wrong password" from "server error" tells a locked-out user to keep trying.

## Scope

Endpoints, the session, the two forms, and the small shared inputs they need. **No route guarding** —
[43] owns redirecting unauthenticated users, and [44] owns the household pairing screen. After a
successful login this task navigates to `/`; [43] is what will bounce a user with no household onward
to `/pairing`, because that decision needs `GET /api/auth/me`, which the login response does not carry.

### Decisions

**1. The token lives in Redux, and is mirrored to `localStorage`.** Redux is the source of truth
during a session; storage exists only so a refresh does not sign you out.

`localStorage` over the alternatives, stated plainly because [61]'s security writeup will need it:

| | |
|---|---|
| **In memory only** | Immune to XSS exfiltration, but signs the user out on every refresh. Rejected as unusable. |
| **`sessionStorage`** | Same XSS exposure as `localStorage`, and dies with the tab. No real gain. |
| **`localStorage`** | XSS-readable. Chosen. |
| **`httpOnly` cookie** | Not readable by script, but the backend is deliberately cookie-free — CORS ships without `AllowCredentials` specifically to remove the CSRF surface (handover §3.2). Adopting cookies would mean re-adding it. |

The honest position: with no `httpOnly` cookie available, script-readable storage is the only option,
so **the XSS defence has to be that there is no XSS** — React escapes by default, the project stores
HTML verbatim rather than sanitising precisely because output encoding is the real defence (handover
§4.11), and nothing in this codebase uses `dangerouslySetInnerHTML`. The 60-minute non-refreshable
token bounds the damage.

**2. Storage access is wrapped in `try`/`catch`.** `localStorage` throws on access in Safari private
browsing and when a browser blocks site data — an uncaught throw at store-creation time would white-
screen the app before React mounts. A failure degrades to "not signed in", which is recoverable.

**3. Registration auto-logs-in.** `POST /api/auth/register` returns `{id, name, email}` and **no
token** — confirmed. Making the user retype credentials they just typed is friction with no purpose,
so a successful register chains into the login call.

**4. `prepareHeaders` types the state structurally.** Importing `RootState` into `baseApi` would be a
cycle: store → baseApi → store. Reading `getState() as { auth: { token: string | null } }` breaks it,
and is honest about being the one place the store's shape is asserted rather than inferred.

## Test requirement

1. **Storage** — round-trips; survives corrupt JSON, a missing key, a wrong-shaped payload; survives
   `localStorage` throwing on both read and write.
2. **The slice** — hydrates from storage at startup; `signedIn` sets both state and storage;
   `signedOut` clears both. Asserted in both directions, including that storage is really written,
   not just state.
3. **The token reaches the wire.** `Authorization: Bearer …` present when signed in and **absent**
   when signed out — the second half matters, since a header helper that always appends would pass
   the first.
4. **Auto-logout on 401, and *not* on the login endpoint.** Both directions, because this is finding 1
   and a blanket rule passes the first assertion.
5. **`toApiError` reads ProblemDetails** — the real duplicate-email body above, asserted to produce a
   usable message rather than the generic fallback.
6. **The forms** — render, submit, disable while pending, show a field error against the right input
   despite PascalCase keys, and surface `unclaimedFieldErrors` (which is where `DuplicateEmail` lands,
   since no input is bound to it).
7. **423 is distinguishable** from a bad password.

Then an end-to-end pass in a browser against the running API: register, sign out, sign in, refresh,
and confirm the session survives.

