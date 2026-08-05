import type { ActivityLogStatus } from './activityApi'

/**
 * Turning a log row into words. Pure, so the rules are tested without rendering.
 */

export type PointsDisplay = {
  /** What to show. Never a bare number — see below. */
  text: string
  /** Which of the brand fills the status badge takes. */
  tone: 'approved' | 'pending' | 'rejected'
  label: string
}

/**
 * Renders `pointsAwarded` **through** the status.
 *
 * `pointsAwarded` is what the chore was worth when it was logged, not what was earned — it is
 * populated on `Pending` rows (not credited yet) and on `Rejected` rows (never will be). Measured in
 * [46]: a rejected "Clean the kitchen bench" still reports `pointsAwarded: 5`.
 *
 * So there is no signature here that lets a caller print the number without the context. `+5 pts`
 * beside a rejected log would be a plain lie about the user's balance.
 */
export function describeLogPoints(
  status: ActivityLogStatus,
  pointsAwarded: number,
): PointsDisplay {
  switch (status) {
    case 'Approved':
      return { text: `+${pointsAwarded} pts`, tone: 'approved', label: 'Approved' }
    case 'Pending':
      return { text: `${pointsAwarded} pts if approved`, tone: 'pending', label: 'Waiting' }
    case 'Rejected':
      // No number at all. Any figure here reads as a credit.
      return { text: 'No points', tone: 'rejected', label: 'Rejected' }
  }
}

/**
 * Which of a partner's recent chores still belong under their avatar.
 *
 * **The bug this fixes:** the head-to-head card is about the *current* period, but the chore columns
 * were "the last N logs, ever". At a day boundary the scores reset to 0–0 while the columns still
 * listed yesterday's approved chores, so the card said "nothing logged today" and showed a list of
 * things — measured live, 0–0 for the day against 120–5 for the week, with nine stale rows on screen.
 *
 * Two things stay visible, and the second is the point:
 *
 * 1. **Anything from this period** — whatever its status, it is what the score is made of.
 * 2. **Anything still `Pending`, however old.** A pending chore has not been dealt with, so clearing
 *    it would hide the only thing the user still has to act on — and it is exactly what is holding up
 *    a settled result.
 *
 * Approved and rejected chores from earlier periods are gone: they belong to a duel that is over.
 *
 * `periodStart` is a UTC instant at *local* midnight, so both sides are compared **as instants**.
 * Slicing either to a date string would report the wrong day in NZ — log `045`'s trap.
 */
export function choresForPeriod<T extends { status: ActivityLogStatus; completedAt: string }>(
  logs: readonly T[],
  periodStart: string | undefined,
): T[] {
  // Without a period there is nothing to clear against; showing everything beats showing nothing.
  if (!periodStart) return [...logs]

  const start = new Date(periodStart).getTime()
  if (Number.isNaN(start)) return [...logs]

  return logs.filter(
    (log) => log.status === 'Pending' || new Date(log.completedAt).getTime() >= start,
  )
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * "Just now" / "12 min ago" / "3 h ago" / "Yesterday" / a local date.
 *
 * `now` is a parameter so tests pin a fixed instant rather than racing the clock.
 *
 * The fallback uses `toLocaleDateString`, **never** `toISOString().slice(0, 10)`. `completedAt` is a
 * UTC instant, and in New Zealand (UTC+12/13) anything logged after local noon lands on the next UTC
 * day — so ISO slicing reports tomorrow's date. Same trap as the period boundaries in log `045`.
 */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso)
  const elapsed = now.getTime() - then.getTime()

  // Clock skew between server and browser can make a fresh log look a second into the future.
  if (elapsed < MINUTE) return 'Just now'
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} min ago`
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)} h ago`
  if (elapsed < 2 * DAY) return 'Yesterday'

  return then.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}
