import { Zap } from 'lucide-react'
import { Avatar } from '../../components/ui/Avatar'
import { RecentChoresColumn, type RecentChore } from '../activity/RecentChoresColumn'
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
      className="rounded-base border-2 border-ink bg-card p-5 shadow-hard-lg"
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
  const myChores = useMyActivityLogsQuery({ take: 4 })
  const partnerChores = usePartnerActivityLogsQuery({ pageSize: 4 })

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
          <div className="mt-4 flex items-end justify-between gap-4">
            {/*
             * Purple is you, green is your opponent — design-tokens.md §2.1. The avatars carry the
             * colour, so the separate swatches they replaced are gone: two marks of the same colour
             * beside one name was one more than the mapping needed.
             */}
            <Score
              name="You"
              points={competition.data.myPoints}
              align="left"
              avatar={<Avatar userId={me.id} name={me.name} role="self" />}
              chores={myChores.data?.items ?? []}
              emptyLabel="Nothing logged yet."
            />
            <Score
              name={partner?.name ?? 'Partner'}
              points={competition.data.partnerPoints}
              align="right"
              avatar={
                partner ? <Avatar userId={partner.id} name={partner.name} role="opponent" /> : null
              }
              chores={partnerChores.data?.items ?? []}
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
          <div aria-hidden="true" className="relative mt-3">
            <div className="relative flex h-6 overflow-hidden rounded-base border-2 border-ink">
              <div className="bg-primary" style={{ width: `${mine}%` }} />
              <div className="border-l-2 border-ink bg-success" style={{ width: `${theirs}%` }} />
              {/* Halfway. The gap between this and the colour boundary is the lead, made visible. */}
              <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-ink opacity-40" />
            </div>

            {/*
             * The spark sits where the two sides meet — the colour boundary, which moves — rather
             * than at the fixed midpoint. That is the point of contention in a tug of war, and it
             * travels as someone pulls ahead.
             *
             * Live periods only: a settled or voided period is not an active clash.
             */}
            {isLive && (
              <span
                className="spark absolute top-1/2 z-10 flex size-6 items-center justify-center rounded-full border-2 border-ink-accent bg-warning text-warning-fg"
                style={{ left: `${mine}%` }}
              >
                <Zap size={12} strokeWidth={3} fill="currentColor" />
              </span>
            )}
          </div>

          <p className="mt-3 font-display text-sm font-bold">{summarise(standing, partner?.name)}</p>
        </>
      )}
    </Shell>
  )
}

function Score({
  name,
  points,
  align,
  avatar,
  chores,
  emptyLabel,
}: {
  name: string
  points: number
  align: 'left' | 'right'
  /** Carries the player colour, so it also ties this side to its half of the bar. */
  avatar: React.ReactNode
  chores: RecentChore[]
  emptyLabel: string
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
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
            <span className="ml-1 text-sm font-semibold text-muted">pts</span>
          </p>
        </div>
      </div>
      <RecentChoresColumn chores={chores} align={align} emptyLabel={emptyLabel} />
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
