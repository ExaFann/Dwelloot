import { CoinMark, PointsMark, StreakMark } from './icons'

/**
 * The three standing totals — Coins, Lifetime pts, Streak — as one row.
 *
 * Extracted from the Me screen in [79], when the household card began showing the *partner's*
 * totals too. Deliberately **not** a generic stat list taking arbitrary items: the whole value here
 * is that your card and your partner's cannot drift into different labels, marks or order. Two call
 * sites rendering "the same three numbers" from two copies is precisely how one of them ends up
 * calling Points "Score" a month later.
 *
 * The marks carry their own fixed brand colours since [75a], so nothing here sets a text colour.
 */

/**
 * `sr-only` below 640px, visible from there up — owner's call ([78]).
 *
 * **Never `hidden`.** `hidden` would drop the label from the accessibility tree *and* from
 * `textContent`, so a screen reader would hear a bare "13" and every test that reads "13 … Coins"
 * as one string would break. `sr-only` hides it from eyes only. Written as one complete literal
 * because Tailwind scans source text — an assembled `` `${bp}:not-sr-only` `` emits no CSS at all.
 */
const LABEL = 'sr-only font-display text-[0.7rem] font-semibold uppercase tracking-[0.06em] text-muted sm:not-sr-only'

export function StandingTotals({
  coins,
  lifetimePoints,
  currentWinStreak,
  className = '',
}: {
  coins: number
  lifetimePoints: number
  currentWinStreak: number
  className?: string
}) {
  return (
    <dl className={`flex flex-wrap items-center gap-x-6 gap-y-1 ${className}`}>
      <Stat label="Coins" value={coins} mark={<CoinMark className="size-6" />} />
      <Stat label="Lifetime pts" value={lifetimePoints} mark={<PointsMark className="size-6" />} />
      {/*
       * The **current** streak. `users.longest_win_streak` exists but neither `/api/auth/me` nor the
       * household's members return it, and the wireframe asks for "win streak" — satisfied.
       */}
      <Stat label="Streak" value={currentWinStreak} mark={<StreakMark className="size-6" />} />
    </dl>
  )
}

function Stat({ label, value, mark }: { label: string; value: number; mark: React.ReactNode }) {
  return (
    /*
     * `dt` before `dd` in the DOM so a screen reader hears "Coins, 13", with `flex-row-reverse`
     * putting the number first visually.
     *
     * The mark sits in the `dd` beside the number, `items-center` — [75b]'s number+mark pattern.
     * It used to sit in the `dt`, where the container's `items-baseline` aligned the tiny label's
     * baseline against the xl number's and hoisted the mark visibly high (owner-caught, [75c]).
     */
    <div className="flex flex-row-reverse items-baseline gap-1.5">
      <dt className={LABEL}>{label}</dt>
      <dd className="flex items-center gap-1 font-display text-xl font-bold">
        {value}
        {mark}
      </dd>
    </div>
  )
}
