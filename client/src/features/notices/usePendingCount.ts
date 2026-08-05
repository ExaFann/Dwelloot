import { usePendingApprovalsQuery } from '../activity/activityApi'
import { selectIsSignedIn } from '../auth/authSlice'
import { useAppSelector } from '../../app/hooks'

/**
 * How many of your partner's chores are waiting on you.
 *
 * Two places need this and they must agree: the nav badge, which is on every screen, and the
 * dashboard's prompt. One hook rather than two subscriptions written twice — RTK Query dedupes the
 * request either way, but a second call site is a second chance to pass different arguments.
 *
 * **Skipped when signed out.** The nav is only rendered inside `AppLayout`, which sits behind
 * `AuthGate`, but the guard costs nothing and a `/api/activity-logs` call with no token would 401 —
 * which `baseApi` turns into a sign-out (handover §3).
 */
export function usePendingCount(): number {
  const isSignedIn = useAppSelector(selectIsSignedIn)
  const { data } = usePendingApprovalsQuery(undefined, { skip: !isSignedIn })
  return data?.items?.length ?? 0
}
