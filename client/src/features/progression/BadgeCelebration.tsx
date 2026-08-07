import { useEffect, useRef, useState } from 'react'
import { useBadgesQuery } from './badgeApi'
import { useNewlyEarnedBadge } from './useNewlyEarnedBadge'
import { BadgeMark } from '../../components/ui/icons'
import { liveQueryOptions } from '../../app/liveSync'

/**
 * The badge-earned celebration, app-wide — task [82], closing the gap the owner found in [81] F.
 *
 * [81] put the celebration on the badge *wall*, which only exists on the Me screen — and a badge
 * unlocks when your **partner approves your chore**, a moment when you are almost never on the Me
 * screen. The owner hit Century (100 lifetime points) and nothing anywhere said so. The watcher has
 * to live where the user is, which is the app shell.
 *
 * ### The cost, priced deliberately
 *
 * Mounting a query in the shell means **every signed-in screen now polls `/api/badges`** — exactly
 * the move that broke test stubs twice before ([68], [58a]). It is taken knowingly: the alternative
 * is a celebration that only works on one tab, which is the bug being fixed. Page tests render
 * pages without the shell, so the blast radius is the route-level suites, whose 404 catch-all this
 * component answers by rendering nothing (an error state here is nothing to celebrate, literally).
 *
 * ### Shape
 *
 * The loot reveal's dialog contract: scrim, any click or Escape/Enter/Space dismisses, focus on
 * mount. The badge spins with `badge-reveal` — the same animation opening it on the wall plays, so
 * earning and inspecting share one vocabulary. It also self-dismisses: a celebration that *demands*
 * a click is a nag, and the user it interrupted was in the middle of something else by definition.
 */

/** Long enough to read a name and a criteria line; short enough to never feel like a modal. */
const AUTO_DISMISS_MS = 8000

export function BadgeCelebration() {
  const { data } = useBadgesQuery(undefined, liveQueryOptions)
  const earnedId = useNewlyEarnedBadge(data?.items, AUTO_DISMISS_MS)
  /** Click-to-dismiss, tracked separately so closing early does not fight the hook's timer. */
  const [dismissedId, setDismissedId] = useState<number | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  const badge =
    earnedId !== null && earnedId !== dismissedId
      ? (data?.items.find((b) => b.id === earnedId) ?? null)
      : null

  useEffect(() => {
    if (badge) dialogRef.current?.focus()
  }, [badge])

  if (!badge) return null

  const dismiss = () => setDismissedId(badge.id)

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={`Badge unlocked: ${badge.name}`}
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
      onClick={dismiss}
      onKeyDown={(event) => {
        if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          dismiss()
        }
      }}
    >
      <div role="status" className="flex flex-col items-center gap-3 text-center">
        <BadgeMark id={badge.id} className="badge-reveal size-36" />
        <p className="font-display text-2xl font-bold" style={{ color: '#F0EBFF' }}>
          Badge unlocked!
        </p>
        <p className="font-display text-lg font-semibold" style={{ color: '#F0EBFF' }}>
          {badge.name}
        </p>
        {/* The criteria double as the caption: what you did is what it says. */}
        <p className="max-w-xs text-sm" style={{ color: '#F0EBFF' }}>
          {badge.criteria}
        </p>
      </div>
    </div>
  )
}
