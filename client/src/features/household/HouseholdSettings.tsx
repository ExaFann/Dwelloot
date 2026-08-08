import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  useGetHouseholdQuery,
  useLeaveHouseholdMutation,
  useRenameHouseholdMutation,
  type HouseholdMember,
} from './householdApi'
import { Avatar } from '../../components/ui/Avatar'
import { StandingTotals } from '../../components/ui/StandingTotals'
import { InviteIcon } from '../../components/ui/icons'
import { MAX_NAME_LENGTH, validateHouseholdName } from './householdValidation'
import { fieldError, toApiError, type ApiError } from '../../api/apiError'
import { Button } from '../../components/ui/Button'
import { liveQueryOptions } from '../../app/liveSync'
import { JoinInstead } from './JoinInstead'
import { TextInput } from '../../components/ui/TextInput'
import { FormAlert } from '../../components/ui/FormAlert'
import { SkeletonList } from '../../components/ui/Skeleton'

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
  const { data, isLoading, isError, error } = useGetHouseholdQuery(
    { householdId },
    liveQueryOptions,
  )

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
  /** Which member's totals are open — one at a time, and closed by default ([79]). */
  const [openMemberId, setOpenMemberId] = useState<number | null>(null)
  const [showCode, setShowCode] = useState(false)

  const nameRef = useRef<HTMLInputElement>(null)
  const partner = data?.members.find((member) => member.id !== selfId)
  /**
   * Two is the cap, enforced server-side — a household is *exactly* two people, and a third join is
   * a 409. So "two members" is not "a lot of members", it is **full**, and that is what decides
   * whether the invite code is still worth its space.
   */
  const isFull = (data?.members.length ?? 0) >= 2

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
      className="rounded-base border-2 border-ink bg-card p-4 sm:p-5"
    >
      <h2 id="household-heading" className="text-lg">
        Household
      </h2>

      {isError ? (
        <p role="alert" className="mt-3 text-muted">
          {toApiError(error).message}
        </p>
      ) : isLoading || !data ? (
        <div className="mt-3">
          <SkeletonList label="Loading your household settings" rows={2} />
        </div>
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
                <Button
                  type="submit"
                  className="flex-1"
                  pending={isRenaming}
                  pendingLabel="Saving…"
                >
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

          {/*
           * **Members first, and the invite code only while it is still worth something** — [79].
           *
           * The code used to be the largest thing on the card: a 2xl block with its own panel,
           * permanently, in a household that can only ever hold two people. Once the second person
           * has joined it is dead weight — there is nobody left to invite, and the server refuses a
           * third. So a full household gets a one-line disclosure instead, and the space goes to the
           * people, which is what the card is actually about.
           *
           * It is a disclosure rather than a deletion because the household can empty again: a
           * partner who leaves makes the code live once more, and hiding it outright would leave no
           * way back.
           */}
          <div className="mt-4">
            {/*
             * "You two", not "Members" — [90], owner's wording. A household here holds exactly two
             * people and the server refuses a third, so "Members" was a plural of an open-ended set
             * describing something that is never open-ended. The entity stays `HouseholdMember` and
             * the field stays `data.members`; only the label the two of them read changes.
             */}
            <p className="font-display text-xs font-semibold uppercase tracking-[0.08em] text-muted">
              You two
            </p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {data.members.map((member) => (
                <MemberCard
                  key={member.id}
                  member={member}
                  isYou={member.id === selfId}
                  isOpen={openMemberId === member.id}
                  onToggle={() =>
                    setOpenMemberId((current) => (current === member.id ? null : member.id))
                  }
                />
              ))}
            </ul>
          </div>

          {isFull ? (
            <div className="mt-4">
              <button
                type="button"
                aria-expanded={showCode}
                onClick={() => setShowCode((open) => !open)}
                className="focus-ring inline-flex items-center gap-1.5 font-display text-sm font-semibold text-primary transition-colors hover:text-body"
              >
                <InviteIcon className="size-3.5" />
                {showCode ? 'Hide invite code' : 'Show invite code'}
              </button>
              {/* Both of you are here — say why it is tucked away rather than leaving it a mystery. */}
              {!showCode && (
                <p className="mt-1 text-xs text-muted">
                  Your household is full, so nobody needs this right now.
                </p>
              )}
              {showCode && <InviteCode code={data.inviteCode} copied={copied} onCopy={copyCode} />}
            </div>
          ) : (
            /* Solo: this is the one action that matters, so it keeps the full-size treatment. */
            <InviteCode code={data.inviteCode} copied={copied} onCopy={copyCode} />
          )}

          {/*
           * Only while you are alone. A paired household is not yours alone to abandon — that is
           * what Leave is for — and the server refuses it with a 409 either way.
           */}
          {data.members.length < 2 && <JoinInstead householdName={data.name} />}

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

/**
 * One member: avatar, name, and their three standing totals on demand — [79].
 *
 * The owner's ask was that the members become the substantial thing on this card, and a name in a
 * bordered pill was not that. Opening one shows the **same three numbers, in the same component**,
 * that your own card shows at the top of the page (`StandingTotals`) — the comparison is the point,
 * so the two must not be two different renderings.
 *
 * Collapsed by default: two open cards would push Leave off the fold on a phone, and the totals are
 * a thing you go and look at rather than a thing you need on arrival.
 */
function MemberCard({
  member,
  isYou,
  isOpen,
  onToggle,
}: {
  member: HouseholdMember
  isYou: boolean
  isOpen: boolean
  onToggle: () => void
}) {
  return (
    <li className="min-w-0">
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={onToggle}
        /*
         * No press physics: this discloses, it does not act — the rule the Log tab's rows and the
         * approval queue both settled on. The border and the hover carry the affordance.
         */
        className={[
          'focus-ring flex w-full items-center gap-2.5 rounded-base border-2 px-2.5 py-2 text-left transition-colors',
          isOpen ? 'border-ink-accent bg-page' : 'border-ink bg-card hover:border-primary',
        ].join(' ')}
      >
        <Avatar
          userId={member.id}
          name={member.name}
          /* Purple is you, green is your opponent — the same role language as everywhere else. */
          role={isYou ? 'self' : 'opponent'}
          avatarKey={member.avatarKey}
          size="sm"
        />
        <span className="min-w-0 truncate font-display text-sm font-semibold">
          {member.name}
          {isYou && <span className="text-muted"> (you)</span>}
        </span>
      </button>

      {isOpen && (
        <div className="mt-2 rounded-base border-2 border-ink bg-page px-3 py-2">
          <StandingTotals
            coins={member.coins}
            lifetimePoints={member.lifetimePoints}
            currentWinStreak={member.currentWinStreak}
          />
        </div>
      )}
    </li>
  )
}

/**
 * The invite code panel. Extracted in [79] so the full and solo households can render the *same*
 * panel in two places rather than growing two copies that drift.
 */
function InviteCode({
  code,
  copied,
  onCopy,
}: {
  code: string
  copied: boolean
  onCopy: () => Promise<void>
}) {
  return (
    <div className="mt-3 rounded-base border-2 border-ink bg-page p-3">
      <p className="font-display text-xs font-semibold uppercase tracking-[0.08em] text-muted">
        Invite code
      </p>
      {/*
       * Selectable text, not only a copy button: `navigator.clipboard` needs a secure context
       * and can be refused. The generator already drops I, L, O, 0 and 1 because this gets
       * read out loud and typed by hand, and cramped text would give that back.
       */}
      <p className="mt-1 font-display text-2xl font-bold tracking-[0.15em]">{code}</p>
      <div className="mt-2 flex items-center gap-3">
        <Button variant="neutral" onClick={() => void onCopy()}>
          {copied ? 'Copied' : 'Copy code'}
        </Button>
        <span role="status" className="text-sm text-muted">
          {copied ? 'Copied to clipboard' : ''}
        </span>
      </div>
    </div>
  )
}
