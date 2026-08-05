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
}: {
  chores: RecentChore[]
  align: 'left' | 'right'
  emptyLabel: string
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
            <span className="shrink-0 text-muted">{points.tone === 'approved' ? `+${chore.pointsAwarded}` : points.tone === 'pending' ? `(${chore.pointsAwarded})` : '—'}</span>
            <span className="sr-only">{points.label}</span>
          </li>
        )
      })}
    </ul>
  )
}
