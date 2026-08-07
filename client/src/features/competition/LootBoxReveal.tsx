import { useEffect, useRef, useState } from 'react'
import { ChestMark, CoinMark, RewardIcon } from '../../components/ui/icons'
import { useMeQuery } from '../auth/authApi'
import { useCurrentCompetitionQuery } from './competitionApi'
import { useOpenLootBoxMutation, type OpenLootBoxResult } from './lootBoxApi'
import { describePrize, describeWin } from './lootBoxCopy'
import { toApiError } from '../../api/apiError'
import { Button } from '../../components/ui/Button'

/**
 * The loot box reveal — the moment the app is named after, and the only source of Coins.
 *
 * Shown when `competitions/current` reports an `unopenedLootBox`. **There is no losing state**:
 * losers are given no box at all (log `025`, confirmed in review), so a null payload means "nothing
 * to celebrate", not "you lost".
 *
 * ### Why the prize is held in local state
 *
 * Opening invalidates `Competition`, so `unopenedLootBox` clears — or becomes the *next* box, since
 * the server hands them back oldest-first for a partner returning after several days. Rendering
 * straight from the query would therefore make the prize flash and vanish, or be replaced by the
 * next invitation before it was read. The result stays on screen until the user dismisses it, and
 * dismissing reveals whatever is underneath.
 */
export function LootBoxReveal() {
  const { data: me } = useMeQuery()
  const householdId = me?.householdId ?? undefined

  const { data: competition } = useCurrentCompetitionQuery(
    { householdId: householdId as number },
    { skip: householdId === undefined },
  )

  const [openLootBox, { isLoading }] = useOpenLootBoxMutation()
  const [revealed, setRevealed] = useState<OpenLootBoxResult | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  /** Where focus lands after the reveal closes — the button that opened it went with the box. */
  const sectionRef = useRef<HTMLElement>(null)

  const box = competition?.unopenedLootBox ?? null

  async function open() {
    if (!box || householdId === undefined) return
    setFailure(null)
    try {
      setRevealed(await openLootBox({ householdId, competitionId: box.competitionId }).unwrap())
    } catch (caught) {
      setFailure(toApiError(caught).message)
    }
  }

  const dismiss = () => {
    setRevealed(null)
    sectionRef.current?.focus()
  }

  if (!revealed && !box) return null

  return (
    <section
      ref={sectionRef}
      tabIndex={-1}
      aria-labelledby="loot-box-heading"
      className="rounded-base border-2 border-ink bg-card p-5"
    >
      <div className="flex items-center gap-2">
        <RewardIcon className="size-4.5 text-primary" />
        <h2 id="loot-box-heading" className="text-lg">
          Loot box
        </h2>
      </div>

      {box && !revealed && (
        <>
          <p className="mt-2 font-display text-sm font-bold">
            {describeWin(box.periodType, box.isWinWin)}
          </p>
          <p className="mt-1 text-sm text-muted">There is a box waiting to be opened.</p>

          {failure && (
            <p
              role="alert"
              className="mt-3 rounded-base border-2 border-ink-accent bg-danger px-3 py-2 font-display text-sm font-bold text-danger-fg"
            >
              {failure}
            </p>
          )}

          <Button
            className="mt-4 w-full"
            pending={isLoading}
            pendingLabel="Opening…"
            onClick={() => void open()}
          >
            Open it
          </Button>
        </>
      )}

      {revealed && <Revealed result={revealed} onDismiss={dismiss} />}
    </section>
  )
}

/**
 * How far and how fast each coin of the fountain flies ([53b]) — per-coin custom properties fed
 * to the single `dwelloot-coin-fly` keyframe; the stagger is an inline `animation-delay` on top
 * of the utility's 950ms base. Eight, asymmetric on purpose: a symmetric spray reads as a
 * particle effect, an uneven one as spilling.
 */
/**
 * Text colour inside the reveal. The dialog's scrim is `bg-black/60` in both schemes, so this is
 * one of the few places a literal beats a token: `--text-primary` inverts, and half of that
 * inversion is invisible here.
 */
const ON_SCRIM = '#F0EBFF'

const COIN_FLIGHTS = [
  { x: '-72px', r: '-260deg', delay: 0 },
  { x: '44px', r: '200deg', delay: 60 },
  { x: '-30px', r: '-160deg', delay: 130 },
  { x: '76px', r: '300deg', delay: 90 },
  { x: '8px', r: '160deg', delay: 190 },
  { x: '-52px', r: '-300deg', delay: 240 },
  { x: '60px', r: '240deg', delay: 300 },
  { x: '-14px', r: '-200deg', delay: 350 },
]

/**
 * The opening, centre stage — [53a] built the dialog, [53b] made it an *opening*: the chest
 * rattles, its lid swings up, the coins fountain out (coins prize only), and the prize lands as
 * the chest fades — a pure CSS timeline (`theme.css`), running on a result that is already known,
 * so nothing waits on it.
 *
 * Same dismissal contract as the badge overlay: any click, or Escape/Enter/Space. Focus lands on
 * the dialog while it is up (the keydown handler needs it, and a screen reader should hear it) and
 * the section takes it back afterwards.
 */
function Revealed({
  result,
  onDismiss,
}: {
  result: OpenLootBoxResult
  onDismiss: () => void
}) {
  const prize = describePrize(result)
  const dialogRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    dialogRef.current?.focus()
  }, [])

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Loot box"
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
      onClick={onDismiss}
      onKeyDown={(event) => {
        if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onDismiss()
        }
      }}
    >
      {/*
       * Chest and prize share one grid cell — stacked by layout, never by transforms, so reduced
       * motion (which hides the chest stage and skips the entrance) leaves the prize exactly
       * where it always was (log `045`'s rule).
       */}
      <div className="grid place-items-center">
        <div aria-hidden="true" className="chest-open relative col-start-1 row-start-1">
          {/* overflow-visible: the swung-open lid leaves the viewBox and must not be clipped. */}
          <ChestMark className="size-44 overflow-visible" lidClassName="lid-pop" />
          {/* The fountain — coins prize only; a won reward is one thing, not a shower of them. */}
          {prize.kind === 'coins' &&
            COIN_FLIGHTS.map((flight, i) => (
              <span
                key={i}
                className="coin-fly absolute left-1/2 top-1/3 -ml-3"
                style={
                  {
                    '--fly-x': flight.x,
                    '--fly-r': flight.r,
                    animationDelay: `${950 + flight.delay}ms`,
                  } as React.CSSProperties
                }
              >
                <CoinMark className="size-6" />
              </span>
            ))}
        </div>

        {/*
         * `role="status"` because opening replaces a button with a result: without a live region
         * the prize is announced to nobody, and the only feedback a screen-reader user gets is
         * that the control they just pressed has gone.
         */}
        <div
          role="status"
          className="prize-arrive col-start-1 row-start-1 flex flex-col items-center gap-1 py-2"
        >
          {prize.kind === 'coins' ? (
            /*
             * **No slab for Coins** ([78]). The yellow box was doing the coin mark's job twice —
             * and doing it in the colour the mark is already made of. Big number, the mark, and
             * the unit for a screen reader only, so `textContent` stays exactly "+22 Coins".
             *
             * Fixed near-white rather than a class: with the box gone the number inherits from the
             * dialog, whose scrim is `bg-black/60` in *both* schemes — `text-body` is near-black in
             * light mode and would vanish. Same reason, same value as the detail line below.
             */
            <span
              className="flex items-center gap-2 font-display text-4xl font-bold"
              style={{ color: ON_SCRIM }}
            >
              +{prize.amount}
              <CoinMark className="size-8" />
              <span className="sr-only"> Coins</span>
            </span>
          ) : (
            /*
             * A won reward keeps its slab: unlike a number, a reward's title is a phrase, and the
             * gift glyph plus a bordered fill is what makes it read as the prize rather than as a
             * caption. Yellow is Coins and loot both — design-tokens.md §2.1.
             */
            <span className="flex items-center gap-2 rounded-base border-2 border-ink-accent bg-warning px-4 py-2 font-display text-2xl font-bold text-warning-fg">
              <RewardIcon className="size-6" />
              {prize.headline}
            </span>
          )}
          <p className="text-sm" style={{ color: ON_SCRIM }}>
            {prize.detail}
          </p>
          <Button variant="neutral" className="mt-2" onClick={onDismiss}>
            Nice
          </Button>
        </div>
      </div>
    </div>
  )
}
