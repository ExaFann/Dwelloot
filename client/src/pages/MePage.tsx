import { useMeQuery } from '../features/auth/authApi'
import { SignOutButton } from '../features/auth/SignOutButton'
import { Avatar } from '../components/ui/Avatar'
import { BadgeShelf } from '../features/progression/BadgeShelf'
import { HouseholdSettings } from '../features/household/HouseholdSettings'
import { ThemeToggle } from '../features/theme/ThemeToggle'
import { toApiError } from '../api/apiError'

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
  const { data: me, isLoading, isError, error, refetch } = useMeQuery()

  if (isError) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-3xl">Me</h1>
        <div className="rounded-base border-2 border-ink bg-card p-5 shadow-hard-lg">
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
        <p role="status" className="text-muted">
          Loading your profile…
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl">Me</h1>

      <section
        aria-labelledby="profile-heading"
        className="rounded-base border-2 border-ink bg-card p-4 shadow-hard-lg sm:p-5"
      >
        <div className="flex items-center gap-3">
          {/* Purple: this is always you. `design-tokens.md` §2.1. */}
          <Avatar userId={me.id} name={me.name} role="self" />
          <div className="min-w-0">
            <h2 id="profile-heading" className="truncate text-lg">
              {me.name}
            </h2>
            <p className="truncate text-sm text-muted">{me.email}</p>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-3 gap-2">
          {/* Coins are loot, so they wear the yellow. Points and streaks are not — §2.1 again. */}
          <Stat label="Coins" value={me.coins} tone="loot" />
          <Stat label="Lifetime pts" value={me.lifetimePoints} tone="plain" />
          {/*
           * The **current** streak. `users.longest_win_streak` exists but `/api/auth/me` does not
           * return it, and the wireframe asks for "win streak" — satisfied. Recorded rather than
           * worked around.
           */}
          <Stat label="Win streak" value={me.currentWinStreak} tone="plain" />
        </dl>
      </section>

      <BadgeShelf />

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

function Stat({ label, value, tone }: { label: string; value: number; tone: 'loot' | 'plain' }) {
  return (
    /*
     * `dt` before `dd` in the DOM, which is the order the spec requires, with `flex-col-reverse`
     * putting the number on top visually. Swapping them in the markup instead would read as
     * "13, Coins" to a screen reader walking the list — a value with no term in front of it.
     */
    <div
      className={[
        'flex flex-col-reverse rounded-base border-2 px-2 py-2.5 text-center',
        tone === 'loot' ? 'border-ink-accent bg-warning text-warning-fg' : 'border-ink bg-page',
      ].join(' ')}
    >
      <dt className="font-display text-[0.7rem] font-semibold uppercase tracking-[0.06em] opacity-80">
        {label}
      </dt>
      <dd className="font-display text-2xl font-bold">{value}</dd>
    </div>
  )
}
