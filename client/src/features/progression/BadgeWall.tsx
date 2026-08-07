import { useBadgesQuery } from './badgeApi'
import { badgeWallGeometry, CELL_ORDER } from './badgeWallGeometry'
import { liveQueryOptions } from '../../app/liveSync'
import { toApiError } from '../../api/apiError'
import { BadgeLockedChip, BadgeMark } from '../../components/ui/icons'
import { SkeletonList } from '../../components/ui/Skeleton'


export function BadgeWall({ size = 130 }: { size?: number }) {
  const { data, isLoading, isError, error } = useBadgesQuery(undefined, liveQueryOptions)
  const geometry = badgeWallGeometry(size)

  const byId = new Map((data?.items ?? []).map((badge) => [badge.id, badge]))
  const unlocked = (data?.items ?? []).filter((badge) => badge.unlocked).length

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
            {unlocked} of {data.items.length} unlocked
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
        <div
          className="relative mx-auto mt-4"
          style={{ width: geometry.width, height: geometry.height }}
        >
          {CELL_ORDER.flatMap((row, rowIndex) =>
            row.map((badgeId, colIndex) => {
              const { left, top } = geometry.cellAt(rowIndex, colIndex)
              const badge = byId.get(badgeId)

              /*
               * A cell whose badge the server has not seeded is architecture, not a badge: the bare
               * frame, faint, `aria-hidden`. Announcing six phantom badges would make the screen
               * reader's wall disagree with the API — and when the backend seeds 7–12 these fill in
               * with no frontend change, the same contract as `BadgeMark`'s own fallback.
               */
              if (!badge) {
                return (
                  <div
                    key={badgeId}
                    aria-hidden="true"
                    className="absolute opacity-25"
                    style={{ left, top, width: size, height: size }}
                  >
                    <BadgeMark id={0} className="size-full" />
                  </div>
                )
              }

              return (
                <div
                  key={badgeId}
                  /*
                   * The state lives in the accessible name — "Century, locked" — because the visual
                   * treatment (desaturation, a corner chip) is exactly the kind of thing that is
                   * never announced (§7.1).
                   */
                  role="img"
                  aria-label={`${badge.name}, ${badge.unlocked ? 'unlocked' : 'locked'}`}
                  title={`${badge.name} — ${badge.criteria}`}
                  className="absolute"
                  style={{ left, top, width: size, height: size }}
                >
                  <BadgeMark
                    id={badge.id}
                    className="size-full"
                    /*
                     * Desaturate, never silhouette: the only reason a badge wall motivates anyone
                     * is that the locked artwork stays visible enough to want (§7.1).
                     */
                    {...(badge.unlocked ? {} : { style: { filter: 'grayscale(1) opacity(.7)' } })}
                  />
                  {!badge.unlocked && (
                    /*
                     * Bottom-right, not centred — a centred lock covers the artwork and undoes the
                     * point above. The chip's hexagon stroke is `var(--ink-surface)`, which is what
                     * keeps a #1E1830 chip visible on the #171226 dark page (§7.2).
                     */
                    <BadgeLockedChip
                      className="absolute"
                      style={{ width: size * 0.34, right: size * 0.02, bottom: 0 }}
                    />
                  )}
                </div>
              )
            }),
          )}
        </div>
      )}
    </section>
  )
}
