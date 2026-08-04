import type { Badge } from './badgeApi'
import { relativeTime } from '../activity/logDisplay'

/**
 * What each badge says, decided here rather than in JSX — the split `standing.ts` and `lootBoxCopy.ts`
 * already use, so the rules are a table rather than a render.
 */

export type BadgeDisplay = {
  /** "Unlocked" / "Locked" — a **word**, so the state is not carried by colour alone. */
  status: string
  /** The line under the name: when it was earned, or what earns it. */
  detail: string
}

export function describeBadge(badge: Badge, now: Date = new Date()): BadgeDisplay {
  if (badge.unlocked) {
    return {
      status: 'Unlocked',
      /**
       * `unlockedAt` is a plain instant, so relative time is safe here — unlike a period boundary,
       * which is UTC at *local* midnight and cannot be read as a date (log `045`).
       *
       * The null branch is not decoration: `unlocked` and `unlockedAt` are separate fields, so the
       * combination is expressible even though the server should never send it.
       */
      detail: badge.unlockedAt ? `Earned ${relativeTime(badge.unlockedAt, now).toLowerCase()}` : 'Earned',
    }
  }

  // Straight from the response. See `Badge.criteria` for why there is no local copy of these.
  return { status: 'Locked', detail: badge.criteria }
}

/**
 * "3 of 6 unlocked".
 *
 * Both numbers are counted from the list. Hard-coding the six would be wrong the moment a seventh
 * badge is seeded — and log `027` built the endpoint so that a seventh appears without any client
 * change at all.
 */
export function describeProgress(badges: Badge[]): string {
  const unlocked = badges.filter((badge) => badge.unlocked).length
  return `${unlocked} of ${badges.length} unlocked`
}
