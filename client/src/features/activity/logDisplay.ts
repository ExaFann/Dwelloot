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
