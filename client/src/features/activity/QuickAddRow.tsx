import { useState } from 'react'
import { Link } from 'react-router'
import { useCreateActivityLogMutation, useQuickAddActivitiesQuery } from './activityApi'
import { toApiError } from '../../api/apiError'

/**
 * One-tap logging for the five most common chores, plus the route to the full list ([47]).
 *
 * Not optimistic: the row is confirmed by the server before anything says it worked. A chore added
 * optimistically and then rejected would have to be silently un-added, and the request is fast
 * enough that the honesty costs nothing.
 */
export function QuickAddRow() {
  const { data, isLoading, isError, error, refetch } = useQuickAddActivitiesQuery()
  const [createLog] = useCreateActivityLogMutation()

  /**
   * Per-button, not per-page. With five buttons in a row, one shared "Logged." message at the top of
   * the card does not say *which* chore it refers to.
   */
  const [busyId, setBusyId] = useState<number | null>(null)
  const [result, setResult] = useState<{ id: number; message: string; ok: boolean } | null>(null)

  async function log(activityId: number, title: string) {
    setBusyId(activityId)
    setResult(null)
    try {
      await createLog({ activityId }).unwrap()
      setResult({ id: activityId, message: `${title} logged — waiting for approval.`, ok: true })
    } catch (caught) {
      setResult({ id: activityId, message: toApiError(caught).message, ok: false })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section
      aria-labelledby="quick-add-heading"
      className="rounded-base border-2 border-ink bg-card p-5 shadow-hard-lg"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="quick-add-heading" className="text-lg">
          Quick add
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
            className="focus-ring pressable mt-3 rounded-base border-2 border-ink bg-card px-3 py-1.5 font-display text-sm font-bold uppercase"
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
        <ul className="mt-3 flex flex-col gap-2">
          {data.items.map((activity) => {
            const isBusy = busyId === activity.id
            const shown = result?.id === activity.id ? result : null
            const justLogged = shown?.ok === true
            return (
              <li key={activity.id}>
                <button
                  type="button"
                  disabled={isBusy}
                  aria-busy={isBusy || undefined}
                  onClick={() => void log(activity.id, activity.title)}
                  className={[
                    'focus-ring flex w-full items-center justify-between gap-3 rounded-base border-2 border-ink bg-card px-3 py-2.5 text-left font-display text-sm font-semibold',
                    isBusy ? 'cursor-wait opacity-60' : 'pressable-sm',
                  ].join(' ')}
                >
                  <span>{activity.title}</span>
                  {/*
                   * Success replaces the points badge rather than adding a line beneath the button.
                   * A message below reflows the list, so the next chore the user wanted has moved by
                   * the time they reach for it — visible only once screenshots came back.
                   */}
                  <span
                    className={[
                      'shrink-0 rounded-base border-2 border-ink-accent px-2 py-0.5 text-xs font-bold',
                      justLogged ? 'bg-success text-success-fg' : 'bg-warning text-warning-fg',
                    ].join(' ')}
                  >
                    {justLogged ? 'Logged' : `${activity.points} pts`}
                  </span>
                </button>

                {/* Announced, not shown: the badge carries it visually, but "Logged" alone does not
                    say which chore, and a screen reader user has no spatial context for it. */}
                {justLogged && (
                  <p role="status" className="sr-only">
                    {shown.message}
                  </p>
                )}

                {/* Failures keep a visible message — they need the server's full sentence, and a
                    reflow is a fair price for an error the user has to read. */}
                {shown && !shown.ok && (
                  <p role="alert" className="mt-1 text-sm font-semibold text-danger">
                    {shown.message}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
