import { useState } from 'react'
import { Avatar } from '../../components/ui/Avatar'
import { TugBar } from './TugBar'
import { ScrollDots } from '../../components/ui/ScrollDots'
import { RecentChoresColumn } from '../activity/RecentChoresColumn'
import { EmptyAvatar, PartnerSlot } from './PartnerSlot'
import { choresForPeriod } from '../activity/logDisplay'
import {
  useDeleteActivityLogMutation,
  useMyActivityLogsQuery,
  usePartnerActivityLogsQuery,
} from '../activity/activityApi'
import { useMeQuery } from '../auth/authApi'
import { useGetHouseholdQuery } from '../household/householdApi'
import {
  useCurrentCompetitionQuery,
  type CurrentCompetition,
  type PeriodType,
} from './competitionApi'
import { describeStanding, periodLabel, tugShares, type Standing } from './standing'
import { toApiError } from '../../api/apiError'
import { Button } from '../../components/ui/Button'
import { SkeletonBlock, SkeletonList } from '../../components/ui/Skeleton'
import { LIVE_POLL_MS, liveQueryOptions } from '../../app/liveSync'
import { leadOf, useChangePulse } from '../../app/useChangePulse'
import { useTransientMessage } from '../../app/useTransientMessage'

/**
 * The head-to-head "tug" widget — `wireframes.md` §1: *both partners' current-period Points side by
 * side, **not a leaderboard — a duel***.
 *
 * Reads two endpoints. `competitions/current` gives the scores; `GET /api/households/{id}` gives the
 * partner's name and, more importantly, **whether there is a partner at all** — a solo household's
 * competition payload is an ordinary `0–0` with nothing to distinguish it (log `045`).
 */

/**
 * How often a solo household asks whether anyone has joined.
 *
 * Long enough that it is not a live feed, short enough that a partner who joins while you are
 * looking at the screen does not sit unnoticed. Only ever runs while you are alone.
 */
const SOLO_POLL_MS = 15_000

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <section
      aria-labelledby="head-to-head-heading"
      /*
       * The dashboard's hero, and dressed as one since [84]: a 3px border, more padding and a hard
       * shadow. Every other card on the app is a flat 2px outline, which is the style's resting
       * state — this one is the screen's subject, and the owner's note was that it did not look
       * like it. The shadow is the same `--shadow-hard-lg` a pressed control lifts to, used here
       * statically: it is not pressable, it is raised.
       */
      className="rounded-base border-[3px] border-ink bg-card p-5 shadow-hard-lg sm:p-6"
    >
      {children}
    </section>
  )
}

export function HeadToHeadCard() {
  const { data: me } = useMeQuery()
  const householdId = me?.householdId ?? undefined

  /**
   * While you are alone, this card polls for a partner. Once there is one, it stops.
   *
   * The partner joins in **their** browser, so nothing in this session can know it happened —
   * `Household` is only invalidated by mutations *this* client makes. The result was that the
   * invite panel stayed on screen after someone had already accepted it, and the only way out was
   * a manual refresh. Reported by the owner.
   *
   * Polling is scoped as narrowly as it can be: one small GET, only while `members.length < 2`, and
   * it switches itself off the moment the seat is taken — so a paired household pays nothing. The
   * general answer to "the other person did something" is [66]/[67]'s WebSockets; this is the one
   * place where the stale state is a dead end rather than a delay, because the card is showing an
   * invitation that has already been accepted.
   *
   * `refetchOnFocus` covers the common case for free: you send the code, switch to a chat app to
   * paste it, and come back.
   */
  const [pollingInterval, setPollingInterval] = useState(SOLO_POLL_MS)
  const household = useGetHouseholdQuery(
    { householdId: householdId as number },
    {
      ...liveQueryOptions,
      skip: householdId === undefined,
      // Overrides the shared 20s while solo — a faster question with a definite answer.
      pollingInterval,
    },
  )

  /*
   * Adjusted **during render**, not in an effect.
   *
   * The obvious `useEffect(() => setPollingInterval(...), [data])` is the cascading-render pattern
   * `react-hooks/set-state-in-effect` exists to catch, and it caught it here: an effect that sets
   * state schedules a second render *after* commit, so the interval would always trail the data by
   * a frame. Setting it inline re-renders before anything is committed, which is React's documented
   * answer for state derived from a changing input.
   */
  /*
   * Once paired this falls back to the shared 20s, **not to zero**.
   *
   * It used to switch polling off entirely the moment someone joined, on the reasoning that the
   * question "has anyone accepted my invitation" had been answered. But this payload also carries
   * the partner's **name and avatar**, and either of them can change at any time — so a paired
   * household was left with only `refetchOnFocus` while the solo one polled. Backwards: the case
   * with two people writing to it is the one that needs syncing more.
   */
  const shouldPoll = (household.data?.members.length ?? 0) < 2 ? SOLO_POLL_MS : LIVE_POLL_MS
  if (shouldPoll !== pollingInterval) setPollingInterval(shouldPoll)

  /** Today's score — the one that moves the moment the partner approves anything. */
  const competition = useCurrentCompetitionQuery(
    { householdId: householdId as number },
    { ...liveQueryOptions, skip: householdId === undefined },
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
  /** Task [71]. Owned here rather than in the column, which stays presentational. */
  const [removeLog, { isLoading: isRemoving }] = useDeleteActivityLogMutation()
  /**
   * The phone's period swiper, so `ScrollDots` can read where it is ([84]).
   *
   * **State via a callback ref, not `useRef`.** The scroller mounts behind a loading branch, so a
   * ref object is still `null` when `ScrollDots` first runs its effect — and mutating `.current`
   * later re-renders nothing, which left the dots frozen on the first panel forever. Found in the
   * browser, not by a test.
   */
  const [periodsEl, setPeriodsEl] = useState<HTMLDivElement | null>(null)
  /**
   * A failed delete used to vanish ([78]). The call was `void removeLog({ id })` — fire and
   * forget — so a 404 or a lost connection left the row sitting there with no explanation, and the
   * only clue was that nothing happened. Now that deleting takes a deliberate confirm, saying so
   * when it fails is the least the confirm owes the person who gave it.
   */
  const { message: removeFailure, show: showRemoveFailure } = useTransientMessage()

  const remove = async (id: number) => {
    try {
      await removeLog({ id }).unwrap()
    } catch (caught) {
      showRemoveFailure(toApiError(caught).message)
    }
  }

  const myChores = useMyActivityLogsQuery({ take: 12 }, liveQueryOptions)
  const partnerChores = usePartnerActivityLogsQuery({ pageSize: 12 }, liveQueryOptions)

  /**
   * The week and the month, alongside the day.
   *
   * `competitions/current` has always accepted `?periodType=` — settlement covered all three from
   * [23] — so this needed no backend work at all. Three subscriptions rather than one query with a
   * switch, because all three are on screen at once on a wide window.
   */
  const weekly = useCurrentCompetitionQuery(
    { householdId: householdId as number, periodType: 'Weekly' },
    { ...liveQueryOptions, skip: householdId === undefined },
  )
  const monthly = useCurrentCompetitionQuery(
    { householdId: householdId as number, periodType: 'Monthly' },
    { ...liveQueryOptions, skip: householdId === undefined },
  )

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
        <div className="mt-3">
          <SkeletonList label="Loading the standing" rows={2} />
        </div>
      </Shell>
    )
  }

  const partner = household.data.members.find((member) => member.id !== me.id)
  const hasPartner = partner !== undefined

  /**
   * The chore columns are filtered against the **daily** period, whichever period panel is on screen.
   *
   * They are "what each of you has done today", not "what made up the week's total" — and at a day
   * boundary they used to keep listing yesterday's approved chores under a 0–0 score. See
   * `choresForPeriod`, which also keeps anything still Pending however old, because that is the thing
   * the user still has to act on.
   */
  const dayStart = competition.data.periodStart
  const myVisible = choresForPeriod(myChores.data?.items ?? [], dayStart)
  const partnerVisible = choresForPeriod(partnerChores.data?.items ?? [], dayStart)

  const periods = [
    { key: 'Daily' as const, data: competition.data },
    { key: 'Weekly' as const, data: weekly.data },
    { key: 'Monthly' as const, data: monthly.data },
  ]

  return (
    <Shell>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="head-to-head-heading" className="text-xl">
          Head-to-head
        </h2>
      </div>

      {!hasPartner ? (
        /*
         * Solo, and the card keeps its shape rather than collapsing to a sentence.
         *
         * The left column is real — your avatar and the chores you have logged today — because a
         * solo user can log chores and the dashboard used to show no trace of it. The right column
         * is an honestly empty seat plus the invite code, which is the only useful action available
         * until someone takes it.
         *
         * The three period panels stay hidden: `describeStanding` has a `noPartner` case, so they
         * would render, but three panels each saying "no one to duel" is the same non-answer three
         * times. One line says it once.
         */
        <div className="mt-4 grid grid-cols-2 items-start gap-4">
          <ScoreHeader
            name="You"
            align="left"
            avatar={<Avatar userId={me.id} name={me.name} role="self" avatarKey={me.avatarKey} />}
          />
          <ScoreHeader name="No partner yet" align="right" avatar={<EmptyAvatar />} />
          <RecentChoresColumn
            chores={myVisible}
            align="left"
            emptyLabel="Nothing logged today."
            onRemove={(id) => void remove(id)}
            isRemoving={isRemoving}
          />
          <PartnerSlot inviteCode={household.data.inviteCode} />
          {removeFailure && (
            <div className="col-span-2">
              <RemoveFailure message={removeFailure} />
            </div>
          )}
        </div>
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
              align="left"
              avatar={<Avatar userId={me.id} name={me.name} role="self" avatarKey={me.avatarKey} />}
            />
            <ScoreHeader
              name={partner?.name ?? 'Partner'}
              align="right"
              avatar={
                partner ? (
                  <Avatar
                    userId={partner.id}
                    name={partner.name}
                    role="opponent"
                    avatarKey={partner.avatarKey}
                  />
                ) : null
              }
            />
            <RecentChoresColumn
              chores={myVisible}
              align="left"
              emptyLabel="Nothing logged today."
              onRemove={(id) => void remove(id)}
              isRemoving={isRemoving}
            />
            <RecentChoresColumn chores={partnerVisible} align="right" emptyLabel="Nothing today." />
          </div>
          {removeFailure && <RemoveFailure message={removeFailure} />}

          {/*
           * Three duels — **swipe on a phone, a ladder from `lg`** ([84], correcting [83]).
           *
           * [83] made every width a vertical ladder, and on a phone that pushed the week and the
           * month below the fold of an already tall card. A narrow screen gets one period at a
           * time with dots to say there are more (the browser's own snap gesture, no touch handler
           * to get wrong); a wide one shows all three at once, which is where the ladder earns its
           * keep.
           *
           * Order is Today → Week → Month everywhere ([86]): the phone swipes into today first,
           * a screen reader hears it first, and the desktop column reads day, week, month down
           * the page. [84] reversed the desktop column to get thin-to-thick out of the old
           * weights; inverting the weights instead gets the same progression *and* keeps the
           * natural order, so the reversal is gone.
           *
           * It also answers a question the old grid never did: all three periods really are
           * settled and paid ([23], [58a]) — a monthly bar you can watch fill is what says a
           * monthly loot box exists.
           */}
          <div
            ref={setPeriodsEl}
            // `scrollbar-none` — [85]: `ScrollDots` below is what says where you are.
            className="scrollbar-none mt-6 flex snap-x snap-mandatory gap-4 overflow-x-auto lg:flex-col lg:gap-5 lg:overflow-visible"
          >
            {periods.map(({ key, data }) => (
              <PeriodPanel
                key={key}
                periodType={key}
                competition={data}
                hasPartner={hasPartner}
                partnerName={partner?.name}
              />
            ))}
          </div>
          {/*
           * Phone only: the ladder shows all three at once and needs no index.
           *
           * The dots say *where you are*; they do not say *that you can move* — owner's report, and
           * it is the standard failure of a carousel indicator. Below `lg` only Today is on screen,
           * so a first-time user can reasonably conclude the app has no week or month at all. The
           * words are the affordance; the dots stay because they are the position.
           */}
          <div className="mt-3 lg:hidden">
            <ScrollDots scroller={periodsEl} count={periods.length} />
            {periods.length > 1 && (
              <p className="mt-1.5 text-center font-display text-xs font-semibold text-muted">
                Swipe for week &amp; month
              </p>
            )}
          </div>
        </>
      )}
    </Shell>
  )
}

/**
 * Each rung's visual weight. The three are *deliberately unequal* — equal bars stacked read as a
 * list, not a design.
 *
 * **The scale runs with the timespan: the day is the thinnest, the month the thickest** ([86],
 * correcting [83]/[84]). It was the other way round on the reasoning that today is the duel you
 * are standing in; the owner's call is the one the geometry already suggested — a longer period
 * holds more, so it reads as the heavier bar, and scanning day → week → month goes thin to thick.
 *
 * Border thickness rides along, so the day is a slim gauge rather than a thin button.
 */
const PERIOD_WEIGHT: Record<
  PeriodType,
  { bar: string; bolt: string; score: string; verdict: string }
> = {
  Daily: {
    bar: 'h-4 border-2',
    bolt: 'size-4',
    score: 'text-base',
    verdict: 'text-xs font-semibold text-muted',
  },
  Weekly: {
    bar: 'h-6 border-2',
    bolt: 'size-5',
    score: 'text-lg',
    verdict: 'text-sm font-semibold',
  },
  Monthly: {
    bar: 'h-10 border-[3px]',
    bolt: 'size-7',
    score: 'text-2xl',
    verdict: 'text-sm font-bold',
  },
}

/** One period's score, rope and verdict — a rung of the [83] ladder. */
function PeriodPanel({
  periodType,
  competition,
  hasPartner,
  partnerName,
}: {
  periodType: PeriodType
  competition: CurrentCompetition | undefined
  hasPartner: boolean
  partnerName?: string
}) {
  /*
   * Above the early return, because hooks cannot sit after one. `undefined` while the period is
   * still loading is also exactly right: arriving at a lead is not changing one, so the bolt does
   * not lurch just because the page finished loading.
   */
  const leadFlipping = useChangePulse(
    competition ? leadOf(competition.myPoints, competition.partnerPoints) : undefined,
    { durationMs: 560 },
  )

  if (!competition) {
    return (
      <div
        role="group"
        aria-label={periodLabel(periodType)}
        className="w-full shrink-0 snap-center lg:w-auto"
      >
        <p className="font-display text-xs font-semibold uppercase tracking-[0.08em] text-muted">
          {periodLabel(periodType)}
        </p>
        <div className="mt-2">
          <SkeletonBlock label="Loading this period" className="h-10" />
        </div>
      </div>
    )
  }

  const standing = describeStanding(competition, { hasPartner })
  const { mine, partner: theirs } = tugShares(competition.myPoints, competition.partnerPoints)
  /** A settled or voided period is finished — nothing is being contested, so nothing sparks. */
  const isLive = standing.kind !== 'voided' && !competition.settled
  const weight = PERIOD_WEIGHT[periodType]

  return (
    /*
     * A labelled group, so the three periods are distinguishable to a screen reader — and so a test
     * can scope an assertion to one of them. Without it, "you won by 25" is ambiguous across three
     * panels that each carry their own verdict.
     */
    <div
      role="group"
      aria-label={periodLabel(periodType)}
      /*
       * `shrink-0` is what makes the phone a swiper rather than three squeezed columns: a flex item
       * defaults to `flex-shrink: 1`, so `w-full` alone let all three fit the container and there
       * was nothing to scroll. `lg:w-auto` hands the width back for the ladder.
       */
      className="w-full shrink-0 snap-center lg:w-auto"
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.08em] text-muted">
          {periodLabel(periodType)}
        </p>
        <p className={`font-display font-bold ${weight.score}`}>
          {competition.myPoints}
          <span className="mx-1 text-muted">–</span>
          {competition.partnerPoints}
        </p>
      </div>

      {/* One shared rope since [84] — the landing page draws the same one. */}
      <div className="mt-2">
        <TugBar
          mine={mine}
          theirs={theirs}
          barClassName={weight.bar}
          boltClassName={weight.bolt}
          showBolt={isLive}
          boltAnimating={leadFlipping}
        />
      </div>

      <p className={`mt-2 font-display ${weight.verdict}`}>{summarise(standing, partnerName)}</p>
    </div>
  )
}

/** Why a delete was refused — [78]. The likeliest cause is the partner approving it a moment ago. */
function RemoveFailure({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="mt-3 rounded-base border-2 border-ink-accent bg-danger px-3 py-2 font-display text-sm font-bold text-danger-fg"
    >
      {message}
    </p>
  )
}

function ScoreHeader({
  name,
  align,
  avatar,
}: {
  name: string
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
      {/*
       * Identity only. The scores moved into the period panels below, because there are three of
       * them now and a single big number beside a name could only ever be one period's.
       */}
      <p className="min-w-0 truncate font-display text-sm font-semibold">{name}</p>
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
