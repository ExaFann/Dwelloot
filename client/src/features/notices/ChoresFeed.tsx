import {
  useMyActivityLogsQuery,
  usePartnerActivityLogsQuery,
  type ActivityLogStatus,
} from '../activity/activityApi'
import { STATUS_LABEL, relativeTime } from '../activity/logDisplay'
import { ChoreCredit, ChoreStatusDot, ChoreTitle } from '../activity/choreStatusDisplay'
import { useMeQuery } from '../auth/authApi'
import { useGetHouseholdQuery } from '../household/householdApi'
import { toApiError } from '../../api/apiError'
import { SkeletonList } from '../../components/ui/Skeleton'
import { ScrollArea } from '../../components/ui/ScrollArea'
import { SECTION_BODY, SECTION_SHELL } from './sectionLayout'
import { liveQueryOptions } from '../../app/liveSync'

/**
 * **Every chore either partner has logged recently, newest first — and whether it counted yet.**
 *
 * Deliberately the quietest thing on the page: small text, no colour blocks, nothing to press. It is
 * the record, not a decision. The one section that *is* a decision is "Waiting on you" above it.
 *
 * Two queries because the API splits them and there is no combined endpoint: `/api/activity-logs/mine`
 * is yours, `GET /api/activity-logs` is theirs and never returns your own. Together they cover the
 * household exactly once.
 *
 * The approval marker is the point of the section, so it is a word rather than a colour alone —
 * "Approved", "Waiting", "Rejected" — and the points go through `describeLogPoints`, because
 * `pointsAwarded` is what the chore was *worth*, not what anyone earned.
 */

type Entry = {
  key: string
  who: string
  isMine: boolean
  title: string
  status: ActivityLogStatus
  points: number
  at: string
}

export function ChoresFeed() {
  const { data: me } = useMeQuery()
  const householdId = me?.householdId ?? undefined
  const household = useGetHouseholdQuery(
    { householdId: householdId as number },
    { ...liveQueryOptions, skip: householdId === undefined },
  )

  const mine = useMyActivityLogsQuery({ take: 8 }, liveQueryOptions)
  const theirs = usePartnerActivityLogsQuery({ pageSize: 8 }, liveQueryOptions)

  const partner = household.data?.members.find((member) => member.id !== me?.id)

  const entries: Entry[] = [
    ...(mine.data?.items ?? []).map((log) => ({
      key: `m-${log.id}`,
      who: 'You',
      isMine: true,
      title: log.activityTitle,
      status: log.status,
      points: log.pointsAwarded,
      at: log.completedAt,
    })),
    ...(theirs.data?.items ?? []).map((log) => ({
      key: `p-${log.id}`,
      who: partner?.name ?? 'Partner',
      isMine: false,
      title: log.activityTitle,
      status: log.status,
      points: log.pointsAwarded,
      at: log.completedAt,
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

  const error = mine.error ?? theirs.error
  const isLoading = mine.isLoading || theirs.isLoading

  return (
    <section aria-labelledby="chores-feed-heading" className={SECTION_SHELL}>
      {/*
       * `text-lg`, matching the other three sections — [84], owner's call. It was a small uppercase
       * caption, which made the Notices tab look like three sections and a footnote. The *content*
       * stays quiet (small text, no colour blocks); only the heading joins the set.
       */}
      <h2 id="chores-feed-heading" className="shrink-0 text-lg">
        Chores feed
      </h2>

      <ScrollArea className={SECTION_BODY}>
        {error ? (
          <p role="alert" className="text-sm text-muted">
            {toApiError(error).message}
          </p>
        ) : isLoading ? (
          <SkeletonList label="Loading the chores feed" rows={4} />
        ) : entries.length === 0 ? (
          <p className="flex h-full items-center justify-center text-center text-sm text-muted">
            Nothing logged by either of you yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {entries.slice(0, 10).map((entry) => {
              return (
                <li key={entry.key} className="flex items-baseline gap-2 text-sm">
                  {/* One shared implementation since [84] — see `choreStatusDisplay`. */}
                  <ChoreStatusDot status={entry.status} className="translate-y-[-1px]" />
                  <span
                    className={[
                      'shrink-0 font-display text-xs font-bold',
                      entry.isMine ? 'text-primary' : 'text-success',
                    ].join(' ')}
                  >
                    {entry.who}
                  </span>
                  <ChoreTitle status={entry.status} className="min-w-0 flex-1 truncate text-muted">
                    {entry.title}
                  </ChoreTitle>
                  {/* The marker the section exists for — a word, not only a colour. */}
                  <span className="shrink-0 text-xs text-muted">{STATUS_LABEL[entry.status]}</span>
                  <ChoreCredit
                    status={entry.status}
                    points={entry.points}
                    className="font-display text-xs font-bold"
                    markClassName="size-3"
                  />
                  <span className="hidden shrink-0 text-xs text-muted sm:inline">
                    {relativeTime(entry.at)}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </ScrollArea>
    </section>
  )
}
