import { Link } from 'react-router'
import { Undo2 } from 'lucide-react'
import { useActivitiesQuery } from './activityApi'
import { useDeferredLog } from './useDeferredLog'
import { interleaveBySize } from './tileOrder'
import { toApiError } from '../../api/apiError'

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
  const { data, isLoading, isError, error, refetch } = useActivitiesQuery({})
  const { queued, queue, undo, isQueued, failure } = useDeferredLog()

  return (
    <section
      aria-labelledby="quick-log-heading"
      className="rounded-base border-2 border-ink bg-card p-4 shadow-hard-lg sm:p-5"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="quick-log-heading" className="text-lg">
          Quick log
        </h2>
        <Link
          to="/log"
          className="focus-ring font-display text-sm font-semibold text-primary underline"
        >
          All chores
        </Link>
      </div>

      {isError ? (
        <>
          <p role="alert" className="mt-3 text-muted">
            {toApiError(error).message}
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="focus-ring pressable-sm mt-3 rounded-base border-2 border-ink bg-card px-3 py-1.5 font-display text-sm font-bold uppercase"
          >
            Try again
          </button>
        </>
      ) : isLoading || !data ? (
        <p role="status" className="mt-3 text-muted">
          Loading chores…
        </p>
      ) : data.items.length === 0 ? (
        <p className="mt-3 text-muted">No chores in your household yet.</p>
      ) : (
        <ul className="mt-4 flex flex-wrap gap-2.5">
          {/* Long and short interleaved, so each row gets a wide brick and a narrow one. */}
          {interleaveBySize(data.items, (a) => a.title.length).map((activity) => {
            const waiting = isQueued(activity.id)
            return (
              <li key={activity.id}>
                <button
                  type="button"
                  onClick={() => queue(activity.id, activity.title)}
                  // Announced so the queued state is not purely visual.
                  aria-pressed={waiting}
                  className={[
                    'focus-ring rounded-base border-2 px-3 py-2.5 font-display text-xs font-semibold transition-[rotate]',
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
