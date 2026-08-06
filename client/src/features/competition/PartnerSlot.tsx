import { useState } from 'react'
import { UserPlus } from 'lucide-react'

/**
 * The right-hand side of the head-to-head card **before a partner joins**.
 *
 * ### What was there before
 *
 * A single sentence — *"No one to duel yet. Share your invite code…"* — replacing the entire card.
 * So a solo user could log chores, and the dashboard showed no sign that they had: no avatar, no
 * list, nothing. The one screen that exists to say "here is what you have done" said nothing until
 * a second person arrived. The owner's point.
 *
 * ### What it is now
 *
 * The card keeps its shape. The left column is the real one — your avatar, your chores — and this
 * fills the right column with a placeholder that is honestly empty rather than absent: the seat is
 * visibly *there and unoccupied*, which is what makes the invite read as the next step rather than
 * as an error.
 *
 * ### Why the code is here and not behind a link
 *
 * Inviting is the only thing a solo household can usefully do, and it is the whole reason this
 * screen looks the way it does. Making the user navigate to Me → household settings to find the
 * code puts the app's one call to action two taps away from the place that asks for it.
 *
 * `InviteCodeCard` is not reused: that component owns the *onboarding* moment (it has a Continue
 * button and takes over the screen). This is a panel inside a card. Sharing them would mean one
 * component with a mode flag, which is how two different jobs end up fighting over one layout.
 */
export function PartnerSlot({ inviteCode }: { inviteCode: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(inviteCode)
      setCopied(true)
    } catch {
      /*
       * Clipboard access is refused in plenty of ordinary situations — an insecure origin, a denied
       * permission, an older browser. The code stays selectable text above, so the refusal costs
       * nothing: what must NOT happen is a "Copied" confirmation for a copy that did not occur.
       * [59] tested exactly this branch on `InviteCodeCard`.
       */
      setCopied(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-2 text-right">
      <p className="font-display text-sm font-semibold text-muted">Waiting for a partner</p>
      <p className="text-xs text-muted">Share this code. The duel starts the moment they join.</p>
      {/*
       * Selectable text, not only a button — the copy above is what the user reads out loud or
       * retypes when the clipboard is unavailable.
       */}
      <p className="font-display text-xl font-bold tracking-[0.15em] text-body select-all">
        {inviteCode}
      </p>
      <button
        type="button"
        onClick={() => void copy()}
        className="focus-ring pressable-sm inline-flex items-center gap-1.5 rounded-control border-2 border-ink bg-card px-2.5 py-1 font-display text-xs font-bold"
      >
        <UserPlus size={14} strokeWidth={3} aria-hidden="true" />
        {copied ? 'Copied' : 'Copy code'}
      </button>
    </div>
  )
}

/**
 * The empty seat itself — an avatar-shaped hole where the partner will be.
 *
 * Dashed rather than filled, and it carries **no colour from the palette**: green is the opponent's
 * colour and using it here would say a partner exists. An outline says the opposite.
 */
export function EmptyAvatar() {
  return (
    <span
      aria-hidden="true"
      className="grid size-12 shrink-0 place-items-center border-2 border-dashed border-ink text-muted"
    >
      <UserPlus size={20} strokeWidth={2.5} />
    </span>
  )
}
