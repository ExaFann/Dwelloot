import { Zap } from 'lucide-react'
import { Avatar } from '../../components/ui/Avatar'
import { PointsMark } from '../../components/ui/marks'
import { RecentChoresColumn } from '../activity/RecentChoresColumn'
import { useMyActivityLogsQuery, usePartnerActivityLogsQuery } from '../activity/activityApi'
import { useMeQuery } from '../auth/authApi'
import { useGetHouseholdQuery } from '../household/householdApi'
import { useCurrentCompetitionQuery } from './competitionApi'
import { describeStanding, periodLabel, tugShares, type Standing } from './standing'
import { toApiError } from '../../api/apiError'
import { Button } from '../../components/ui/Button'

/**
 * The head-to-head "tug" widget — `wireframes.md` §1: *both partners' current-period Points side by
 * side, **not a leaderboard — a duel***.
 *
 * Reads two endpoints. `competitions/current` gives the scores; `GET /api/households/{id}` gives the
 * partner's name and, more importantly, **whether there is a partner at all** — a solo household's
 * competition payload is an ordinary `0–0` with nothing to distinguish it (log `045`).
 */

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <section
      aria-labelledby="head-to-head-heading"
      className="rounded-base border-2 border-ink bg-card p-5"
    >
      {children}
    </section>
  )
}

export function HeadToHeadCard() {
  const { data: me } = useMeQuery()
  const householdId = me?.householdId ?? undefined

  const household = useGetHouseholdQuery(
    { householdId: householdId as number },
    { skip: householdId === undefined },
  )
  const competition = useCurrentCompetitionQuery(
    { householdId: householdId as number },
    { skip: householdId === undefined },
  )

  /**
   * Each partner's last few chores, shown under their avatar. Two endpoints, because the API splits
   * them: `/mine` is the caller's, and `/api/activity-logs` returns only the *other* partner's.
   */
  /**
   * **Twelve fetched, four visible** (`ui-exp01`).
   *
   * These asked for 4, and `RecentChoresColumn` is a `max-h-28 overflow-y-auto` box — so the column
   * looked scrollable and had nothing to scroll to. Reported as a bug, and it was one: the ceiling
   * was in the request, not in the styling. Four is what fits the card; the rest are reachable.
   */
  const myChores = useMyActivityLogsQuery({ take: 12 })
  const partnerChores = usePartnerActivityLogsQuery({ pageSize: 12 })

  if (competition.isError || household.isError) {
    const message = toApiError(competition.error ?? household.error).message
    return (
      <Shell>
        <h2 id="head-to-head-heading" className="text-lg">
          Head-to-head
        </h2>
        <p role="alert" className="mt-2 text-muted">
          {message}
        </p>
        <div className="mt-4">
          <Button
            variant="neutral"
            onClick={() => {
              void competition.refetch()
              void household.refetch()
            }}
          >
            Try again
          </Button>
        </div>
      </Shell>
    )
  }

  if (!competition.data || !household.data || !me) {
    return (
      <Shell>
        <h2 id="head-to-head-heading" className="text-lg">
          Head-to-head
        </h2>
        <p role="status" className="mt-2 text-muted">
          Loading the standing…
        </p>
      </Shell>
    )
  }

  const partner = household.data.members.find((member) => member.id !== me.id)
  const standing = describeStanding(competition.data, { hasPartner: partner !== undefined })
  const { mine, partner: theirs } = tugShares(
    competition.data.myPoints,
    competition.data.partnerPoints,
  )
  /** A settled or voided period is finished — nothing is being contested, so nothing sparks. */
  const isLive = standing.kind !== 'voided' && !competition.data.settled

  return (
    <Shell>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="head-to-head-heading" className="text-lg">
          Head-to-head
        </h2>
        <span className="font-display text-xs font-semibold uppercase tracking-[0.08em] text-muted">
          {periodLabel(competition.data.periodType)}
        </span>
      </div>

      {standing.kind === 'noPartner' ? (
        <p className="mt-3 text-muted">
          No one to duel yet. Share your invite code — the contest starts the moment your partner
          joins.
        </p>
      ) : (
        <>
          {/*
           * A two-row grid, **not two flex columns** (`ui-exp01`).
           *
           * The flex version aligned the two sides' *bottoms*, so whoever had logged fewer chores got
           * a shorter column and their avatar sat lower than the other's — the misalignment the owner
           * reported. Alignment was a side effect of content height, which is exactly the thing that
           * differs between two people.
           *
           * A grid puts both headers in row 1 and both lists in row 2 by construction, so the avatars
           * share a line whatever either person has done.
           *
           * Purple is you, green is your opponent — design-tokens.md §2.1. The avatars carry the
           * colour, so the separate swatches they replaced are gone.
           */}
          <div className="mt-4 grid grid-cols-2 items-start gap-4">
            <ScoreHeader
              name="You"
              points={competition.data.myPoints}
              align="left"
              avatar={<Avatar userId={me.id} name={me.name} role="self" />}
            />
            <ScoreHeader
              name={partner?.name ?? 'Partner'}
              points={competition.data.partnerPoints}
              align="right"
              avatar={
                partner ? <Avatar userId={partner.id} name={partner.name} role="opponent" /> : null
              }
            />
            <RecentChoresColumn
              chores={myChores.data?.items ?? []}
              align="left"
              emptyLabel="Nothing logged yet."
            />
            <RecentChoresColumn
              chores={partnerChores.data?.items ?? []}
              align="right"
              emptyLabel="Nothing yet."
            />
          </div>

          {/*
           * Decorative. Every number and every judgement it encodes is in the text above and below,
           * so exposing it would only make a screen reader repeat itself.
           *
           * The centre tick is what makes this read as a tug-of-war rather than a progress bar.
           * Without it a 100/0 lead is one solid block with nothing to compare against — found only
           * once screenshots became available; see log `045`.
           */}
          <div aria-hidden="true" className="relative mt-4">
            {/*
             * A rope with a grip on it, rather than a progress bar (`ui-exp01`).
             *
             * The bar reads as a tug now that `tugShares` is driven by the **lead** rather than by
             * share-of-total — see the note there. The grip is what the two of you are pulling, and
             * it starts dead centre instead of slamming to one end over a single chore.
             *
             * The centre tick stays. It is the reference the grip's offset is read against; without
             * it a big lead is one solid block with nothing to compare to (log `045`).
             */}
            <div className="relative flex h-7 overflow-hidden border-2 border-ink">
              <div className="bg-primary transition-[width] duration-500" style={{ width: `${mine}%` }} />
              <div className="bg-success transition-[width] duration-500" style={{ width: `${theirs}%` }} />
              {/* Halfway. The gap between this and the grip is the lead, made visible. */}
              <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-ink opacity-40" />
            </div>

            {/*
             * The grip sits where the two sides meet — the moving boundary, which is the point of
             * contention. Square, not a disc: the app has no circles any more.
             *
             * Yellow rather than the red flag a tug-of-war would really have. Red is the destructive
             * colour in this palette (`design-tokens.md` §2.1) and is used for reject and leave, so a
             * red marker on the dashboard would be the one alarming thing on a screen about doing
             * chores. Yellow is already the contested/pending colour.
             *
             * Live periods only: a settled or voided period is not an active clash.
             */}
            {isLive && (
              <span
                /*
                 * **The bolt itself, with no chip around it** (`ui-exp01`). Boxing it gave the
                 * animation a bordered card to scale and rotate, so the eye tracked the box and the
                 * bolt read as its contents. A bare mark spinning on the rope is the thing being
                 * fought over; the box was a container for it.
                 */
                className="spark absolute top-1/2 z-10 block text-warning transition-[left] duration-500"
                style={{ left: `${mine}%` }}
              >
                <Zap size={26} strokeWidth={2.5} fill="currentColor" stroke="var(--ink-accent)" />
              </span>
            )}
          </div>

          <p className="mt-3 font-display text-sm font-bold">{summarise(standing, partner?.name)}</p>
        </>
      )}
    </Shell>
  )
}

function ScoreHeader({
  name,
  points,
  align,
  avatar,
}: {
  name: string
  points: number
  align: 'left' | 'right'
  /** Carries the player colour, so it also ties this side to its half of the bar. */
  avatar: React.ReactNode
}) {
  return (
    <div
      className={[
        'flex min-w-0 items-center gap-3',
        align === 'right' ? 'flex-row-reverse text-right' : '',
      ].join(' ')}
    >
      {avatar}
      <div className="min-w-0">
        <p className="truncate font-display text-sm font-semibold text-muted">{name}</p>
        <p className="font-display text-3xl font-bold">
          {points}
          <PointsMark className="ml-1 inline-block size-3.5 translate-y-[1px]" />
        </p>
      </div>
    </div>
  )
}

/** The one sentence under the bar. Kept beside the component because it is pure copy. */
function summarise(standing: Standing, partnerName = 'Your partner'): string {
  switch (standing.kind) {
    case 'noPartner':
      return ''
    case 'nothingYet':
      return 'Nothing logged yet. First chore takes the lead.'
    case 'leading':
      return `You're ahead by ${standing.margin}.`
    case 'trailing':
      return `${partnerName} is ahead by ${standing.margin}.`
    case 'levelPegging':
      return 'Neck and neck.'
    case 'voided':
      // A day off was redeemed. Saying who is "ahead" would promise a payout that cannot happen.
      return 'Day off — this one does not count for either of you.'
    case 'won':
      return `You won by ${standing.margin}.`
    case 'lost':
      return `${partnerName} won by ${standing.margin}.`
    case 'drawn':
      return 'Finished level.'
  }
}
