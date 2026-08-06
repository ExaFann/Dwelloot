## Task

[43] Add private route wrapper: redirects unauthenticated users to login.

Plus the **sign-out control**, agreed with the owner after log `042` flagged that no task owned one.

## Scope

The task title names one rule. There are actually **three**, and they are the same decision made from
different starting points, so they belong in one place rather than three.

`api-design.md` states the second rule directly: _"Check pairing state (drives routing: no household
yet → pairing screen, household set → main app)"_. Log `042` deferred it here, since the login
response carries only `{ token, user: { id, name } }` and the household is only knowable from
`GET /api/auth/me`.

The third is the inverse of the first and is easy to forget: a **signed-in** user who navigates to
`/login` should not be shown a login form.

### One gate, one decision table

Rather than three guard components each fetching `/me`, one `AuthGate` takes the access level the
route requires. The whole of [43] is then this table, and it is testable as a matrix:

| `access`                            | Not signed in | Signed in, no household | Signed in, has household |
| ----------------------------------- | ------------- | ----------------------- | ------------------------ |
| `anonymous` (`/login`, `/register`) | **render**    | → `/pairing`            | → `/`                    |
| `pairing` (`/pairing`)              | → `/login`    | **render**              | → `/`                    |
| `household` (the five app screens)  | → `/login`    | → `/pairing`            | **render**               |

Every cell is a redirect except the diagonal. Writing it as data makes the missing cases obvious —
the two that would otherwise be forgotten are "signed in with a household visits `/pairing`" (which
would let someone create a second household) and "signed in visits `/login`".

### Decisions

**1. The household check needs a request, so there is a loading state.** Being signed in is known
synchronously from the store; having a household is not. `AuthGate` therefore renders a loading
screen while `GET /api/auth/me` is in flight rather than guessing.

Rendering `<Outlet/>` optimistically during that window would flash the dashboard before bouncing a
household-less user to `/pairing`, which is worse than a brief loading state — and on a slow
connection it would let them start interacting with a screen that is about to disappear.

**2. `useMeQuery` is skipped when signed out.** No point issuing a request that is guaranteed to 401,
and the 401 would fire the auto-logout path on someone who is already logged out.

**3. A 401 from `/me` needs no handling here.** `baseApi` already dispatches `signedOut` on it
([42]), so the store flips, the gate re-renders, and the "not signed in" column applies. That is the
sole reason this component has no expiry logic of its own — worth stating, because its absence looks
like an omission.

**4. Other `/me` failures show an error with a retry, not a redirect.** If the network is down, the
household is _unknown_, not absent. Redirecting to `/pairing` on a failed request would tell a user
with a perfectly good household to go and create one.

**5. The intended destination is preserved.** A redirect to `/login` carries
`state: { from: location }`, and `LoginPage` returns there after signing in. Without it, following a
link to `/store` while signed out lands you on the dashboard, and the app has silently discarded what
you asked for. This changes [42]'s hardcoded `navigate('/')`.

**6. Sign-out lives on the Me screen, for now.** It is the conventional place and `/me` is a
placeholder [55] will rewrite anyway. Recorded in `task_decomposition.md` against [55], which owns the final
placement.

Sign-out clears the session and lets the gate do the redirecting, rather than navigating explicitly —
one mechanism, not two.

## Test requirement

**The full 3×3 matrix**, every cell asserted. That is the point of writing the rules as a table: nine
cases, not "the happy path plus a redirect".

Both directions matter throughout, and specifically:

1. A redirect must **not** render the protected content. Asserting the destination alone passes
   against a gate that renders the page _and_ redirects — the content would flash and, worse, its
   queries would fire.
2. The loading state must **not** render the protected content either. Same failure, harder to see.
3. `/me` must not be requested at all when signed out — asserted on the fetch spy, since a skipped
   query that isn't skipped only shows up as a spurious 401.
4. A failed `/me` shows an error and **stays put**, rather than redirecting to `/pairing`.
5. The `from` location survives a redirect and is used after login.
6. Sign-out clears state _and_ storage, and the gate then redirects.
