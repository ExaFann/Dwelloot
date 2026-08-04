import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  useGetHouseholdQuery,
  useLeaveHouseholdMutation,
  useRenameHouseholdMutation,
} from './householdApi'
import { MAX_NAME_LENGTH, validateHouseholdName } from './householdValidation'
import { fieldError, toApiError, type ApiError } from '../../api/apiError'
import { Button } from '../../components/ui/Button'
import { TextInput } from '../../components/ui/TextInput'
import { FormAlert } from '../../components/ui/FormAlert'

/**
 * Household settings — `wireframes.md` §5: invite code, rename, leave.
 *
 * Reached only with a household: `AuthGate`'s `household` access sends anyone without one to
 * `/pairing`, so there is no "no household" state to render here.
 */

const CLAIMED_FIELDS = ['name'] as const

export function HouseholdSettings({
  householdId,
  selfId,
}: {
  householdId: number
  /** So the leave warning can name the partner who stays, rather than saying "your partner". */
  selfId: number
}) {
  const { data, isLoading, isError, error } = useGetHouseholdQuery({ householdId })

  const [renameHousehold, { isLoading: isRenaming }] = useRenameHouseholdMutation()
  const [leaveHousehold, { isLoading: isLeaving }] = useLeaveHouseholdMutation()

  const [isEditing, setIsEditing] = useState(false)
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState<string | undefined>()
  const [serverError, setServerError] = useState<ApiError | null>(null)
  const [confirmingLeave, setConfirmingLeave] = useState(false)
  const [copied, setCopied] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  const nameRef = useRef<HTMLInputElement>(null)
  const partner = data?.members.find((member) => member.id !== selfId)

  useEffect(() => {
    if (isEditing) nameRef.current?.focus()
  }, [isEditing])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 4000)
    return () => clearTimeout(timer)
  }, [notice])

  async function submitRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setServerError(null)

    const invalid = validateHouseholdName(name)
    setNameError(invalid)
    if (invalid) return

    try {
      const result = await renameHousehold({ householdId, name: name.trim() }).unwrap()
      setIsEditing(false)
      setNotice(`Renamed to ${result.name}.`)
    } catch (caught) {
      setServerError(toApiError(caught))
    }
  }

  async function confirmLeave() {
    setFailure(null)
    try {
      await leaveHousehold({ householdId }).unwrap()
      /*
       * No navigation. `Me` is invalidated, `householdId` goes null, and AuthGate redirects to
       * `/pairing` on the next render — the one mechanism for identity-driven routing (handover §3).
       */
    } catch (caught) {
      setFailure(toApiError(caught).message)
      setConfirmingLeave(false)
    }
  }

  async function copyCode() {
    if (!data) return
    try {
      await navigator.clipboard.writeText(data.inviteCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Refused or unavailable. The code is on screen and selectable, so nothing is lost — the same
      // call `InviteCodeCard` makes.
    }
  }

  return (
    <section
      aria-labelledby="household-heading"
      className="rounded-base border-2 border-ink bg-card p-4 shadow-hard-lg sm:p-5"
    >
      <h2 id="household-heading" className="text-lg">
        Household
      </h2>

      {isError ? (
        <p role="alert" className="mt-3 text-muted">
          {toApiError(error).message}
        </p>
      ) : isLoading || !data ? (
        <p role="status" className="mt-3 text-muted">
          Loading…
        </p>
      ) : (
        <>
          {isEditing ? (
            <form onSubmit={submitRename} noValidate className="mt-3 flex flex-col gap-3">
              <FormAlert error={serverError} claimedFields={CLAIMED_FIELDS} />
              <TextInput
                ref={nameRef}
                label="Household name"
                name="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={MAX_NAME_LENGTH + 20}
                error={nameError ?? (serverError ? fieldError(serverError, 'name') : undefined)}
              />
              <div className="flex gap-2">
                <Button type="submit" className="flex-1" pending={isRenaming} pendingLabel="Saving…">
                  Save
                </Button>
                <Button
                  variant="neutral"
                  onClick={() => {
                    setIsEditing(false)
                    setNameError(undefined)
                    setServerError(null)
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="min-w-0 truncate font-display text-xl font-bold">{data.name}</p>
              <Button
                variant="neutral"
                onClick={() => {
                  setName(data.name)
                  setNameError(undefined)
                  setIsEditing(true)
                }}
              >
                Rename
              </Button>
            </div>
          )}

          <div className="mt-4 rounded-base border-2 border-ink bg-page p-3">
            <p className="font-display text-xs font-semibold uppercase tracking-[0.08em] text-muted">
              Invite code
            </p>
            {/*
             * Selectable text, not only a copy button: `navigator.clipboard` needs a secure context
             * and can be refused. The generator already drops I, L, O, 0 and 1 because this gets
             * read out loud and typed by hand, and cramped text would give that back.
             */}
            <p className="mt-1 font-display text-2xl font-bold tracking-[0.15em]">{data.inviteCode}</p>
            <div className="mt-2 flex items-center gap-3">
              <Button variant="neutral" onClick={() => void copyCode()}>
                {copied ? 'Copied' : 'Copy code'}
              </Button>
              <span role="status" className="text-sm text-muted">
                {copied ? 'Copied to clipboard' : ''}
              </span>
            </div>
          </div>

          <div className="mt-4">
            <p className="font-display text-xs font-semibold uppercase tracking-[0.08em] text-muted">
              Members
            </p>
            <ul className="mt-1 flex flex-wrap gap-2">
              {data.members.map((member) => (
                <li
                  key={member.id}
                  className="rounded-base border-2 border-ink px-2.5 py-1 font-display text-sm font-semibold"
                >
                  {member.name}
                </li>
              ))}
            </ul>
          </div>

          {notice && (
            <p
              role="status"
              className="mt-4 rounded-base border-2 border-ink-accent bg-success px-3 py-2 font-display text-sm font-bold text-success-fg"
            >
              {notice}
            </p>
          )}
          {failure && (
            <p
              role="alert"
              className="mt-4 rounded-base border-2 border-ink-accent bg-danger px-3 py-2 font-display text-sm font-bold text-danger-fg"
            >
              {failure}
            </p>
          )}

          {confirmingLeave ? (
            <div className="mt-4 flex flex-col gap-2 rounded-base border-2 border-danger p-3">
              <p className="font-display text-sm font-bold">Leave {data.name}?</p>
              {/*
               * Which of the server's two branches will fire, derived from the member count rather
               * than guessed (log `015`). The second is irreversible and nothing else in the app
               * says so — the same principle as the pausing-reward disclosure in [51].
               */}
              <p className="text-sm text-muted">
                {data.members.length > 1
                  ? `You leave and ${partner?.name ?? 'your partner'} stays. They can pair with someone new.`
                  : 'You are the last member, so the household and everything in it — chores, rewards and history — is deleted.'}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="danger"
                  className="flex-1"
                  pending={isLeaving}
                  pendingLabel="Leaving…"
                  onClick={() => void confirmLeave()}
                >
                  Leave
                </Button>
                <Button variant="neutral" onClick={() => setConfirmingLeave(false)}>
                  Stay
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingLeave(true)}
              className="focus-ring mt-4 font-display text-sm font-semibold text-danger underline"
            >
              Leave this household
            </button>
          )}
        </>
      )}
    </section>
  )
}
