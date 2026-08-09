import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  useCreateActivityMutation,
  useDeleteActivityMutation,
  useUpdateActivityMutation,
  type Activity,
} from './activityApi'
import { hasErrors, validateChore, type ChoreErrors } from './choreValidation'
import { fieldError, toApiError, type ApiError } from '../../api/apiError'
import { Button } from '../../components/ui/Button'
import { TextInput } from '../../components/ui/TextInput'
import { FormAlert } from '../../components/ui/FormAlert'

/**
 * Create, rename, re-price and remove a chore. One component for both modes — the fields, the
 * validation and the error rendering are identical, and the only differences are which mutation
 * fires and whether Delete is offered.
 *
 * Client-side validation runs **before** any request. That is not belt-and-braces: an empty points
 * box encoded as `null` fails JSON deserialisation rather than model validation, and the server's
 * reply names its own request type — see `choreValidation.ts`. The server remains the authority for
 * everything else.
 */

const CLAIMED_FIELDS = ['title', 'points'] as const

type Props = {
  /** Absent for a new chore; present when editing an existing one. */
  activity?: Activity
  onDone: (message: string) => void
  onCancel: () => void
}

export function ChoreEditor({ activity, onDone, onCancel }: Props) {
  const isEdit = activity !== undefined

  const [title, setTitle] = useState(activity?.title ?? '')
  const [points, setPoints] = useState(activity ? String(activity.points) : '')
  /*
   * Task [73]. A new chore starts on the wall, matching the server's default — a chore you just
   * bothered to add is one you probably want one tap away.
   */
  const [isQuick, setIsQuick] = useState(activity?.isQuick ?? true)
  const [clientErrors, setClientErrors] = useState<ChoreErrors>({})
  const [serverError, setServerError] = useState<ApiError | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const [createActivity, { isLoading: isCreating }] = useCreateActivityMutation()
  const [updateActivity, { isLoading: isUpdating }] = useUpdateActivityMutation()
  const [deleteActivity, { isLoading: isDeleting }] = useDeleteActivityMutation()

  const titleRef = useRef<HTMLInputElement>(null)

  // Focus follows the editor, or activating "Edit" leaves a keyboard user nowhere.
  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setServerError(null)

    const errors = validateChore({ title, points })
    setClientErrors(errors)
    if (hasErrors(errors)) return

    const payload = { title: title.trim(), points: Number(points.trim()), isQuick }

    try {
      if (isEdit) {
        await updateActivity({ id: activity.id, ...payload }).unwrap()
        onDone(`${payload.title} updated.`)
      } else {
        await createActivity(payload).unwrap()
        onDone(`${payload.title} added to your chores.`)
        // Cleared for the next one — adding a chore predicts adding another.
        setTitle('')
        setPoints('')
        setIsQuick(true)
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
      await deleteActivity({ id: activity.id }).unwrap()
      onDone(`${activity.title} removed.`)
    } catch (caught) {
      setServerError(toApiError(caught))
      setConfirmingDelete(false)
    }
  }

  /** Client-side first: it is the more specific complaint, and the server never saw this value. */
  const titleError =
    clientErrors.title ?? (serverError ? fieldError(serverError, 'title') : undefined)
  const pointsError =
    clientErrors.points ?? (serverError ? fieldError(serverError, 'points') : undefined)

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col gap-3 rounded-base border-2 border-dashed border-ink bg-card p-4"
    >
      <h3 className="font-display text-sm font-bold uppercase tracking-[0.02em]">
        {isEdit ? `Edit ${activity.title}` : 'New custom chore'}
      </h3>

      <FormAlert error={serverError} claimedFields={CLAIMED_FIELDS} />

      <TextInput
        ref={titleRef}
        label="Chore"
        name="title"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        maxLength={120}
        placeholder="Water the plants"
        error={titleError}
      />
      <TextInput
        label="Points"
        name="points"
        type="number"
        inputMode="numeric"
        min={1}
        step={1}
        value={points}
        onChange={(event) => setPoints(event.target.value)}
        placeholder="10"
        error={pointsError}
      />

      {/*
       * Task [73] — which chores make up the dashboard's one-tap wall.
       *
       * A checkbox rather than a separate screen, and it lives here because this is already where a
       * chore is managed: the wall is a property of the chore, not a list kept somewhere else that
       * could fall out of step with the catalogue.
       *
       * **Household-wide, and the copy says so.** Both partners see one wall, and someone unticking
       * a chore is changing what the other person sees too — worth stating rather than discovering.
       */}
      <label className="flex items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          name="isQuick"
          checked={isQuick}
          onChange={(event) => setIsQuick(event.target.checked)}
          className="focus-ring mt-0.5 size-5 shrink-0 accent-[var(--brand-primary)]"
        />
        <span>
          <span className="font-display font-semibold">Show on the dashboard</span>
          <span className="block text-muted">
            One-tap logging for both of you. Untick the ones you rarely do.
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
          {isEdit ? 'Save' : 'Add chore'}
        </Button>
        <Button variant="neutral" onClick={onCancel}>
          {isEdit ? 'Cancel' : 'Close'}
        </Button>
      </div>

      {isEdit &&
        (confirmingDelete ? (
          <div className="flex flex-col gap-2 rounded-base border-2 border-danger p-3">
            <p className="font-display text-sm font-bold">Remove {activity.title}?</p>
            {/*
             * True, and worth saying: the server archives rather than deletes (§4.2) precisely so
             * approved logs keep their points. Without this the user has to guess whether removing a
             * chore costs them the points they already earned from it.
             */}
            <p className="text-sm text-muted">
              It disappears from this list. Chores you have already logged keep their points.
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
            Remove this chore
          </button>
        ))}
    </form>
  )
}
