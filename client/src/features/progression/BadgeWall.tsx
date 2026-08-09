import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useBadgesQuery, type Badge } from './badgeApi'
import { useNewlyEarnedBadge } from './useNewlyEarnedBadge'
import { describeBadge, describeProgress } from './badgeDisplay'
import { badgeWallGeometry, CELL_ORDER } from './badgeWallGeometry'
import { liveQueryOptions } from '../../app/liveSync'
import { toApiError } from '../../api/apiError'
import {
  BadgeLockedChip,
  BadgeMark,
  BadgeSlotMark,
  LockIcon,
  RejectIcon,
} from '../../components/ui/icons'
import { SkeletonList } from '../../components/ui/Skeleton'

/**
 * The honeycomb, at every width — task [76a] retired the box-card shelf that used to stand in
 * below `md`. [76] kept the shelf for two reasons and this revision dissolves both: the cell size
 * is measured rather than fixed (so the wall reflows), and the criteria sentence now lives in the
 * click overlay (so it needs no hover and no card).
 */

/** `geometry.width / size` — how many cell-widths the whole honeycomb spans. */
const WALL_WIDTH_IN_CELLS = badgeWallGeometry(1).width

/** The wall's desaturation for locked artwork; the overlay reuses it so the tease stays a tease. */
const LOCKED_FILTER = { filter: 'grayscale(1) opacity(.7)' } as const

export function BadgeWall({ size = 130 }: { size?: number }) {
  const { data, isLoading, isError, error } = useBadgesQuery(undefined, liveQueryOptions)
  const justEarned = useNewlyEarnedBadge(data?.items)

  /*
   * Measured, not observed: a window `resize` listener covers every reflow this layout actually
   * has (the container is a full-width column). In jsdom `clientWidth` is 0, so the explicit
   * `size` prop stands — which is what keeps the worked-pixel-table tests meaningful.
   */
  const frameRef = useRef<HTMLDivElement>(null)
  const [measured, setMeasured] = useState(0)
  useLayoutEffect(() => {
    const measure = () => setMeasured(frameRef.current?.clientWidth ?? 0)
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  const cell = measured > 0 ? Math.min(size, measured / WALL_WIDTH_IN_CELLS) : size
  const geometry = badgeWallGeometry(cell)

  const [openBadge, setOpenBadge] = useState<Badge | null>(null)
  /**
   * The locked path ([76b]): a locked badge does not open the spin overlay — the celebration is
   * for something you have; a locked one gets a tip naming what earns it. One at a time; the
   * newest click wins.
   */
  const [lockedTip, setLockedTip] = useState<Badge | null>(null)
  /** Where focus returns when the overlay closes — the cell that opened it. */
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const close = () => {
    setOpenBadge(null)
    triggerRef.current?.focus()
  }

  const byId = new Map((data?.items ?? []).map((badge) => [badge.id, badge]))
  const comingCount = CELL_ORDER.flat().filter((id) => !byId.has(id)).length

  return (
    <section
      aria-labelledby="badge-wall-heading"
      className="rounded-base border-2 border-ink bg-card p-4 sm:p-5"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="badge-wall-heading" className="text-lg">
          Badges
        </h2>
        {data && (
          <span className="font-display text-xs font-semibold uppercase tracking-[0.08em] text-muted">
            {describeProgress(data.items)}
          </span>
        )}
      </div>

      {isError ? (
        <p role="alert" className="mt-3 text-muted">
          {toApiError(error).message}
        </p>
      ) : isLoading || !data ? (
        <div className="mt-3">
          <SkeletonList label="Loading your badges" rows={3} />
        </div>
      ) : (
        <div ref={frameRef} className="mt-4">
          {/*
           * The locked-badge tip ([76b]): what the clicked badge takes to earn, as a live status
           * strip rather than the overlay — the spin celebration is reserved for badges you have.
           * `role="status"` announces the criteria without stealing focus; the × dismisses, and
           * clicking another locked badge replaces the text in place.
           */}
          {lockedTip && (
            <p
              role="status"
              className="mb-3 flex items-center justify-between gap-2 rounded-base border-2 border-ink bg-page px-3 py-2"
            >
              <span className="flex min-w-0 items-center gap-2 font-display text-sm font-bold">
                <LockIcon className="size-4 shrink-0" />
                <span className="min-w-0">
                  {lockedTip.name}: <span className="font-semibold">{lockedTip.criteria}</span>
                </span>
              </span>
              <button
                type="button"
                aria-label="Dismiss"
                className="focus-ring shrink-0"
                onClick={() => setLockedTip(null)}
              >
                <RejectIcon className="size-3.5" />
              </button>
            </p>
          )}
          {/*
           * The placeholder cells are aria-hidden (six identical "coming soon" announcements would
           * be noise), so the count reaches a screen reader as one sentence instead.
           */}
          {comingCount > 0 && (
            <p className="sr-only">
              {comingCount} more badge{comingCount === 1 ? '' : 's'} coming soon.
            </p>
          )}
          <div
            className="relative mx-auto"
            style={{ width: geometry.width, height: geometry.height }}
          >
            {CELL_ORDER.flatMap((row, rowIndex) =>
              row.map((badgeId, colIndex) => {
                const { left, top } = geometry.cellAt(rowIndex, colIndex)
                const badge = byId.get(badgeId)

                /*
                 * A cell the server has not seeded: solid dark with a "More coming" label — the
                 * owner's call ([76a]), replacing [76]'s faint empty frame. Still `aria-hidden`,
                 * and still the same contract: the moment the backend seeds this id, the cell
                 * becomes an ordinary badge with no code change here.
                 */
                if (!badge) {
                  return (
                    <div
                      key={badgeId}
                      aria-hidden="true"
                      className="absolute"
                      style={{ left, top, width: cell, height: cell }}
                    >
                      <BadgeSlotMark className="size-full" />
                      <span
                        className="absolute inset-0 grid place-items-center text-center font-display font-bold uppercase tracking-[0.08em]"
                        /* Fixed light-on-dark: the hexagon is #1E1830 in both schemes. */
                        style={{ fontSize: cell * 0.075, color: '#F0EBFF' }}
                      >
                        More
                        <br />
                        coming
                      </span>
                    </div>
                  )
                }

                return (
                  <button
                    key={badgeId}
                    type="button"
                    /*
                     * The state lives in the accessible name — "Century, locked" — because the
                     * visual treatment (desaturation, the lock) is exactly the kind of thing that
                     * is never announced (§7.1). Clicking an unlocked badge opens the overlay; a
                     * locked one surfaces the criteria tip ([76b]) — so only the unlocked cells
                     * claim `aria-haspopup`. No press physics, same reasoning as the Log tab.
                     */
                    aria-label={`${badge.name}, ${badge.unlocked ? 'unlocked' : 'locked'}`}
                    {...(badge.unlocked ? { 'aria-haspopup': 'dialog' as const } : {})}
                    title={`${badge.name} — ${badge.criteria}`}
                    className="focus-ring absolute"
                    style={{ left, top, width: cell, height: cell }}
                    onClick={(event) => {
                      if (badge.unlocked) {
                        triggerRef.current = event.currentTarget
                        setLockedTip(null)
                        setOpenBadge(badge)
                      } else {
                        setLockedTip(badge)
                      }
                    }}
                  >
                    <BadgeMark
                      id={badge.id}
                      /*
                       * [81] F — the cell spins when this badge is earned *while you are watching*,
                       * reusing the overlay's own reveal. Earning used to be silent: badges are
                       * polled, so one could unlock on this very screen and the only sign was a
                       * grey hexagon quietly turning colour.
                       */
                      className={justEarned === badge.id ? 'badge-reveal size-full' : 'size-full'}
                      /*
                       * Desaturate, never silhouette: the only reason a badge wall motivates
                       * anyone is that the locked artwork stays visible enough to want (§7.1).
                       */
                      {...(badge.unlocked ? {} : { style: LOCKED_FILTER })}
                    />
                    {!badge.unlocked && (
                      /*
                       * Centred — the owner's call ([76b]), overriding [76]'s corner placement:
                       * a corner chip pokes outside the hexagon and physically overlaps the
                       * neighbouring cells in the honeycomb, which beats "a centred lock covers
                       * some artwork". The desaturation above keeps the artwork readable around
                       * it. The chip's hexagon stroke is `var(--ink-surface)`, which is what
                       * keeps a #1E1830 chip visible on the #171226 dark page (§7.2).
                       */
                      <BadgeLockedChip
                        className="absolute"
                        style={{ width: cell * 0.34, left: cell * 0.33, top: cell * 0.33 }}
                      />
                    )}
                  </button>
                )
              }),
            )}
          </div>
        </div>
      )}

      {openBadge && <BadgeOverlay badge={openBadge} onClose={close} />}
    </section>
  )
}

/**
 * The badge, centre stage — name, state, criteria, and the spin-in ([76a]).
 *
 * **Any interaction closes it**: the owner's ask is "click again to go back", so the scrim and the
 * card both dismiss (nothing stops propagation), as do Escape/Enter/Space. Focus lands here on
 * open — the keydown handler needs it, and a screen reader should hear the dialog — and the wall
 * returns it to the opening cell on close.
 */
function BadgeOverlay({ badge, onClose }: { badge: Badge; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    dialogRef.current?.focus()
  }, [])

  /*
   * `describeBadge` is the shelf's old display table, surviving its component: the status word,
   * and — for an unlocked badge — the "Earned 13 h ago" line the shelf used to show, which would
   * otherwise be information the shelf's deletion silently lost. The criteria sentence renders for
   * both states (it is the summary the overlay exists to show); for a locked badge it *is* the
   * detail, so the extra line renders only when unlocked.
   */
  const display = describeBadge(badge)

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="badge-overlay-name"
      aria-describedby="badge-overlay-criteria"
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onClose()
        }
      }}
    >
      <div className="flex w-full max-w-sm flex-col items-center gap-2 rounded-base border-2 border-ink bg-card p-6 text-center">
        <div className="badge-reveal size-44">
          {/* Locked artwork stays desaturated even here — the wall's tease rule, kept (§7.1). */}
          <BadgeMark
            id={badge.id}
            className="size-full"
            {...(badge.unlocked ? {} : { style: LOCKED_FILTER })}
          />
        </div>
        <h3 id="badge-overlay-name" className="font-display text-xl font-bold">
          {badge.name}
        </h3>
        <p className="font-display text-xs font-semibold uppercase tracking-[0.08em] text-muted">
          {display.status}
        </p>
        <p id="badge-overlay-criteria" className="text-sm text-muted">
          {badge.criteria}
        </p>
        {badge.unlocked && <p className="text-xs text-muted">{display.detail}</p>}
      </div>
    </div>
  )
}
