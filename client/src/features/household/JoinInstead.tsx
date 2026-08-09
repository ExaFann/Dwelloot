import { useState } from 'react'
import { useJoinHouseholdMutation } from './householdApi'
import { INVITE_CODE_LENGTH, validateInviteCode } from './householdValidation'
import { toApiError } from '../../api/apiError'
import { Button } from '../../components/ui/Button'
import { TextInput } from '../../components/ui/TextInput'

/**
 * Accept someone else's invite code **after** you have already made a household.
 *
 * ### The dead end this fixes
 *
 * The only place to type an invite code was `/pairing`, and `AuthGate` makes that screen reachable
 * only while you have no household. So two people who each created one — the obvious thing to do
 * when you both open the app before talking to each other — had no route to pairing at all. Neither
 * could reach the other's code, and nothing on any screen hinted at what to do. Owner's report,
 * 2026-08-07.
 *
 * ### Why this could not be done in the browser
 *
 * The tempting fix is "leave, then join", two calls from here. It is a data-loss bug waiting to
 * happen: `POST /leave` **deletes** a household whose last member walks out, taking its chores,
 * rewards, competitions and history by cascade. Mistype the code and you have destroyed all of that
 * to reach a household that does not exist — with no way back.
 *
 * So `JoinAsync` moves the user itself, in one transaction: a wrong code, or a target that filled up
 * in the meantime, returns before anything is written. This component is a form over that endpoint,
 * and the rule it must not undermine is *the server checks the code before it deletes anything*.
 *
 * ### It is only offered while you are alone
 *
 * A household of two is not yours alone to abandon — leaving evicts you from somewhere another
 * person also lives, which is what the Leave button is for and should be a decision made
 * deliberately rather than as a side effect of typing a code. The server refuses it with a 409
 * regardless; this simply does not offer it.
 */
export function JoinInstead({ householdName }: { householdName: string }) {
  const [join, { isLoading }] = useJoinHouseholdMutation()
  const [isOpen, setIsOpen] = useState(false)
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState<string>()
  const [failure, setFailure] = useState<string>()

  async function submit() {
    const invalid = validateInviteCode(code)
    if (invalid) {
      setCodeError(invalid)
      return
    }

    setCodeError(undefined)
    setFailure(undefined)
    try {
      await join({ inviteCode: code.trim() }).unwrap()
      /*
       * No navigation and no success message. `joinHousehold` invalidates `Me`, so `AuthGate`
       * re-renders with the new household and this screen is now showing somewhere else's settings.
       * Navigating here as well would be the second mechanism handover §3 warns about.
       */
    } catch (caught) {
      setFailure(toApiError(caught).message)
    }
  }

  if (!isOpen) {
    return (
      <div className="mt-4">
        <Button variant="neutral" onClick={() => setIsOpen(true)}>
          Join your partner instead
        </Button>
        <p className="mt-2 text-sm text-muted">
          Already made a household each? Take theirs and this one goes away.
        </p>
      </div>
    )
  }

  return (
    <div className="mt-4 flex flex-col gap-3 rounded-base border-2 border-danger p-3">
      <p className="font-display text-sm font-bold">Join with their code</p>
      {/*
       * Names the cost before the action, the same obligation as the Leave confirmation and the
       * pausing-reward disclosure: this deletes a household and everything in it, and the user has
       * no other way to know that.
       */}
      <p className="text-sm text-muted">
        You will join their household, and <strong className="text-body">{householdName}</strong> —
        its chores, rewards and history — is deleted. Nothing happens if the code is wrong.
      </p>

      <TextInput
        label="Their invite code"
        name="joinCode"
        value={code}
        placeholder="ABC234"
        maxLength={INVITE_CODE_LENGTH}
        autoComplete="off"
        spellCheck={false}
        style={{ textTransform: 'uppercase' }}
        onChange={(event) => {
          setCode(event.target.value.toUpperCase())
          setCodeError(undefined)
        }}
        error={codeError}
      />

      {failure && (
        <p
          role="alert"
          className="rounded-base border-2 border-ink-accent bg-danger px-3 py-2 font-display text-sm font-bold text-danger-fg"
        >
          {failure}
        </p>
      )}

      <div className="flex gap-2">
        <Button
          variant="danger"
          className="flex-1"
          pending={isLoading}
          pendingLabel="Joining…"
          onClick={() => void submit()}
        >
          Join and delete this one
        </Button>
        <Button
          variant="neutral"
          onClick={() => {
            setIsOpen(false)
            setCode('')
            setCodeError(undefined)
            setFailure(undefined)
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}
