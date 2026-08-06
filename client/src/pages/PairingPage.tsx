import { useState, type FormEvent } from 'react'
import { useAppDispatch } from '../app/hooks'
import { authApi } from '../features/auth/authApi'
import {
  useCreateHouseholdMutation,
  useJoinHouseholdMutation,
} from '../features/household/householdApi'
import { InviteCodeCard } from '../features/household/InviteCodeCard'
import {
  INVITE_CODE_LENGTH,
  validateHouseholdName,
  validateInviteCode,
} from '../features/household/householdValidation'
import { fieldError, toApiError, type ApiError } from '../api/apiError'
import { Button } from '../components/ui/Button'
import { TextInput } from '../components/ui/TextInput'
import { FormAlert } from '../components/ui/FormAlert'

/**
 * The pairing screen. Reachable only while signed in without a household — `AuthGate` guards both
 * sides, so a paired user cannot get here and create a second one.
 *
 * Two equal paths: the first partner creates, the second joins, and nothing here knows which this
 * is. Each form keeps its own error, or a failed join would render a message under the create form.
 */

const CREATE_FIELDS = ['name'] as const
const JOIN_FIELDS = ['inviteCode'] as const

export function PairingPage() {
  const dispatch = useAppDispatch()
  const [createHousehold, { isLoading: isCreating }] = useCreateHouseholdMutation()
  const [joinHousehold, { isLoading: isJoining }] = useJoinHouseholdMutation()

  const [createError, setCreateError] = useState<ApiError | null>(null)
  const [joinError, setJoinError] = useState<ApiError | null>(null)
  const [inviteCode, setInviteCode] = useState<string | null>(null)

  /*
   * Client-side field errors, kept separate from the API's.
   *
   * Same rule as `ChoreEditor`: the client's complaint is about the value in the box, the server's
   * is about a value it may no longer have, so the client's wins on the same field. Here it also
   * means the `[StringLength(6, MinimumLength = 6)]` sentence never reaches a screen — see
   * `validateInviteCode`.
   */
  const [createFieldError, setCreateFieldError] = useState<string>()
  const [joinFieldError, setJoinFieldError] = useState<string>()

  /**
   * Invalidating `Me` is what makes `AuthGate` notice the household and move the user on. It is the
   * single trigger for leaving this screen, which is why it is called explicitly at the two points
   * where leaving is correct rather than being attached to the mutations.
   */
  function leavePairing() {
    dispatch(authApi.util.invalidateTags(['Me']))
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setCreateError(null)
    setCreateFieldError(undefined)
    const form = new FormData(event.currentTarget)
    const name = String(form.get('name') ?? '')

    const invalid = validateHouseholdName(name)
    if (invalid) {
      setCreateFieldError(invalid)
      return
    }

    try {
      const result = await createHousehold({ name }).unwrap()
      // Deliberately does *not* leave yet — the invite code has to be shown first.
      setInviteCode(result.inviteCode)
    } catch (caught) {
      setCreateError(toApiError(caught))
    }
  }

  async function handleJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setJoinError(null)
    setJoinFieldError(undefined)
    const form = new FormData(event.currentTarget)
    const code = String(form.get('inviteCode') ?? '')

    const invalid = validateInviteCode(code)
    if (invalid) {
      setJoinFieldError(invalid)
      return
    }

    try {
      await joinHousehold({ inviteCode: code }).unwrap()
      // Nothing to show, so move on immediately.
      leavePairing()
    } catch (caught) {
      setJoinError(toApiError(caught))
    }
  }

  if (inviteCode) {
    return <InviteCodeCard code={inviteCode} onContinue={leavePairing} />
  }

  return (
    <div>
      <h1 className="text-3xl">Set up a household</h1>
      <p className="mt-2 text-muted">
        Dwelloot is for two people. Start one, or join your partner&apos;s.
      </p>

      <section className="mt-8 rounded-base border-2 border-ink bg-card p-5">
        <h2 className="text-lg">Create a household</h2>
        <form onSubmit={handleCreate} className="mt-4 flex flex-col gap-4" noValidate>
          <FormAlert error={createError} claimedFields={CREATE_FIELDS} />
          <TextInput
            label="Household name"
            name="name"
            placeholder="Our place"
            required
            maxLength={60}
            error={createFieldError ?? (createError ? fieldError(createError, 'name') : undefined)}
            onChange={() => setCreateFieldError(undefined)}
          />
          <Button type="submit" pending={isCreating} pendingLabel="Creating…">
            Create
          </Button>
        </form>
      </section>

      <section className="mt-6 rounded-base border-2 border-ink bg-card p-5">
        <h2 className="text-lg">Join your partner</h2>
        <form onSubmit={handleJoin} className="mt-4 flex flex-col gap-4" noValidate>
          <FormAlert error={joinError} claimedFields={JOIN_FIELDS} />
          <TextInput
            label="Invite code"
            name="inviteCode"
            placeholder="ABC234"
            required
            maxLength={INVITE_CODE_LENGTH}
            /*
             * Uppercased as you type. The server matches case-insensitively — verified in [44] — so
             * this is not a correctness fix; it makes the field agree with the code the partner is
             * reading off their own screen.
             */
            style={{ textTransform: 'uppercase' }}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => {
              event.currentTarget.value = event.currentTarget.value.toUpperCase()
              setJoinFieldError(undefined)
            }}
            error={joinFieldError ?? (joinError ? fieldError(joinError, 'inviteCode') : undefined)}
          />
          <Button type="submit" variant="success" pending={isJoining} pendingLabel="Joining…">
            Join
          </Button>
        </form>
      </section>
    </div>
  )
}
