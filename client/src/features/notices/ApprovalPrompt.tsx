import { Link } from 'react-router'
import { NoticesIcon } from '../../components/ui/icons'
import { useOverdueApprovals } from './useOverdueApprovals'

/**
 * The dashboard's nudge to clear the approval queue.
 *
 * ### It fires only when something is genuinely stuck
 *
 * **Overdue chores only** — ones logged before the current day began. Owner's correction: it used to
 * appear for *every* pending chore, which meant it popped up the moment the partner logged anything
 * and duplicated two things that already say so, the nav badge and the Notices tab. A card that
 * appears constantly is a card people learn to look past.
 *
 * Yesterday's undecided chore is different in kind, not degree: settlement refuses to close a period
 * while a pending log sits inside it, so that one really is holding a duel open that should already
 * have been won or lost. That is what deserves the top of the screen.
 *
 * It also used to count **store changes**, because it read `usePendingCount` — which sums both since
 * [68] — while rendering the number with the word "chore". Re-pricing a reward announced itself as
 * "1 chore is waiting on you". `useOverdueApprovals` counts chores and nothing else.
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
  const overdue = useOverdueApprovals()

  if (overdue === 0) return null

  return (
    <section
      aria-labelledby="approval-prompt-heading"
      className="rounded-base border-2 border-ink-accent bg-warning p-4 text-warning-fg"
    >
      <div className="flex items-start gap-3">
        <NoticesIcon className="mt-0.5 size-5 shrink-0" />
        <div className="min-w-0">
          <h2 id="approval-prompt-heading" className="font-display text-base font-bold">
            {overdue === 1
              ? '1 chore from before today is still waiting'
              : `${overdue} chores from before today are still waiting`}
          </h2>
          {/*
           * States the consequence rather than nagging — and now names a consequence that has
           * actually happened, rather than one that might: the period these belong to has already
           * ended and cannot be settled until they are decided.
           */}
          <p className="mt-1 text-sm">
            That day is over but can’t be settled until you decide — so nobody has won it, and no
            loot box has been handed out for it.
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
