import { useState } from 'react'
import { Gift, Sparkles } from 'lucide-react'
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

  if (!revealed && !box) return null

  return (
    <section
      aria-labelledby="loot-box-heading"
      className="rounded-base border-2 border-ink bg-card p-5"
    >
      <div className="flex items-center gap-2">
        <Gift size={18} strokeWidth={3} aria-hidden="true" className="text-primary" />
        <h2 id="loot-box-heading" className="text-lg">
          Loot box
        </h2>
      </div>

      {revealed ? (
        <Revealed result={revealed} onDismiss={() => setRevealed(null)} />
      ) : (
        box && (
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
        )
      )}
    </section>
  )
}

function Revealed({
  result,
  onDismiss,
}: {
  result: OpenLootBoxResult
  onDismiss: () => void
}) {
  const prize = describePrize(result)

  return (
    <>
      {/*
       * `role="status"` because opening replaces a button with a result: without a live region the
       * prize is announced to nobody, and the only feedback a screen-reader user gets is that the
       * control they just pressed has gone.
       */}
      <div role="status" className="mt-3 flex flex-col items-center gap-1 py-2">
        <span
          className={[
            'loot-pop flex items-center gap-2 rounded-base border-2 border-ink-accent px-4 py-2 font-display text-2xl font-bold',
            // Yellow is Coins and loot, and only those — design-tokens.md §2.1. A bonus reward is
            // loot too, so both prizes wear it.
            'bg-warning text-warning-fg',
          ].join(' ')}
        >
          <Sparkles size={20} strokeWidth={3} aria-hidden="true" />
          {prize.headline}
        </span>
        <p className="text-sm text-muted">{prize.detail}</p>
      </div>

      <Button variant="neutral" className="mt-3 w-full" onClick={onDismiss}>
        Nice
      </Button>
    </>
  )
}
