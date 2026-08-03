import { useMyActivityLogsQuery, type MyActivityLog } from './activityApi'
import { describeLogPoints, relativeTime } from './logDisplay'
import { toApiError } from '../../api/apiError'

/**
 * The caller's own recent logs. Informational — approving happens on the Notices tab ([48]).
 */

const TONE_CLASS = {
  approved: 'bg-success text-success-fg',
  pending: 'bg-warning text-warning-fg',
  rejected: 'bg-danger text-danger-fg',
} as const

export function RecentActivityFeed() {
  const { data, isLoading, isError, error } = useMyActivityLogsQuery({ take: 5 })

  return (
    <section
      aria-labelledby="recent-activity-heading"
      className="rounded-base border-2 border-ink bg-card p-5 shadow-hard-lg"
    >
      <h2 id="recent-activity-heading" className="text-lg">
        Your recent chores
      </h2>

      {isError ? (
        <p role="alert" className="mt-3 text-muted">
          {toApiError(error).message}
        </p>
      ) : isLoading || !data ? (
        <p role="status" className="mt-3 text-muted">
          Loading your chores…
        </p>
      ) : data.items.length === 0 ? (
        <p className="mt-3 text-muted">
          Nothing logged yet. Tap a chore above and your partner will approve it.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {data.items.map((log) => (
            <LogRow key={log.id} log={log} />
          ))}
        </ul>
      )}
    </section>
  )
}

function LogRow({ log }: { log: MyActivityLog }) {
  /**
   * The number always goes through the status. `pointsAwarded` is what the chore was worth, not what
   * was earned — it is populated on rejected rows too, where nothing was ever credited.
   */
  const points = describeLogPoints(log.status, log.pointsAwarded)

  return (
    <li className="flex items-start justify-between gap-3 border-b-2 border-ink/10 pb-3 last:border-b-0 last:pb-0">
      <div className="min-w-0">
        <p className="font-display text-sm font-semibold">{log.activityTitle}</p>
        <p className="text-xs text-muted">{relativeTime(log.completedAt)}</p>
        {log.rejectReason && (
          <p className="mt-1 text-xs text-danger">&ldquo;{log.rejectReason}&rdquo;</p>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <span
          className={`rounded-base border-2 border-ink-accent px-2 py-0.5 font-display text-xs font-bold ${TONE_CLASS[points.tone]}`}
        >
          {points.label}
        </span>
        <span className="font-display text-xs font-semibold text-muted">{points.text}</span>
      </div>
    </li>
  )
}
