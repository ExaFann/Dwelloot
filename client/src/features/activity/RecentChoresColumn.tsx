import { RejectIcon } from '../../components/ui/icons'
import { describeLogPoints } from './logDisplay'
import type { ActivityLogStatus } from './activityApi'

/**
 * One person's last few chores, shown under their avatar on the head-to-head card.
 *
 * Moved here from a separate card at the bottom of the dashboard: the interesting question is
 * *"what has each of us been doing"*, and the answer belongs beside the score it explains rather
 * than below two other sections.
 *
 * Scrolls rather than growing — the card must stay a fixed shape whether someone has logged one
 * chore or twenty.
 */

export type RecentChore = {
  id: number
  activityTitle: string
  pointsAwarded: number
  status: ActivityLogStatus
}

const DOT: Record<ActivityLogStatus, string> = {
  Approved: 'bg-success',
  Pending: 'bg-warning',
  Rejected: 'bg-danger',
}

export function RecentChoresColumn({
  chores,
  align,
  emptyLabel,
  onRemove,
  isRemoving = false,
}: {
  chores: RecentChore[]
  align: 'left' | 'right'
  emptyLabel: string
  /**
   * Removes one of the caller's own pending chores — task [71]. Omit it and no control is drawn.
   *
   * **A callback, not a mutation hook in here.** Calling `useDeleteActivityLogMutation` directly
   * turned this from a presentational component into one that cannot render without a Redux
   * Provider — which broke six existing tests that had every right to render it bare, and would
   * have made it unusable anywhere outside the store. The card above already owns every query on
   * this screen; owning one more mutation costs it nothing.
   */
  onRemove?: (choreId: number) => void
  /** Disables the controls while a removal is in flight, so a double tap cannot send twice. */
  isRemoving?: boolean
}) {
  if (chores.length === 0) {
    return <p className="mt-3 text-xs text-muted">{emptyLabel}</p>
  }

  return (
    <ul
      className="mt-3 flex max-h-28 flex-col gap-1.5 overflow-y-auto"
      // The card owns the score; this is supporting detail, so it is not a landmark.
      aria-label="Recent chores"
    >
      {chores.map((chore) => {
        const points = describeLogPoints(chore.status, chore.pointsAwarded)
        return (
          <li
            key={chore.id}
            className={[
              'flex items-center gap-1.5 text-xs',
              align === 'right' ? 'flex-row-reverse text-right' : '',
            ].join(' ')}
          >
            {/*
             * A status dot rather than a badge: at this size a word per row would crowd out the
             * chore name, which is the thing being scanned for.
             */}
            <span
              aria-hidden="true"
              className={`size-2 shrink-0 border border-ink-accent ${DOT[chore.status]}`}
            />
            <span className="truncate font-display font-semibold">{chore.activityTitle}</span>
            {/* `describeLogPoints` keeps a pending or rejected chore from reading as earned. */}
            <span className="shrink-0 text-muted">
              {points.tone === 'approved'
                ? `+${chore.pointsAwarded}`
                : points.tone === 'pending'
                  ? `(${chore.pointsAwarded})`
                  : '—'}
            </span>
            <span className="sr-only">{points.label}</span>
            {/*
             * Pending only, and only on your own column. An approved chore has already moved the
             * score and may sit in a settled period; taking it back is the partner's job, through
             * rejection. Showing a control that can only fail would be the "no raw server
             * internals" rule one step too late — at the message rather than the affordance.
             */}
            {onRemove && chore.status === 'Pending' && (
              <button
                type="button"
                disabled={isRemoving}
                onClick={() => onRemove(chore.id)}
                aria-label={`Remove ${chore.activityTitle}`}
                className="focus-ring ml-auto shrink-0 rounded-control p-0.5 text-muted hover:text-danger disabled:opacity-50"
              >
                <RejectIcon className="size-3" />
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
