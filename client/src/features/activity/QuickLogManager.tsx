import { ApproveIcon } from '../../components/ui/icons'
import { useActivitiesQuery, useUpdateActivityMutation } from './activityApi'
import { liveQueryOptions } from '../../app/liveSync'
import { toApiError } from '../../api/apiError'
import { useTransientMessage } from '../../app/useTransientMessage'
import { SkeletonList } from '../../components/ui/Skeleton'

/**
 * Choosing which chores are on the quick-log wall, **from the wall itself** — task [73].
 *
 * ### Why this exists on top of the tick box in `ChoreEditor`
 *
 * The tick box works, and it was the only way in: select a chore on the Log tab, open its editor,
 * untick, save. The owner's objection is that nothing on the dashboard suggests the wall is
 * editable at all, so a user would have to already know the setting exists in order to go looking
 * for it in a different screen. A list you can curate needs a visible way to curate it, next to the
 * list.
 *
 * Both routes stay. The editor's tick box is where you set it *while thinking about that chore*;
 * this is where you set it *while looking at the wall* — and the second is the one that answers
 * "there are too many tiles here".
 *
 * ### Every chore, not just the ones on the wall
 *
 * A manager that showed only what is already there could remove but never add, which is half a
 * control. So it lists the whole catalogue with a tick against each — the same shape as the picker
 * it replaces, one screen closer to the problem.
 *
 * ### It writes immediately, with no Save
 *
 * There is one field and it is a boolean; a Save button would exist only to be forgotten. Each row
 * is disabled while its own request is in flight, so a double tap cannot send twice — and the change
 * is household-wide, which the heading says out loud because the other person's dashboard changes
 * too.
 */
export function QuickLogManager({ onClose }: { onClose: () => void }) {
  // The whole catalogue: no `isQuick` filter, so this can add as well as remove.
  const { data, isLoading, isError, error } = useActivitiesQuery({}, liveQueryOptions)
  const [updateActivity, { isLoading: isSaving }] = useUpdateActivityMutation()
  const { message: failure, show: showFailure, clear: clearFailure } = useTransientMessage()

  const chores = data?.items ?? []

  async function toggle(id: number, isQuick: boolean) {
    clearFailure()
    try {
      await updateActivity({ id, isQuick }).unwrap()
    } catch (caught) {
      showFailure(toApiError(caught).message)
    }
  }

  return (
    <div className="mt-3 rounded-base border-2 border-ink bg-page p-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.08em] text-muted">
          On the dashboard — for both of you
        </p>
        <button
          type="button"
          onClick={onClose}
          className="focus-ring font-display text-xs font-bold text-primary underline"
        >
          Done
        </button>
      </div>

      {isError ? (
        <p role="alert" className="mt-2 text-sm text-muted">
          {toApiError(error).message}
        </p>
      ) : isLoading ? (
        <div className="mt-2">
          <SkeletonList label="Loading your chores" rows={4} />
        </div>
      ) : chores.length === 0 ? (
        <p className="mt-2 text-sm text-muted">No chores in your household yet.</p>
      ) : (
        <ul className="mt-2 flex max-h-56 flex-col gap-1.5 overflow-y-auto">
          {chores.map((chore) => (
            <li key={chore.id}>
              <button
                type="button"
                aria-pressed={chore.isQuick}
                disabled={isSaving}
                onClick={() => void toggle(chore.id, !chore.isQuick)}
                className={[
                  'focus-ring flex w-full items-center gap-2.5 rounded-control border-2 px-2.5 py-1.5 text-left text-sm transition-colors disabled:opacity-50',
                  chore.isQuick
                    ? 'border-ink-accent bg-primary text-primary-fg'
                    : 'border-ink bg-card hover:border-primary',
                ].join(' ')}
              >
                {/*
                 * A tick, not a fill — `ui-exp01` §8. A block of colour inside a box that has also
                 * changed colour reads as decoration rather than as "chosen".
                 */}
                <span
                  aria-hidden="true"
                  className={[
                    'grid size-4 shrink-0 place-items-center border-2 border-ink-accent',
                    chore.isQuick ? 'bg-card text-primary' : 'bg-transparent',
                  ].join(' ')}
                >
                  {chore.isQuick && <ApproveIcon className="size-3" />}
                </span>
                <span className="truncate font-display font-semibold">{chore.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {failure && (
        <p role="alert" className="mt-2 font-display text-sm font-bold text-danger">
          {failure}
        </p>
      )}
    </div>
  )
}
