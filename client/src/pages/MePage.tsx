import { useState } from 'react'
import { useMeQuery } from '../features/auth/authApi'
import { SignOutButton } from '../features/auth/SignOutButton'
import { Avatar } from '../components/ui/Avatar'
import { AvatarPicker } from '../features/auth/AvatarPicker'
import { CoinMark, PointsMark, StreakMark } from '../components/ui/icons'
import { BadgeWall } from '../features/progression/BadgeWall'
import { HouseholdSettings } from '../features/household/HouseholdSettings'
import { ThemeToggle } from '../features/theme/ThemeToggle'
import { toApiError } from '../api/apiError'
import { SkeletonList } from '../components/ui/Skeleton'

/**
 * The Me screen — `wireframes.md` §5: *"Profile: Coins, lifetime Points, win streak, badge grid.
 * Household settings: invite code, rename, leave."*
 *
 * Built as one screen from plan tasks [54], [55] and [56]. That sentence is a single screen and the
 * three tasks are its three sections; a screen is the unit of work.
 *
 * **No ranking or leaderboard section**, per the same wireframe: it would repeat the dashboard's
 * head-to-head widget, which is the whole standing in a two-person household.
 */
export function MePage() {
  const [isPickingAvatar, setIsPickingAvatar] = useState(false)
  const { data: me, isLoading, isError, error, refetch } = useMeQuery()

  if (isError) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-3xl">Me</h1>
        <div className="rounded-base border-2 border-ink bg-card p-5">
          <p role="alert" className="text-muted">
            {toApiError(error).message}
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="focus-ring mt-3 font-display text-sm font-semibold text-primary underline"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  if (isLoading || !me) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-3xl">Me</h1>
        <SkeletonList label="Loading your profile" rows={3} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl">Me</h1>

      <section
        aria-labelledby="profile-heading"
        className="rounded-base border-2 border-ink bg-card p-4 sm:p-5"
      >
        <div className="flex items-center gap-3">
          {/*
           * The avatar is the control — task [72], owner's request. Tapping your own picture to
           * change it is where people look first, and a separate "Change avatar" button would sit
           * beside the thing it acts on saying what the thing already implies.
           */}
          <button
            type="button"
            aria-expanded={isPickingAvatar}
            aria-label="Change your avatar"
            onClick={() => setIsPickingAvatar((open) => !open)}
            className="focus-ring shrink-0 rounded-control"
          >
            {/* Purple: this is always you. `design-tokens.md` §2.1. */}
            <Avatar userId={me.id} name={me.name} role="self" avatarKey={me.avatarKey} />
          </button>
          <div className="min-w-0">
            <h2 id="profile-heading" className="truncate text-lg">
              {me.name}
            </h2>
            <p className="truncate text-sm text-muted">{me.email}</p>
          </div>

          {/*
           * The three stats, beside the avatar rather than in tiles below it — owner's call. The
           * coloured squares dominated the card and swallowed their own marks: each mark inherited
           * the tile's black foreground, so the very icons that distinguish the currencies rendered
           * as three black shapes. Since [75a] the hues are intrinsic — the marks carry fixed brand
           * fills and an ink stroke ([75b]) — so no `text-*` class is needed (or heeded) here.
           *
           * `dl` still, and `dt` still precedes `dd` in the DOM — "Coins, 13" to a screen reader,
           * never a bare number — with the visual order handled by flex direction, exactly as the
           * tiles did it.
           */}
          <dl className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-x-4 gap-y-1">
            <Stat
              label="Coins"
              value={me.coins}
              mark={<CoinMark className="size-6" />}
            />
            <Stat
              label="Lifetime pts"
              value={me.lifetimePoints}
              mark={<PointsMark className="size-6" />}
            />
            {/*
             * The **current** streak. `users.longest_win_streak` exists but `/api/auth/me` does not
             * return it, and the wireframe asks for "win streak" — satisfied. Recorded rather than
             * worked around.
             */}
            <Stat
              label="Streak"
              value={me.currentWinStreak}
              mark={<StreakMark className="size-6" />}
            />
          </dl>
        </div>

        {isPickingAvatar && (
          <div className="mt-4 rounded-base border-2 border-ink bg-page p-3">
            <p className="mb-2 font-display text-xs font-semibold uppercase tracking-[0.08em] text-muted">
              Pick an avatar
            </p>
            {/* Stays open after a choice, so several can be tried without reopening it. */}
            <AvatarPicker />
          </div>
        )}
      </section>

      {/*
       * Two columns from `lg` ([58]): the badge grid is already a grid and pairs naturally with the
       * two settings cards, which are short. `items-start` so neither column stretches to the other.
       */}
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:items-start">
        {/*
         * [76a] retired the shelf and the `md` split with it — the wall measures its container and
         * reflows, and the criteria live in its click overlay, which were the two jobs the shelf
         * existed to do. It also ended the era of the owner reviewing a surface ([76]'s honeycomb)
         * they had never actually seen: their window sat under the old `md` gate.
         */}
        <BadgeWall />

        <div className="flex flex-col gap-6">
          {/*
           * `householdId` is non-null here by construction: this route sits behind `AuthGate`'s
           * `household` access, which sends anyone without one to `/pairing`. The guard is a type
           * narrowing, not a state with a UI.
           */}
          {me.householdId !== null && (
            <HouseholdSettings householdId={me.householdId} selfId={me.id} />
          )}

          {/* A device preference, so it sits with the other settings rather than in the nav ([57]). */}
          <ThemeToggle />
        </div>
      </div>

      {/*
       * Sign-out's final home. It landed under the `/me` placeholder in [43] because no task owned
       * it and without it the only way out of a session was waiting out the 60-minute token; [55]
       * owned deciding where it actually belongs. Last on the screen, below the household it ends
       * access to, and visually quiet — it is an exit, not an action anyone is here to take.
       */}
      <div className="flex justify-center pb-2">
        <SignOutButton />
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  mark,
}: {
  label: string
  value: number
  /** Wears its currency's own colour — the marks are what tell the three numbers apart. */
  mark: React.ReactNode
}) {
  return (
    /*
     * `dt` before `dd` in the DOM so a screen reader hears "Coins, 13", with `flex-row-reverse`
     * putting the number first visually — the same order trick the old tiles used vertically.
     *
     * The mark sits in the `dd` beside the number, `items-center` — [75b]'s number+mark pattern.
     * It used to sit in the `dt`, where the container's `items-baseline` aligned the tiny label's
     * baseline against the xl number's and hoisted the mark visibly high (owner-caught, [75c]).
     */
    <div className="flex flex-row-reverse items-baseline gap-1.5">
      <dt className="font-display text-[0.7rem] font-semibold uppercase tracking-[0.06em] text-muted">
        {label}
      </dt>
      <dd className="flex items-center gap-1 font-display text-xl font-bold">
        {value}
        {mark}
      </dd>
    </div>
  )
}
