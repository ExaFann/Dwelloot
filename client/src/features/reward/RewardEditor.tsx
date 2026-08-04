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

export function RewardEditor({ reward, onDone, onCancel }: Props) {
  const isEdit = reward !== undefined

  const [title, setTitle] = useState(reward?.title ?? '')
  const [coinCost, setCoinCost] = useState(reward ? String(reward.coinCost) : '')
  const [pauses, setPauses] = useState(reward?.pausesCompetition ?? false)
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
      pausesCompetition: pauses,
    }

    try {
      if (isEdit) {
        await updateReward({ id: reward.id, ...payload }).unwrap()
        onDone(`${payload.title} updated.`)
      } else {
        await createReward(payload).unwrap()
        onDone(`${payload.title} added to the store.`)
        // Cleared for the next one — adding a reward predicts adding another.
        setTitle('')
        setCoinCost('')
        setPauses(false)
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
      await deleteReward({ id: reward.id }).unwrap()
      onDone(`${reward.title} removed.`)
    } catch (caught) {
      setServerError(toApiError(caught))
      setConfirmingDelete(false)
    }
  }

  /** Client-side first: it is the more specific complaint, and the server never saw this value. */
  const titleError = clientErrors.title ?? (serverError ? fieldError(serverError, 'title') : undefined)
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
       * The flag is client-settable, which [29] decided after considering withholding it: price is
       * what actually gates abuse of a day off and price is editable regardless, so withholding
       * would prevent nothing while making the seeded day-off reward impossible to recreate once
       * removed. The mitigation is disclosure — here, and again at the point of redemption.
       */}
      <label className="flex items-start gap-2.5 rounded-base border-2 border-ink bg-page p-3">
        <input
          type="checkbox"
          name="pausesCompetition"
          checked={pauses}
          onChange={(event) => setPauses(event.target.checked)}
          className="focus-ring mt-0.5 size-4 shrink-0 accent-[var(--brand-primary)]"
        />
        <span>
          <span className="block font-display text-sm font-semibold">Pauses the duel for a day</span>
          <span className="block text-sm text-muted">
            Redeeming it voids that day for both of you — no winner, and no loot box for either side.
          </span>
        </span>
      </label>

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
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="focus-ring self-start font-display text-sm font-semibold text-danger underline"
          >
            Remove this reward
          </button>
        ))}
    </form>
  )
}
