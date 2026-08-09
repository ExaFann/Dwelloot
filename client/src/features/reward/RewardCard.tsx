import { useState } from 'react'
import { CoinMark, EditIcon } from '../../components/ui/icons'
import { useRedeemRewardMutation, type Reward } from './rewardApi'
import { toApiError } from '../../api/apiError'
import { Button } from '../../components/ui/Button'

/**
 * One reward in the store: what it costs, what it does to the duel if anything, and the two things
 * you can do with it.
 *
 * ### Why redeeming asks first
 *
 * Spending is the only irreversible user action in the app — there is no `DELETE /api/redemptions`,
 * the same absence that made [46] invent the undo window for logging. Undo cannot exist here, so
 * the decision point moves in front of the request instead.
 *
 * It also narrows the double-redeem race recorded in log `030`: the button that sends the request
 * is not the button being double-tapped, and it is disabled while in flight. That **mitigates**;
 * two devices can still race and only the backend can close it.
 */

type Props = {
  reward: Reward
  /** From `GET /api/auth/me`. The server is still the authority — this only shapes the control. */
  balance: number
  onEdit: () => void
  onRedeemed: (message: string) => void
  onFailed: (message: string) => void
}

export function RewardCard({ reward, balance, onEdit, onRedeemed, onFailed }: Props) {
  const [confirming, setConfirming] = useState(false)
  const [redeemReward, { isLoading }] = useRedeemRewardMutation()

  /** Inclusive, matching the server's `coins >= coinCost`: exactly enough is enough. */
  const affordable = balance >= reward.coinCost

  async function confirm() {
    try {
      const result = await redeemReward({
        rewardId: reward.id,
        pausesCompetition: reward.pausesCompetition,
      }).unwrap()
      setConfirming(false)
      /**
       * `coinsRemaining` comes from the response. Computing `balance − cost` here would be the
       * mistake [48] found in bulk approve: a client that does its own arithmetic is guessing, and
       * it is wrong whenever the cached balance was stale — which in one shared economy is ordinary.
       */
      onRedeemed(`${reward.title} redeemed. ${result.coinsRemaining} Coins left.`)
    } catch (caught) {
      setConfirming(false)
      onFailed(toApiError(caught).message)
    }
  }

  return (
    <li className="rounded-base border-2 border-ink bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 font-display text-sm font-semibold">{reward.title}</h3>
        {/* The coin mark names the currency — [75b] retired the yellow price chip. */}
        <span className="flex shrink-0 items-center gap-1 font-display text-sm font-bold">
          {reward.coinCost}
          <CoinMark className="size-4" />
          <span className="sr-only"> Coins</span>
        </span>
      </div>

      {/*
       * Derived from the flag, never from the title. [28] put `pausesCompetition` on the list
       * response for exactly this line, so the store cannot fall out of step with what settlement
       * does. Shown here as well as in the confirmation, so it is not a surprise at the last step.
       */}
      {reward.pausesCompetition && (
        <p className="mt-1.5 font-display text-xs font-semibold text-muted">Pauses the duel that day</p>
      )}

      {confirming ? (
        <div className="mt-3 flex flex-col gap-2 rounded-base border-2 border-ink bg-page p-3">
          <p className="font-display text-sm font-bold">
            Redeem {reward.title} for {reward.coinCost} Coins?
          </p>
          {reward.pausesCompetition && (
            <p className="text-sm text-muted">
              Today’s duel is off: nobody wins it, and neither of you gets a loot box for today.
            </p>
          )}
          <div className="flex gap-2">
            <Button
              variant="success"
              className="flex-1"
              pending={isLoading}
              pendingLabel="Redeeming…"
              onClick={() => void confirm()}
            >
              Yes, redeem
            </Button>
            <Button variant="neutral" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        /*
         * One action line: what the card has to say on the left, what it can do on the right.
         *
         * Redeem is **sized to its label, not stretched**, and it is `neutral` rather than purple
         * when it cannot be used. A full-width primary button on every row made a page of rewards
         * you cannot yet afford into a wall of purple slabs — the same "uniform full-width rows felt
         * oppressive" the owner rejected in [46], and worse here because the loudest thing on the
         * card was a control that does nothing. Found by looking at it, not by a test.
         */
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-xs text-muted">
            {affordable
              ? null
              : `${reward.coinCost - balance} more ${
                  reward.coinCost - balance === 1 ? 'Coin' : 'Coins'
                } to go.`}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant={affordable ? 'primary' : 'neutral'}
              disabled={!affordable}
              onClick={() => setConfirming(true)}
            >
              Redeem
            </Button>
            {/*
             * A real bordered control, not a bare icon. The pencil [47] put beside each chore row
             * was rejected because it sat inside a row that was itself a button and did not look or
             * behave like one; here the row is not a button, and this is.
             */}
            <Button variant="neutral" aria-label={`Edit ${reward.title}`} onClick={onEdit}>
              <EditIcon className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </li>
  )
}
