import { useEffect, useRef, useState } from 'react'
import type { Badge } from './badgeApi'

/**
 * The badge you *just earned* — task [81] F.
 *
 * `badge-reveal` has always fired when you **open** a badge, which is the moment you go looking.
 * Earning one passed in complete silence: the badge list is polled, so a badge can unlock while you
 * are on the Me screen and the only sign is that a grey hexagon is suddenly coloured. This watches
 * the list and reports an id that crossed from locked to unlocked while you were watching.
 *
 * ### Why the first load never counts
 *
 * The initial response is not a set of changes, it is the state — so the first list is recorded as
 * the baseline and nothing fires. Otherwise every visit to the Me screen would celebrate every
 * badge already earned, which is both wrong and, at twelve of them, a mess.
 *
 * Returns the id rather than a boolean: the wall needs to know *which* cell to celebrate.
 */
export function useNewlyEarnedBadge(badges: Badge[] | undefined, durationMs = 1400): number | null {
  /** `null` until the first list lands — the baseline, not an empty set of unlocked badges. */
  const seen = useRef<Set<number> | null>(null)
  const [earned, setEarned] = useState<number | null>(null)

  useEffect(() => {
    if (!badges) return

    const unlocked = new Set(badges.filter((b) => b.unlocked).map((b) => b.id))

    if (seen.current === null) {
      seen.current = unlocked
      return
    }

    const fresh = [...unlocked].find((id) => !seen.current!.has(id))
    seen.current = unlocked
    if (fresh === undefined) return

    setEarned(fresh)
    const timer = setTimeout(() => setEarned(null), durationMs)
    return () => clearTimeout(timer)
  }, [badges, durationMs])

  return earned
}
