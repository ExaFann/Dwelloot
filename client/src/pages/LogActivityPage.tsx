import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { AddIcon, ApproveIcon, EditIcon, PointsMark, UndoIcon } from '../components/ui/icons'
import { useActivitiesQuery, type Activity } from '../features/activity/activityApi'
import { ChoreEditor } from '../features/activity/ChoreEditor'
import { useDeferredLog } from '../features/activity/useDeferredLog'
import { useLongPress } from '../features/activity/useLongPress'
import { toApiError } from '../api/apiError'
import { Button } from '../components/ui/Button'
import { liveQueryOptions } from '../app/liveSync'
import { useTransientMessage } from '../app/useTransientMessage'
import { SkeletonList } from '../components/ui/Skeleton'

/**
 * The Log tab: a household's whole chore catalogue, plus logging one or several.
 *
 * Everything the API offers for activities lives here — list, search, create, rename, re-price and
 * remove ([18] built the CRUD; this is its only consumer) — because they are one job.
 *
 * ### How editing is reached, and why it is not a hidden gesture
 *
 * Tapping a chore **selects** it, and selection is multi: several can be logged in one go. Once
 * exactly one chore is selected, the action bar also offers **Edit** and **Remove**. That is the
 * discoverable route — the actions appear as a consequence of something the user already did, with
 * nothing to know in advance.
 *
 * **Press-and-hold** on a row opens its editor directly, for anyone who learns it. It is a shortcut
 * on top of the visible path, never the only way in: a gesture that is the sole route to deleting
 * something is a feature most people never find.
 */
export function LogActivityPage() {
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  /* The shared mechanism, not a private copy — see `useTransientMessage`. */
  const { message: notice, show: setNotice } = useTransientMessage()

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
  } = useActivitiesQuery({ search: debounced }, liveQueryOptions)

  /** Same undo window as the dashboard — nothing is sent until it closes. */
  const { queued, queue, undo, failure } = useDeferredLog()

  const selected = data?.items.filter((item) => selectedIds.includes(item.id)) ?? []
  const onlySelected = selected.length === 1 ? selected[0] : null

  function toggle(id: number) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    )
  }

  function logSelected() {
    for (const chore of selected) queue(chore.id, chore.title)
    setSelectedIds([])
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl">Log a chore</h1>
        <p className="mt-2 text-muted">
          Tap the chores you did — pick several if you like. Your partner approves them before the
          points count.
        </p>
      </div>

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
          className="focus-ring rounded-base border-2 border-ink bg-card px-3 py-2.5 text-body placeholder:text-placeholder"
        />
      </div>

      {isError ? (
        <div className="rounded-base border-2 border-ink bg-card p-5">
          <p role="alert" className="text-muted">
            {toApiError(loadError).message}
          </p>
          <Button variant="neutral" className="mt-3" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      ) : isLoading || !data ? (
        <SkeletonList label="Loading your chores" rows={6} />
      ) : data.items.length === 0 ? (
        <p className="rounded-base border-2 border-ink bg-card p-5 text-muted">
          {debounced ? `No chores match “${debounced}”.` : 'No chores in your household yet.'}
        </p>
      ) : (
        /*
         * One column on a phone, two on a tablet, three on a desktop.
         *
         * [58] gave this two columns from `lg` and stopped there, which left a 1280px desktop showing
         * two ~450px rows for a title that is rarely longer than "Clean the bathroom" — most of each
         * row was empty. Owner's call.
         *
         * Viewport breakpoints are the right instrument *here*, unlike the quick-log wall on the
         * dashboard: this list is the page's full content column, so the viewport and the container
         * grow together. `ui-exp01` R2.3 records the case where that is not true.
         */
        <ul className="grid grid-cols-1 gap-2 md:grid-cols-2 md:items-start xl:grid-cols-3">
          {data.items.map((activity) =>
            editingId === activity.id ? (
              <li key={activity.id}>
                <ChoreEditor
                  activity={activity}
                  onDone={(message) => {
                    setEditingId(null)
                    setSelectedIds((ids) => ids.filter((id) => id !== activity.id))
                    setNotice(message)
                  }}
                  onCancel={() => setEditingId(null)}
                />
              </li>
            ) : (
              <ChoreRow
                key={activity.id}
                activity={activity}
                isSelected={selectedIds.includes(activity.id)}
                onToggle={() => toggle(activity.id)}
                onLongPress={() => {
                  setEditingId(activity.id)
                  setIsCreating(false)
                }}
              />
            ),
          )}
        </ul>
      )}

      {isCreating ? (
        <ChoreEditor onDone={setNotice} onCancel={() => setIsCreating(false)} />
      ) : (
        <button
          type="button"
          onClick={() => {
            setIsCreating(true)
            setEditingId(null)
          }}
          className="focus-ring flex items-center justify-center gap-2 rounded-base border-2 border-dashed border-ink bg-transparent px-3 py-2.5 font-display text-sm font-semibold text-primary"
        >
          <AddIcon className="size-4" />
          New custom chore
        </button>
      )}

      <p className="rounded-base border-2 border-ink bg-card px-3 py-2.5 text-sm text-muted">
        Logged chores start as <strong className="text-body">Pending</strong>. Points count towards
        the duel only once your partner approves them.
      </p>

      {/*
       * Sticky action region. Everything that reports back to the user lives here rather than in the
       * flow above: rendered in normal flow, a confirmation was laid out behind this bar and clipped.
       */}
      {/*
       * `bottom-[4.5rem]` clears the bottom tab bar. From `md` the nav is a left rail and there is
       * nothing below the bar to clear, so the offset becomes a 72px gap for no reason ([58]).
       */}
      <div className="sticky bottom-[4.5rem] -mx-4 flex flex-col gap-2 border-t-2 border-ink bg-page px-4 pb-2 pt-3 md:bottom-0 md:pb-3">
        {failure && (
          <p
            role="alert"
            className="rounded-base border-2 border-ink-accent bg-danger px-3 py-2 font-display text-sm font-bold text-danger-fg"
          >
            {failure}
          </p>
        )}

        {/* One row per queued chore, each with its own undo — nothing has been sent yet. */}
        {queued.map((item) => (
          <div
            key={item.key}
            className="flex items-center justify-between gap-3 rounded-base border-2 border-ink-accent bg-success px-3 py-2 text-success-fg"
          >
            <span role="status" className="font-display text-sm font-bold">
              {item.title} logged
            </span>
            <button
              type="button"
              onClick={() => undo(item.key)}
              className="focus-ring flex shrink-0 items-center gap-1 rounded-base border-2 border-ink-accent bg-card px-2 py-1 font-display text-xs font-bold text-body"
            >
              <UndoIcon className="size-3" />
              Undo
            </button>
          </div>
        ))}

        {notice && (
          <p
            role="status"
            className="rounded-base border-2 border-ink-accent bg-success px-3 py-2 font-display text-sm font-bold text-success-fg"
          >
            {notice}
          </p>
        )}

        {/*
         * Edit and Remove appear beside the log button when exactly one chore is selected. This is
         * what makes them findable without a gesture — and why they are absent for a multi-selection,
         * where "edit" has no single subject.
         */}
        <div className="flex gap-2">
          <Button className="flex-1" disabled={selected.length === 0} onClick={logSelected}>
            {selected.length > 1 ? `Log ${selected.length} chores` : 'Log this chore'}
          </Button>

          {onlySelected && (
            <Button
              variant="neutral"
              aria-label={`Edit ${onlySelected.title}`}
              onClick={() => {
                setEditingId(onlySelected.id)
                setIsCreating(false)
              }}
            >
              <EditIcon className="size-4" />
            </Button>
          )}
        </div>
      </div>

      <p className="text-sm text-muted">
        <Link to="/" className="focus-ring font-semibold text-primary underline">
          Back to Home
        </Link>
      </p>
    </div>
  )
}

/**
 * A selectable chore. `aria-pressed` rather than a checkbox role: the row is a toggle button whose
 * pressed state means "included in the next log", which is what a screen reader should hear.
 */
function ChoreRow({
  activity,
  isSelected,
  onToggle,
  onLongPress,
}: {
  activity: Activity
  isSelected: boolean
  onToggle: () => void
  onLongPress: () => void
}) {
  const { handlers, consumedRef } = useLongPress(onLongPress)

  return (
    <li>
      <button
        type="button"
        aria-pressed={isSelected}
        onClick={() => {
          // A hold already acted; without this the row would also toggle on release.
          if (consumedRef.current) return
          onToggle()
        }}
        {...handlers}
        /*
         * **No press physics here.** Owner's call: twelve of these in a grid, each lifting and
         * dropping under its own hard shadow, read as a page of buttons rather than a list you pick
         * from — and a chore row is a *selection*, not an action. Nothing is sent when you tap one.
         *
         * `pressable-sm` was already the reduced version of that shadow, added in [46] for the same
         * complaint one step earlier; this takes the last step and removes it.
         *
         * The affordance moves to the tick box, the border and the fill, which is where the state
         * actually lives. `focus-ring` is added because `pressable-sm` was never a focus indicator
         * and this row had none — keyboard users were selecting invisibly.
         */
        className={[
          'focus-ring flex w-full touch-none items-center justify-between gap-3 rounded-control border-2 px-3 py-2.5 text-left font-display text-sm font-semibold transition-colors',
          isSelected
            ? 'border-ink-accent bg-primary text-primary-fg'
            : 'border-ink bg-card hover:border-primary',
        ].join(' ')}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          {/*
           * A visible box, because `aria-pressed` alone is invisible and a colour change is not a
           * selection affordance — it reads as "highlighted", not "ticked".
           *
           * **A tick, not a filled square** (`ui-exp01`). The filled inner square was the same
           * failure one level down: a block of colour inside a box that had also changed colour read
           * as decoration, so a selected row looked much like an unselected one. A checkmark is the
           * one mark that means "chosen" without having to be learned.
           */}
          <span
            aria-hidden="true"
            className={[
              'grid size-5 shrink-0 place-items-center border-2 border-ink-accent',
              isSelected ? 'bg-card text-primary' : 'bg-transparent',
            ].join(' ')}
          >
            {isSelected && <ApproveIcon className="size-3.5" />}
          </span>
          <span className="truncate">{activity.title}</span>
        </span>
        {/*
         * **The mark names the currency** ([75b] retired the filled chip): the number plus the
         * Points mark, whose fixed blue fill is what says "Points" — the same telling-apart the
         * blue `bg-points` chip used to do, without a box competing with the row's own border. On
         * the selected purple row the mark's ink stroke is what keeps it legible. The sr-only unit
         * (leading space included) keeps the accessible text exactly "N pts".
         */}
        <span className="flex shrink-0 items-center gap-1 font-bold">
          {activity.points}
          <PointsMark className="size-4" />
          <span className="sr-only"> pts</span>
        </span>
      </button>
    </li>
  )
}
