import { usePendingApprovalsQuery } from '../activity/activityApi'
import { usePendingRewardChangesQuery } from '../reward/rewardChangeApi'
import { selectIsSignedIn } from '../auth/authSlice'
import { useAppSelector } from '../../app/hooks'
import { liveQueryOptions } from '../../app/liveSync'

/**
 * How many things are waiting on you — chores, and since [68] store changes too.
 *
 * Two places need this and they must agree: the nav badge, which is on every screen, and the
 * dashboard's prompt. One hook rather than two subscriptions written twice — RTK Query dedupes the
 * request either way, but a second call site is a second chance to pass different arguments.
 *
 * **Skipped when signed out.** The nav is only rendered inside `AppLayout`, which sits behind
 * `AuthGate`, but the guard costs nothing and a `/api/activity-logs` call with no token would 401 —
 * which `baseApi` turns into a sign-out (handover §3).
 *
 * ### Why the two are summed rather than shown separately
 *
 * The badge answers one question — *is there anything for me to do?* — and a user who sees "1" and
 * finds only a store change has not been misled. Splitting it would need two badges on one icon, or
 * a badge that means different things on different screens. The Notices tab itself is where the two
 * are told apart, by being different sections.
 */
export function usePendingCount(): number {
  const isSignedIn = useAppSelector(selectIsSignedIn)
  const chores = usePendingApprovalsQuery(undefined, { skip: !isSignedIn, ...liveQueryOptions })
  const storeChanges = usePendingRewardChangesQuery(undefined, {
    skip: !isSignedIn,
    ...liveQueryOptions,
  })

  return (chores.data?.items?.length ?? 0) + (storeChanges.data?.length ?? 0)
}
