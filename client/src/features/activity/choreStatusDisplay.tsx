import { PointsMark } from '../../components/ui/icons'
import type { ActivityLogStatus } from './activityApi'

/**
 * How a chore's status looks, in one place — task [84].
 *
 * ### Why this file exists
 *
 * [83] changed the notation (approved = plain number + mark, pending = **no figure**, rejected =
 * struck through) and it was applied in `RecentChoresColumn` only. Three other surfaces were
 * rendering the same idea from their own copies — the Notices chores feed, and the landing page's
 * mock duel card — so the app shipped two notations at once and the owner found the old one still
 * on the front door. The mistake was not the miss; it was that four copies existed to miss.
 *
 * These components are the fix, and it is structural: there is now one implementation, so the next
 * change to the notation cannot land in three places and skip the fourth.
 *
 * ### The rule the components encode
 *
 * | status   | dot    | title        | figure                          |
 * |----------|--------|--------------|---------------------------------|
 * | Approved | green  | plain        | the number + `PointsMark`       |
 * | Pending  | yellow | plain        | **none** — see below            |
 * | Rejected | red    | struck out   | **none**                        |
 *
 * The empty cells are the load-bearing part. `pointsAwarded` is populated on all three statuses —
 * measured in [46], a rejected chore still reports its 5 — so printing it anywhere but Approved
 * says a chore paid out when it did not. That is `describeLogPoints`'s rule, enforced here by
 * omission instead of by punctuation.
 */

const DOT: Record<ActivityLogStatus, string> = {
  Approved: 'bg-success',
  Pending: 'bg-warning',
  Rejected: 'bg-danger',
}

/**
 * The status square. `aria-hidden` by construction: colour alone never carries meaning here, so
 * every caller pairs it with the status in words — visible in the feed, `sr-only` on the dashboard.
 */
export function ChoreStatusDot({ status, className = '' }: { status: ActivityLogStatus; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`size-2 shrink-0 border border-ink-accent ${DOT[status]} ${className}`}
    />
  )
}

/** The chore's name, struck through when it was rejected — the one notation nobody needs taught. */
export function ChoreTitle({
  status,
  children,
  className = '',
}: {
  status: ActivityLogStatus
  children: React.ReactNode
  className?: string
}) {
  return (
    <span className={`${status === 'Rejected' ? 'line-through opacity-60' : ''} ${className}`}>
      {children}
    </span>
  )
}

/**
 * What the chore paid — **and nothing at all unless it actually paid**.
 *
 * No `+` sign: the mark is the unit, and a sign implies a ledger of debits and credits that does
 * not exist. Renders `null` for pending and rejected, which is what keeps an unapproved chore from
 * reading as already earned.
 */
export function ChoreCredit({
  status,
  points,
  className = '',
  markClassName = 'size-3',
}: {
  status: ActivityLogStatus
  points: number
  className?: string
  markClassName?: string
}) {
  if (status !== 'Approved') return null
  return (
    <span className={`flex shrink-0 items-center gap-0.5 ${className}`}>
      {points}
      <PointsMark className={markClassName} />
    </span>
  )
}
