import { Link } from 'react-router'
import { Bell } from 'lucide-react'
import { usePendingCount } from './usePendingCount'

/**
 * The dashboard's nudge to clear the approval queue.
 *
 * ### Why this exists at all
 *
 * A pending chore is worth nothing. Points are credited **on approval** (log `048`, measured:
 * `partnerPoints` went 0 → 10 the moment a log was approved), so while your partner's chores sit
 * unapproved the standing on this very screen is understating them — and the day settles from
 * whatever was approved when it closed.
 *
 * So the queue is not an inbox to get to eventually; it is the thing standing between the two of you
 * and a decided duel.
 *
 * ### Why it is a card and not a modal
 *
 * The owner asked for a prompt. This is a prominent card at the top of the dashboard rather than a
 * dialog over it, because the dashboard is the first screen after every sign-in and a modal there
 * would be a thing to dismiss every single morning — the fastest way to teach someone to dismiss it
 * without reading. It sits above the standing it is explaining, which is the argument for reading it.
 *
 * Nothing is auto-approved and nothing is decided here: approving is a judgement about someone
 * else's work, so it stays on the Notices tab where the reject-with-a-reason path lives too.
 */
export function ApprovalPrompt() {
  const pending = usePendingCount()

  if (pending === 0) return null

  return (
    <section
      aria-labelledby="approval-prompt-heading"
      className="rounded-base border-2 border-ink-accent bg-warning p-4 text-warning-fg"
    >
      <div className="flex items-start gap-3">
        <Bell aria-hidden="true" size={20} strokeWidth={3} className="mt-0.5 shrink-0" />
        <div className="min-w-0">
          <h2 id="approval-prompt-heading" className="font-display text-base font-bold">
            {pending === 1
              ? '1 chore is waiting on you'
              : `${pending} chores are waiting on you`}
          </h2>
          {/*
           * States the consequence rather than nagging: the reason to do this is that the duel
           * cannot be decided — and the loot box cannot be won — until it is done.
           */}
          <p className="mt-1 text-sm">
            Points only count once you approve them, so the duel can’t be settled — and no loot box
            can be won — while these are outstanding.
          </p>
          <Link
            to="/notices"
            className="focus-ring pressable mt-3 inline-block rounded-control border-2 border-ink-accent bg-card px-4 py-2 font-display text-sm font-bold uppercase tracking-[0.02em] text-body"
          >
            Review them
          </Link>
        </div>
      </div>
    </section>
  )
}
