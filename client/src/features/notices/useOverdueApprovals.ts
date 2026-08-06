import { usePendingApprovalsQuery } from '../activity/activityApi'
import { useCurrentCompetitionQuery } from '../competition/competitionApi'
import { useMeQuery } from '../auth/authApi'
import { selectIsSignedIn } from '../auth/authSlice'
import { useAppSelector } from '../../app/hooks'
import { liveQueryOptions } from '../../app/liveSync'

/**
 * Your partner's chores from a **previous period** that you still have not decided.
 *
 * ### Why this is not `usePendingCount`
 *
 * Two questions that look like one:
 *
 * - *"Is there anything for me to do?"* — the nav badge. Answered by `usePendingCount`, which sums
 *   chores **and** store changes, because the badge only has to say "something".
 * - *"Is anything actually stuck?"* — this. The dashboard prompt is a yellow card at the top of the
 *   first screen after every sign-in, and it earns that space only when something is genuinely
 *   blocked.
 *
 * Using the badge's count for the prompt produced two owner-reported bugs at once. The prompt fired
 * on **every** chore the partner logged, duplicating a nav badge and a Notices tab that already say
 * so — and after [68] it fired for a pending **store change** too, while rendering the number with
 * the word "chore". A reward re-price announced itself as "1 chore is waiting on you".
 *
 * ### What "overdue" means, precisely
 *
 * A chore logged **before the current daily period started**. That is the moment the thing stops
 * being ordinary and starts being a problem: settlement refuses to close a period while a pending
 * log sits inside it (`SettlementOutcome.AwaitingApprovals`), so yesterday's undecided chore is
 * holding a duel open that should already have been won or lost.
 *
 * A chore logged today is not overdue. Approving it before midnight costs nothing, and the badge is
 * already telling you it is there.
 *
 * ### Instants, never date strings
 *
 * `periodStart` is a UTC instant at *local* midnight, so `slice(0, 10)`, `getUTCDate()` and
 * `toISOString()` all report the wrong day in NZ — handover §5, and the trap log `045` hit. The
 * comparison below is between two `getTime()` values and nothing else.
 */
export function useOverdueApprovals(): number {
  const isSignedIn = useAppSelector(selectIsSignedIn)
  const { data: me } = useMeQuery(undefined, { skip: !isSignedIn })
  const householdId = me?.householdId ?? undefined

  const pending = usePendingApprovalsQuery(undefined, { skip: !isSignedIn, ...liveQueryOptions })
  const competition = useCurrentCompetitionQuery(
    { householdId: householdId as number },
    { ...liveQueryOptions, skip: householdId === undefined },
  )

  const periodStart = competition.data?.periodStart
  if (!periodStart) return 0

  const start = new Date(periodStart).getTime()
  if (Number.isNaN(start)) return 0

  /*
   * The endpoint already excludes your own logs and is already filtered to Pending, so neither is
   * re-checked here — re-deriving a rule the server owns is how the two drift apart.
   */
  return (pending.data?.items ?? []).filter((log) => new Date(log.completedAt).getTime() < start)
    .length
}
