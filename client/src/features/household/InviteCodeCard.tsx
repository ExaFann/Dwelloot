import { useState } from 'react'
import { Button } from '../../components/ui/Button'

/**
 * Shown once, immediately after creating a household.
 *
 * This exists because the invite code is the **sole credential** for joining (handover §4.5) and
 * creation is the moment the user needs it. Redirecting straight to the dashboard would leave them
 * with a household their partner cannot reach and nothing to send.
 *
 * The code is rendered as real, selectable text rather than only behind the copy button:
 * `navigator.clipboard` requires a secure context and can be refused, so copying is an accelerator,
 * not the only way to get the code out.
 */
export function InviteCodeCard({ code, onContinue }: { code: string; onContinue: () => void }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Refused or unavailable. The code is on screen and selectable, so nothing is lost.
    }
  }

  return (
    <section>
      <h1 className="text-3xl">Household created</h1>
      <p className="mt-2 text-muted">
        Send this code to your partner. They enter it to join — it is the only way in.
      </p>

      <div className="mt-6 rounded-base border-2 border-ink bg-card p-5 shadow-hard-lg">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.08em] text-muted">
          Invite code
        </p>
        {/*
         * `tracking` and the display face matter here: the generator already drops I, L, O, 0 and 1
         * because this gets transcribed by hand, and cramped text would give that back.
         */}
        <p className="mt-1 font-display text-4xl font-bold tracking-[0.15em]">{code}</p>

        <div className="mt-4 flex items-center gap-3">
          <Button variant="neutral" onClick={handleCopy}>
            {copied ? 'Copied' : 'Copy code'}
          </Button>
          {/* Announced when it changes, so the confirmation is not visual-only. */}
          <span role="status" className="text-sm text-muted">
            {copied ? 'Copied to clipboard' : ''}
          </span>
        </div>
      </div>

      <div className="mt-6">
        <Button onClick={onContinue}>Continue</Button>
      </div>
    </section>
  )
}
