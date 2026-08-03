import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { useActivitiesQuery, useCreateActivityLogMutation } from '../features/activity/activityApi'
import { toApiError } from '../api/apiError'
import { Button } from '../components/ui/Button'

/**
 * The deliberate logging path, as distinct from the dashboard's quick-add ([46]).
 *
 * Quick-add is one tap on five common chores. This is the full list with a selection and a submit —
 * it optimises for finding the chore you *don't* do every day.
 *
 * No note field and no voice input: cut deliberately in `wireframes.md` §2, not overlooked.
 */
export function LogActivityPage() {
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [confirmation, setConfirmation] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // A request per keystroke is wasteful for a list this size.
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 250)
    return () => clearTimeout(timer)
  }, [search])

  const {
    data,
    isLoading,
    isError,
    error: loadError,
    refetch,
  } = useActivitiesQuery({ search: debounced })
  const [createLog, { isLoading: isSubmitting }] = useCreateActivityLogMutation()

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (selectedId === null) return

    const chore = data?.items.find((item) => item.id === selectedId)
    setConfirmation(null)
    setError(null)

    try {
      await createLog({ activityId: selectedId }).unwrap()
      setConfirmation(`${chore?.title ?? 'Chore'} logged — waiting for approval.`)
      // Cleared so a second log is a deliberate choice, not a stray tap on a still-live button.
      setSelectedId(null)
    } catch (caught) {
      setError(toApiError(caught).message)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl">Log a chore</h1>
        <p className="mt-2 text-muted">
          Pick what you did. Your partner approves it before the points count.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="chore-search" className="font-display text-sm font-semibold">
            Search
          </label>
          <input
            id="chore-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Dishes, laundry…"
            className="focus-ring rounded-base border-2 border-ink bg-card px-3 py-2.5 text-body placeholder:text-muted"
          />
        </div>

        {isError ? (
          <div className="rounded-base border-2 border-ink bg-card p-5 shadow-hard-lg">
            <p role="alert" className="text-muted">
              {toApiError(loadError).message}
            </p>
            <Button variant="neutral" className="mt-3" onClick={() => void refetch()}>
              Try again
            </Button>
          </div>
        ) : isLoading || !data ? (
          <p role="status" className="text-muted">
            Loading chores…
          </p>
        ) : data.items.length === 0 ? (
          <p className="rounded-base border-2 border-ink bg-card p-5 text-muted shadow-hard-lg">
            {debounced ? `No chores match “${debounced}”.` : 'No chores in your household yet.'}
          </p>
        ) : (
          /*
           * A real radio group, restyled rather than replaced. Arrow-key navigation, single
           * selection and `aria-checked` all come from the native control; a div-based list would
           * need every one of them rebuilt, and usually ends up with none.
           */
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">Choose a chore</legend>
            {data.items.map((activity) => {
              const isSelected = selectedId === activity.id
              return (
                <label
                  key={activity.id}
                  className={[
                    'pressable-sm flex cursor-pointer items-center justify-between gap-3 rounded-base border-2 px-3 py-2.5 font-display text-sm font-semibold',
                    isSelected
                      ? 'border-ink-accent bg-primary text-primary-fg'
                      : 'border-ink bg-card',
                    // The focus ring has to come from the hidden input, or keyboard users see nothing.
                    'has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary',
                  ].join(' ')}
                >
                  <span className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="activityId"
                      value={activity.id}
                      checked={isSelected}
                      onChange={() => setSelectedId(activity.id)}
                      className="sr-only"
                    />
                    {activity.title}
                  </span>
                  <span
                    className={[
                      'shrink-0 rounded-base border-2 border-ink-accent px-2 py-0.5 text-xs font-bold',
                      isSelected ? 'bg-card text-body' : 'bg-warning text-warning-fg',
                    ].join(' ')}
                  >
                    {activity.points} pts
                  </span>
                </label>
              )
            })}
          </fieldset>
        )}

        {error && (
          <p role="alert" className="font-display text-sm font-bold text-danger">
            {error}
          </p>
        )}
        {confirmation && (
          <p
            role="status"
            className="rounded-base border-2 border-ink-accent bg-success px-3 py-2.5 font-display text-sm font-bold text-success-fg"
          >
            {confirmation}
          </p>
        )}

        {/*
         * Sticky, sitting just above the bottom navigation.
         *
         * The list is twelve rows on a fresh household and grows with custom chores, so a submit
         * button after it means selecting the first chore and then scrolling the entire list to act
         * on it. Only visible once a screenshot showed the button off-screen below the fold.
         */}
        <div className="sticky bottom-[4.5rem] -mx-4 border-t-2 border-ink bg-page px-4 pb-2 pt-3">
          <Button
            type="submit"
            className="w-full"
            disabled={selectedId === null}
            pending={isSubmitting}
            pendingLabel="Logging…"
          >
            Log this chore
          </Button>
        </div>
      </form>

      <p className="text-sm text-muted">
        <Link to="/" className="focus-ring font-semibold text-primary underline">
          Back to Home
        </Link>
      </p>
    </div>
  )
}
