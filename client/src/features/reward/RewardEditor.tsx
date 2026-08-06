import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  useCreateRewardMutation,
  useDeleteRewardMutation,
  useUpdateRewardMutation,
  type Reward,
} from './rewardApi'
import { hasErrors, validateReward, type RewardErrors } from './rewardValidation'
import { fieldError, toApiError, type ApiError } from '../../api/apiError'
import { Button } from '../../components/ui/Button'
import { TextInput } from '../../components/ui/TextInput'
import { FormAlert } from '../../components/ui/FormAlert'

/**
 * Create, rename, re-price and remove a reward. One component for both modes, exactly as
 * `ChoreEditor` is — the fields, the validation and the error rendering are identical, and two
 * components would drift.
 *
 * Client-side validation runs **before** any request: an empty cost box encoded as `null` fails
 * JSON deserialisation and the server's reply names its own request type. See `rewardValidation.ts`.
 */

const CLAIMED_FIELDS = ['title', 'coinCost'] as const

type Props = {
  /** Absent for a new reward; present when editing an existing one. */
  reward?: Reward
  onDone: (message: string) => void
  onCancel: () => void
}

/**
 * What to tell the user, given what the server actually did — task [68].
 *
 * In a household of two, nothing here takes effect until the partner agrees, and the server says so
 * with a **202**. Reporting the applied message regardless would be the worst kind of wrong: the
 * confirmation would be about a store that has not changed, and the user would have no reason to
 * expect anything further to happen.
 *
 * The server's own sentence is used for the queued case rather than one written here, so the two
 * cannot drift on what the wait actually means.
 */
function describeOutcome(
  result: { outcome: 'applied' } | { outcome: 'queued'; message: string },
  applied: string,
): string {
  return result.outcome === 'queued' ? result.message : applied
}

export function RewardEditor({ reward, onDone, onCancel }: Props) {
  const isEdit = reward !== undefined

  const [title, setTitle] = useState(reward?.title ?? '')
  const [coinCost, setCoinCost] = useState(reward ? String(reward.coinCost) : '')
  const [clientErrors, setClientErrors] = useState<RewardErrors>({})
  const [serverError, setServerError] = useState<ApiError | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const [createReward, { isLoading: isCreating }] = useCreateRewardMutation()
  const [updateReward, { isLoading: isUpdating }] = useUpdateRewardMutation()
  const [deleteReward, { isLoading: isDeleting }] = useDeleteRewardMutation()

  const titleRef = useRef<HTMLInputElement>(null)

  // Focus follows the editor, or opening it leaves a keyboard user nowhere.
  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setServerError(null)

    const errors = validateReward({ title, coinCost })
    setClientErrors(errors)
    if (hasErrors(errors)) return

    const payload = {
      title: title.trim(),
      coinCost: Number(coinCost.trim()),
    }

    try {
      if (isEdit) {
        const result = await updateReward({ id: reward.id, ...payload }).unwrap()
        onDone(describeOutcome(result, `${payload.title} updated.`))
      } else {
        const result = await createReward(payload).unwrap()
        onDone(describeOutcome(result, `${payload.title} added to the store.`))
        // Cleared for the next one — adding a reward predicts adding another.
        setTitle('')
        setCoinCost('')
        titleRef.current?.focus()
      }
    } catch (caught) {
      setServerError(toApiError(caught))
    }
  }

  async function handleDelete() {
    if (!isEdit) return
    setServerError(null)
    try {
      const result = await deleteReward({ id: reward.id }).unwrap()
      onDone(describeOutcome(result, `${reward.title} removed.`))
    } catch (caught) {
      setServerError(toApiError(caught))
      setConfirmingDelete(false)
    }
  }

  /** Client-side first: it is the more specific complaint, and the server never saw this value. */
  const titleError =
    clientErrors.title ?? (serverError ? fieldError(serverError, 'title') : undefined)
  const costError =
    clientErrors.coinCost ?? (serverError ? fieldError(serverError, 'coinCost') : undefined)

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col gap-3 rounded-base border-2 border-dashed border-ink bg-card p-4"
    >
      <h3 className="font-display text-sm font-bold uppercase tracking-[0.02em]">
        {isEdit ? `Edit ${reward.title}` : 'New reward'}
      </h3>

      <FormAlert error={serverError} claimedFields={CLAIMED_FIELDS} />

      <TextInput
        ref={titleRef}
        label="Reward"
        name="title"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        maxLength={120}
        placeholder="Breakfast in bed"
        error={titleError}
      />
      <TextInput
        label="Cost in Coins"
        name="coinCost"
        type="number"
        inputMode="numeric"
        min={1}
        step={1}
        value={coinCost}
        onChange={(event) => setCoinCost(event.target.value)}
        placeholder="30"
        error={costError}
      />

      {/*
       * **A statement, not a checkbox** — task [69], reversing [29].
       *
       * [29] made the flag client-settable and its reasoning still holds on its own terms: price is
       * what gates abuse of a day off, and price stays editable. What changed is what the flag is
       * *for*. A tickbox labelled "pauses the duel" on every reward form invites a second one by
       * accident, and leaves the partner meeting an unexplained voided day. Voiding a day is now one
       * special prize from the seeded catalogue, and the server no longer accepts the field at all.
       *
       * Shown only when it is true, and derived from the flag rather than the title — the same rule
       * [28] put the field on the list response for. An ordinary reward says nothing here rather
       * than saying "does not pause the duel", which would be an answer to a question nobody asked.
       */}
      {reward?.pausesCompetition && (
        <p className="rounded-base border-2 border-ink bg-page p-3 text-sm text-muted">
          <strong className="block font-display font-semibold text-body">
            This is a special prize
          </strong>
          Redeeming it voids that day for both of you — no winner, and no loot box for either side.
          You can change its price, but it cannot be removed.
        </p>
      )}

      <div className="flex gap-2">
        <Button
          type="submit"
          className="flex-1"
          pending={isCreating || isUpdating}
          pendingLabel={isEdit ? 'Saving…' : 'Adding…'}
        >
          {isEdit ? 'Save' : 'Add reward'}
        </Button>
        <Button variant="neutral" onClick={onCancel}>
          {isEdit ? 'Cancel' : 'Close'}
        </Button>
      </div>

      {isEdit &&
        (confirmingDelete ? (
          <div className="flex flex-col gap-2 rounded-base border-2 border-danger p-3">
            <p className="font-display text-sm font-bold">Remove {reward.title}?</p>
            {/*
             * True, and worth saying: the server archives rather than deletes (log `029`) precisely
             * so redemptions survive. Without this the user has to guess whether removing a reward
             * erases what they already bought with it.
             */}
            <p className="text-sm text-muted">
              It disappears from the store. Anything already redeemed stays in your history.
            </p>
            <div className="flex gap-2">
              <Button
                variant="danger"
                className="flex-1"
                pending={isDeleting}
                pendingLabel="Removing…"
                onClick={() => void handleDelete()}
              >
                Remove
              </Button>
              <Button variant="neutral" onClick={() => setConfirmingDelete(false)}>
                Keep
              </Button>
            </div>
          </div>
        ) : (
          /*
           * Absent for a pausing reward. The server answers `DELETE` with a 409 ([69]), so a visible
           * Remove would be a control whose only outcome is an error — the "never show raw server
           * internals" rule one step earlier, at the affordance rather than at the message.
           */
          !reward.pausesCompetition && (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="focus-ring self-start font-display text-sm font-semibold text-danger underline"
            >
              Remove this reward
            </button>
          )
        ))}
    </form>
  )
}
