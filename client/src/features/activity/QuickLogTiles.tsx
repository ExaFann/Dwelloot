import { useState } from 'react'
import { Link } from 'react-router'
import { SlidersHorizontal, Undo2 } from 'lucide-react'
import { useActivitiesQuery } from './activityApi'
import { liveQueryOptions } from '../../app/liveSync'
import { useDeferredLog } from './useDeferredLog'
import { interleaveBySize } from './tileOrder'
import { toApiError } from '../../api/apiError'
import { SkeletonList } from '../../components/ui/Skeleton'
import { QuickLogManager } from './QuickLogManager'

/**
 * One-tap logging, as a wall of bricks rather than a list.
 *
 * Rows of uniform full-width buttons read as a form to fill in; the point of this section is that
 * logging a chore should feel like a quick, low-stakes tap. So each tile is **sized by its own
 * text**, they wrap, and each carries a small deterministic tilt — the same chore always leans the
 * same way — which reads as hand-stacked rather than machine-aligned. Hovering straightens the tile,
 * which is what makes it feel picked up.
 *
 * **Points are deliberately not shown.** They are on the Log tab, where the choice is deliberate.
 * Here they cost a line of width per tile and turn a wall of names into a price list.
 */

/** Small, and never zero for two adjacent tiles in a row — a uniform tilt is just a rotated grid. */
const TILTS = ['-rotate-2', 'rotate-1', '-rotate-1', 'rotate-2', 'rotate-0', '-rotate-1'] as const

function tiltOf(id: number): string {
  return TILTS[Math.abs(Math.trunc(id)) % TILTS.length]
}

export function QuickLogTiles() {
  const { data, isLoading, isError, error, refetch } = useActivitiesQuery(
    {
      /*
       * Task [73]. The wall was never a shortlist — it asked for the whole catalogue and rendered
       * whatever came back, capped only by the server's default page size, so a household with thirty
       * chores got thirty tiles. It now asks for the ones marked for it; the Log tab still lists
       * everything, which is where the marking is done.
       */
      isQuick: true,
    },
    liveQueryOptions,
  )
  const { queued, queue, undo, isQueued, failure } = useDeferredLog()
  const [isManaging, setIsManaging] = useState(false)

  return (
    <section
      aria-labelledby="quick-log-heading"
      className="rounded-base border-2 border-ink bg-card p-4 sm:p-5"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="quick-log-heading" className="text-lg">
          Quick log
        </h2>
        {/*
         * Task [73], owner's note. The wall became curatable and nothing on this screen said so —
         * the only way in was to open a chore's editor on a different tab, which you would have to
         * already know about in order to go looking for it. A list you can curate needs a visible
         * way to curate it, beside the list.
         */}
        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            aria-expanded={isManaging}
            onClick={() => setIsManaging((open) => !open)}
            className="focus-ring inline-flex items-center gap-1.5 font-display text-sm font-semibold text-primary"
          >
            <SlidersHorizontal size={14} strokeWidth={3} aria-hidden="true" />
            Choose
          </button>
          <Link
            to="/log"
            className="focus-ring font-display text-sm font-semibold text-primary underline"
          >
            All chores
          </Link>
        </div>
      </div>

      {isManaging && <QuickLogManager onClose={() => setIsManaging(false)} />}

      {isError ? (
        <>
          <p role="alert" className="mt-3 text-muted">
            {toApiError(error).message}
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="focus-ring pressable-sm mt-3 rounded-control border-2 border-ink bg-card px-3 py-1.5 font-display text-sm font-bold uppercase"
          >
            Try again
          </button>
        </>
      ) : isLoading || !data ? (
        <div className="mt-3">
          <SkeletonList label="Loading your chores" rows={3} />
        </div>
      ) : data.items.length === 0 ? (
        <p className="mt-3 text-muted">No chores in your household yet.</p>
      ) : (
        /*
         * Tighter tiles on a phone (`ui-exp01`).
         *
         * At 390px two long titles filled a row and left a ragged margin down the right — two bricks
         * per row is a list with extra steps, and the "hand-stacked wall" only appeared on a desktop.
         * Smaller type and padding below `sm` fits three or more per row, which is what makes the
         * wrap look deliberate rather than starved.
         */
        <ul className="mt-4 flex flex-wrap items-start gap-1.5 sm:gap-2.5">
          {/* Long and short interleaved, so each row gets a wide brick and a narrow one. */}
          {interleaveBySize(data.items, (a) => a.title.length).map((activity) => {
            const waiting = isQueued(activity.id)
            return (
              /*
               * **The sizing lives on the `li`, because that is the flex child** — the button is
               * inside it, so `grow` on the button did nothing. Cost one wrong measurement to find.
               *
               * `grow` + a small `basis` is what removes the dead margin the owner saw: tiles share
               * whatever is left of a row instead of leaving up to 113px unused at the right edge.
               * The wall still looks hand-stacked because titles wrap at different lengths and the
               * rows hold different counts — variety now comes from height, not from ragged slack.
               *
               * `basis` is deliberately small: it is the *minimum* a tile bids for, so three or four
               * fit a narrow column. This is why the Quick log looks right in the dashboard's 332px
               * side column at 1280 as well as full-width on a phone — the tiles respond to the space
               * they are in, which a `sm:` viewport breakpoint could never do.
               */
              <li key={activity.id} className="grow basis-[5.5rem]">
                <button
                  type="button"
                  onClick={() => queue(activity.id, activity.title)}
                  // Announced so the queued state is not purely visual.
                  aria-pressed={waiting}
                  className={[
                    'focus-ring w-full rounded-control border-2 px-2 py-1.5 text-left font-display text-[0.7rem] font-semibold leading-tight transition-[rotate] sm:px-3 sm:py-2.5 sm:text-xs',
                    // Straightening on hover is what makes a tilted tile feel picked up.
                    waiting
                      ? 'rotate-0 border-ink-accent bg-success text-success-fg'
                      : `${tiltOf(activity.id)} pressable-sm border-ink bg-card hover:rotate-0`,
                  ].join(' ')}
                >
                  {activity.title}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {/*
       * The undo window. Nothing has been sent yet — there is no endpoint to delete a log, so this
       * is the only moment an accidental tap can be taken back. See `useDeferredLog`.
       */}
      {queued.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {queued.map((item) => (
            <li
              key={item.key}
              className="flex items-center justify-between gap-3 rounded-base border-2 border-ink-accent bg-success px-3 py-2 text-success-fg"
            >
              <span role="status" className="font-display text-sm font-bold">
                {item.title} logged
              </span>
              <button
                type="button"
                onClick={() => undo(item.key)}
                className="focus-ring flex items-center gap-1 rounded-base border-2 border-ink-accent bg-card px-2 py-1 font-display text-xs font-bold text-body"
              >
                <Undo2 size={12} strokeWidth={3} aria-hidden="true" />
                Undo
              </button>
            </li>
          ))}
        </ul>
      )}

      {failure && (
        <p role="alert" className="mt-3 font-display text-sm font-bold text-danger">
          {failure}
        </p>
      )}
    </section>
  )
}
