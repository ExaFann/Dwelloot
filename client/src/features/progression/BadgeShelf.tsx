import { Lock, Medal } from 'lucide-react'
import { useBadgesQuery } from './badgeApi'
import { describeBadge, describeProgress } from './badgeDisplay'
import { toApiError } from '../../api/apiError'

/**
 * The badge grid — `wireframes.md` §5.
 *
 * **Every badge is shown, locked ones included**, each with the `criteria` line the server sends.
 * That is the whole reason [27] put `criteria` in the response: the grid is mostly locked for most
 * of a household's life, and a locked badge with no requirement text is a grey square that tells the
 * user nothing.
 *
 * **The order is the server's**, which is by id — log `027` chose that over unlocked-first because a
 * grid that reshuffles itself when you unlock something is a worse grid. Nothing here re-sorts.
 */
export function BadgeShelf() {
  const { data, isLoading, isError, error } = useBadgesQuery()
  const badges = data?.items ?? []

  return (
    <section
      aria-labelledby="badges-heading"
      className="rounded-base border-2 border-ink bg-card p-4 shadow-hard-lg sm:p-5"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="badges-heading" className="text-lg">
          Badges
        </h2>
        {badges.length > 0 && (
          <span className="font-display text-xs font-semibold uppercase tracking-[0.08em] text-muted">
            {describeProgress(badges)}
          </span>
        )}
      </div>

      {isError ? (
        <p role="alert" className="mt-3 text-muted">
          {toApiError(error).message}
        </p>
      ) : isLoading || !data ? (
        <p role="status" className="mt-3 text-muted">
          Loading badges…
        </p>
      ) : (
        <ul className="mt-3 grid grid-cols-2 gap-2">
          {badges.map((badge) => {
            const display = describeBadge(badge)
            return (
              <li
                key={badge.id}
                className={[
                  'rounded-base border-2 p-3',
                  /*
                   * Purple, never yellow. `design-tokens.md` §2.1 reserves yellow for Coins, loot and
                   * pending, and `project-plan.md`'s terminology is explicit that Points and Badges
                   * are not loot — "loot specifically means came out of a box". A gold badge would
                   * quietly undo a distinction the whole vocabulary rests on.
                   */
                  badge.unlocked
                    ? 'border-ink-accent bg-primary text-primary-fg'
                    : 'border-ink bg-page',
                ].join(' ')}
              >
                <div className="flex items-start gap-2">
                  {badge.unlocked ? (
                    <Medal size={16} strokeWidth={3} aria-hidden="true" className="mt-0.5 shrink-0" />
                  ) : (
                    <Lock size={16} strokeWidth={3} aria-hidden="true" className="mt-0.5 shrink-0 text-muted" />
                  )}
                  <div className="min-w-0">
                    <p className="font-display text-sm font-bold">{badge.name}</p>
                    {/*
                     * The state as a word as well as a colour and an icon: colour alone fails anyone
                     * who cannot distinguish it, and the icons differ only in shape at 16px.
                     */}
                    <p
                      className={[
                        'font-display text-[0.7rem] font-semibold uppercase tracking-[0.08em]',
                        badge.unlocked ? 'opacity-80' : 'text-muted',
                      ].join(' ')}
                    >
                      {display.status}
                    </p>
                    <p className={['mt-1 text-sm', badge.unlocked ? '' : 'text-muted'].join(' ')}>
                      {display.detail}
                    </p>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
