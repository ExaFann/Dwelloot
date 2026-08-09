import type { Middleware } from '@reduxjs/toolkit'
import { baseApi } from '../api/baseApi'
import { signedIn, signedOut } from '../features/auth/authSlice'

/**
 * Empties the RTK Query cache whenever the session changes — task [86].
 *
 * ### The bug this fixes
 *
 * The owner saw "Authentication is required." on the dashboard's cards for a few seconds after
 * logging in, then watched it heal itself. It was a **cached error being replayed**, not a real
 * failure:
 *
 * 1. A 60-minute JWT expires while the tab is open. The next poll 401s.
 * 2. `baseApi` dispatches `signedOut()` — but nothing clears the cache, so every query that 401'd
 *    keeps its error entry, keyed by endpoint and argument.
 * 3. The user logs in again. `AuthGate` renders the dashboard, whose queries find those entries
 *    and hand them straight back — `isError` is true on the first frame — while refetching in the
 *    background.
 * 4. The refetch lands a second or two later and the error disappears.
 *
 * So the app was showing a **stale 401 from the previous session** as though it were the current
 * one. `resetApiState` existed for exactly this, and was called in exactly one of the three places
 * a session can change: the Sign out button. The two that matter more — the automatic 401 logout,
 * and signing back in — did not.
 *
 * ### Why middleware rather than three call sites
 *
 * The rule is "identity changed, so every cached response is about someone else" — a property of
 * the *action*, not of whichever component happened to dispatch it. Putting it at the store makes
 * it true for callers that do not exist yet, which is the same argument [84]/[85] applied to
 * duplicated UI. `SignOutButton` keeps its own explicit reset for clarity; a second one is a no-op.
 *
 * Resetting on `signedIn` as well as `signedOut` is deliberate: signing out already leaves nothing
 * on screen, so the entries that survive it are precisely the ones the *next* user would be shown.
 */
export const sessionCacheReset: Middleware = (api) => (next) => (action) => {
  const result = next(action)

  /*
   * After `next`, so the auth state is already updated when the reset's refetches begin — a query
   * restarted before the new token is in the store would 401 and recreate the problem.
   */
  if (signedIn.match(action) || signedOut.match(action)) {
    api.dispatch(baseApi.util.resetApiState())
  }

  return result
}
