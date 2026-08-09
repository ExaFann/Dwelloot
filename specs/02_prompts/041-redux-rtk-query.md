## Task

[41] Add Redux Toolkit store + base RTK Query API slice.

State management with Redux Toolkit is one of the three assessed advanced requirements, so this task
is also the foundation the README's writeup ([61]) will describe.

## Scope

The store, the base API slice, the environment variable that points it at the backend, and the error
handling every future endpoint will share. **No endpoints** — [42] injects the first ones.

A base slice with nothing in it would be a thin task. The substance here is the two things that are
genuinely shared and genuinely easy to get wrong per-screen: **where the base URL comes from**, and
**how the backend's one error shape becomes something a component can render**.

### Decisions

**1. `injectEndpoints`, not one big slice.** `baseApi` declares the base query, the tag types and
nothing else; feature files inject their own endpoints. The alternative — every endpoint in one file —
turns into a thousand-line module by [56] and makes each feature task edit the same file.

**2. Tag types are declared up front**, because `injectEndpoints` cannot add to the list later. The
set comes from `api-design.md`'s quick reference rather than invention: `Me`, `Household`, `Activity`,
`ActivityLog`, `Competition`, `Reward`, `Redemption`, `Badge`.

**3. The base URL comes from `VITE_API_BASE_URL`, and its absence is fatal in a production build.**

Log `038` deferred `.env` to this task precisely so the variable would not be named before something
read it. Resolution:

- Development: defaults to `http://localhost:5193`, so a fresh clone runs with no setup.
- Production: **throws at startup** if unset.

The throw mirrors the backend, which refuses to start without `ConnectionStrings__Default` or
`Jwt__Key` (handover §4.13). The failure it prevents is specific and nasty: with no base URL, RTK
Query issues *relative* requests, which resolve against the frontend's own origin and return the SPA's
`index.html` with a 200. Every query then fails at the JSON parse step, and the app looks broken in a
way that points at the client rather than at a missing environment variable. Task [60] sets this on
the deployed frontend, and this makes forgetting it loud.

**4. Auth headers are *not* wired here.** [42] owns the session and will add `prepareHeaders`. Adding
it now would mean inventing where the token lives before the slice that holds it exists.

**5. `setupListeners` is enabled** — `refetchOnFocus` and `refetchOnReconnect`. This app is two people
racing each other; coming back to the tab and seeing a stale score is the wrong default. It is also a
partial answer to the deferred WebSockets tasks ([66]/[67]), which are should-haves and may not land.

### The error contract, verified against the running API

Written against real responses rather than the documentation, because the documentation could be
stale. Every shape below was captured from `localhost:5193` during this task:

| Case | Status | Body |
|---|---|---|
| Unauthenticated | 401 | `{"error":"Authentication is required.","errors":null,"traceId":"00-…"}` |
| Unmatched route | 404 | `{"error":"That endpoint does not exist.","errors":null,…}` |
| Domain rejection | 400 | `{"error":"Invalid email or password.","errors":null,…}` |
| Not in a household | 409 | `{"error":"You are not in a household yet.","errors":null,…}` |
| Validation | 400 | `{"error":"One or more fields are invalid.","errors":{"Name":[…,…],"Email":[…]},…}` |

Three things this confirms, two of which are traps:

- **`errors` is `null`, not absent.** The handover says to test its value rather than the key's
  presence; confirmed on every non-validation response.
- **Field keys are PascalCase** — `Name`, `Email`, `Password` — while the request bodies and every
  other part of the JSON are camelCase. A form binding `errors.title` to its `title` input finds
  nothing. The lookup helper is therefore case-insensitive.
- **Not every key in `errors` is a form field.** A malformed JSON body produces
  `{"$":["'n' is an invalid start of a property name…"],"request":["The request field is required."]}`.
  `$` is a JSON path. Any form that maps the map onto its inputs and shows nothing else will silently
  discard both messages and appear to reject the submission for no reason.

Also observed, and worth recording for [51]–[56]: `DELETE /api/rewards/999999` for a user with no
household returns **409, not 404** — the household check precedes the id lookup. Consistent, and not
what a reader of §3.4's "404 for both does-not-exist and not-yours" alone would predict.

### The normalised shape

```ts
type ApiError = {
  status: number | null                       // null when no response arrived
  message: string                             // always a displayable sentence
  fieldErrors: Record<string, string[]> | null
  traceId: string | null
}
```

`toApiError` accepts anything — `FetchBaseQueryError`, a thrown `Error`, `undefined` — because
RTK Query's error union includes transport failures that never reached the server, and a component
should not have to discriminate before it can show a message.

Two helpers so the traps above cannot be hit per-screen: `fieldError(err, name)` matches
case-insensitively, and `unclaimedFieldErrors(err, names)` returns the messages **no form field
claimed**, so `$` and `request` surface somewhere instead of vanishing.

## Test requirement

`toApiError` is real logic with a wide input space, so it gets thorough tests — including the exact
byte-for-byte bodies captured above, used as fixtures rather than paraphrased.

1. Each of the five real response shapes normalises correctly.
2. **`errors: null` yields `fieldErrors: null`** — asserted as a value, not a key check.
3. Transport failures (`FETCH_ERROR`, `TIMEOUT_ERROR`, `PARSING_ERROR`) produce a displayable message
   and `status: null` where no response arrived.
4. A body that does not match the contract at all — a bare string, an empty object, `null` — produces
   a fallback message rather than `undefined` reaching the DOM.
5. **The message is never `undefined` or empty**, for any input. This is the one property every screen
   depends on.
6. `fieldError` matches case-insensitively, and returns undefined for a genuinely absent field.
7. `unclaimedFieldErrors` returns `$` and `request` for the malformed-body fixture, and `[]` when
   every key is claimed — **asserted in both directions**, since a helper returning everything always
   would pass a one-directional test.

For the environment resolution: dev default, explicit override wins, and the production throw —
asserted in both directions so a resolver that ignored its input would fail.

The store gets a small check that the API middleware and reducer are actually registered — a store
missing `api.middleware` still builds, and only fails later when a query never resolves.

Then a **browser check that closes an item open since log `038`**: no JavaScript in this project has
ever called the backend. A real cross-origin request from `http://localhost:5173` will confirm CORS
end to end from a browser, rather than from `curl` with a hand-set `Origin`.

