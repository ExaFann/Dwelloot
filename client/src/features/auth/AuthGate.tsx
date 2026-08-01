import { Navigate, Outlet, useLocation } from 'react-router'
import { useAppSelector } from '../../app/hooks'
import { selectIsSignedIn } from './authSlice'
import { useMeQuery } from './authApi'
import { toApiError } from '../../api/apiError'
import { Button } from '../../components/ui/Button'

/**
 * The one place routing decisions about identity are made.
 *
 * | `access`    | Not signed in | Signed in, no household | Signed in, has household |
 * |-------------|---------------|-------------------------|--------------------------|
 * | `anonymous` | **render**    | → `/pairing`            | → `/`                    |
 * | `pairing`   | → `/login`    | **render**              | → `/`                    |
 * | `household` | → `/login`    | → `/pairing`            | **render**               |
 *
 * One component rather than three guards because all three are the same decision from different
 * starting points, and because each would otherwise fetch `/api/auth/me` separately.
 *
 * The rule this implements for the middle column is `api-design.md`'s: "no household yet → pairing
 * screen, household set → main app".
 */

export type Access = 'anonymous' | 'pairing' | 'household'

export function AuthGate({ access }: { access: Access }) {
  const location = useLocation()
  const isSignedIn = useAppSelector(selectIsSignedIn)

  /**
   * Skipped when signed out: the request is guaranteed to 401, and that 401 would fire `baseApi`'s
   * auto-logout on someone who is already logged out.
   */
  const { data, isLoading, isError, error, refetch } = useMeQuery(undefined, { skip: !isSignedIn })

  if (!isSignedIn) {
    if (access === 'anonymous') return <Outlet />
    /**
     * `from` so the user lands where they asked for. Without it, following a link to `/store` while
     * signed out silently becomes the dashboard.
     */
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  // Signed in, but whether there is a household is not known until `/me` answers.
  if (isLoading || !data) {
    /**
     * Deliberately not `<Outlet/>`. Rendering optimistically would flash the dashboard before
     * bouncing a household-less user to `/pairing`, and on a slow connection would let them start
     * interacting with a screen that is about to be replaced.
     *
     * A 401 needs no branch here: `baseApi` dispatches `signedOut` on it ([42]), so the store flips
     * and the "not signed in" case above applies on the next render.
     */
    if (isError) return <MeUnavailable message={toApiError(error).message} onRetry={refetch} />
    return <Loading />
  }

  const hasHousehold = data.householdId !== null

  if (access === 'anonymous') {
    /**
     * **This is the only place that routes a user after signing in.** `LoginPage` deliberately does
     * not navigate: the moment it dispatched `signedIn`, this gate re-rendered and redirected, so a
     * `navigate()` there was a second mechanism racing this one — and losing, which silently
     * discarded the requested destination.
     *
     * Pairing still wins over `from`: a user with no household cannot use `/store` yet.
     */
    if (!hasHousehold) return <Navigate to="/pairing" replace />
    const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname
    return <Navigate to={from ?? '/'} replace />
  }

  if (access === 'pairing') return hasHousehold ? <Navigate to="/" replace /> : <Outlet />
  return hasHousehold ? <Outlet /> : <Navigate to="/pairing" replace />
}

function Loading() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      {/* `role="status"` so the wait is announced rather than being a silent blank screen. */}
      <p role="status" className="font-display text-sm font-semibold text-muted">
        Loading…
      </p>
    </div>
  )
}

/**
 * Shown when `/me` fails for a reason that is *not* a dead session.
 *
 * Deliberately not a redirect. If the network is down the household is **unknown**, not absent —
 * sending the user to `/pairing` would tell someone with a perfectly good household to go and create
 * another one.
 */
function MeUnavailable({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl">Can&apos;t load your account</h1>
      <p role="alert" className="max-w-sm text-muted">
        {message}
      </p>
      <Button onClick={onRetry}>Try again</Button>
    </div>
  )
}
