import { useRef, useState } from 'react'
import { RejectIcon } from '../../components/ui/icons'
import { STATUS_LABEL } from './logDisplay'
import { ChoreCredit, ChoreStatusDot, ChoreTitle } from './choreStatusDisplay'
import { useScrollFade } from '../../app/useScrollFade'
import type { ActivityLogStatus } from './activityApi'

/**
 * One person's last few chores, shown under their avatar on the head-to-head card.
 *
 * Moved here from a separate card at the bottom of the dashboard: the interesting question is
 * *"what has each of us been doing"*, and the answer belongs beside the score it explains rather
 * than below two other sections.
 *
 * Scrolls rather than growing — the card must stay a fixed shape whether someone has logged one
 * chore or twenty.
 */

export type RecentChore = {
  id: number
  activityTitle: string
  pointsAwarded: number
  status: ActivityLogStatus
}

export function RecentChoresColumn({
  chores,
  align,
  emptyLabel,
  onRemove,
  isRemoving = false,
}: {
  chores: RecentChore[]
  align: 'left' | 'right'
  emptyLabel: string
  /**
   * Removes one of the caller's own pending chores — task [71]. Omit it and no control is drawn.
   *
   * **A callback, not a mutation hook in here.** Calling `useDeleteActivityLogMutation` directly
   * turned this from a presentational component into one that cannot render without a Redux
   * Provider — which broke six existing tests that had every right to render it bare, and would
   * have made it unusable anywhere outside the store. The card above already owns every query on
   * this screen; owning one more mutation costs it nothing.
   */
  onRemove?: (choreId: number) => void
  /** Disables the controls while a removal is in flight, so a double tap cannot send twice. */
  isRemoving?: boolean
}) {
  /**
   * Which row is asking "Delete?" — one at a time ([78]).
   *
   * The owner's complaint about the old always-visible × was mis-taps: a destructive control sat
   * permanently on a 12px-tall row inside a scroller, one thumb-width from the chore titles. It is
   * now revealed on hover or focus, and it *asks* rather than acts — the same two-step the store's
   * redeem, the chore editor's delete and leaving a household all use. As `RewardCard` puts it, the
   * button that sends the request is then not the button being double-tapped.
   *
   * The confirm is **inline, in the row**. A floating menu is the obvious alternative and cannot
   * work here: this list is `max-h-28 overflow-y-auto` inside a two-column grid, so anything
   * absolutely positioned is clipped by its own scroll container.
   */
  const [confirmingId, setConfirmingId] = useState<number | null>(null)
  /**
   * Which trigger to hand focus back to after a cancel. A ref, not state: it describes a one-shot
   * consequence of an interaction rather than something rendered, and it is read by the callback
   * ref below at the moment the trigger comes back. Without it, cancelling drops focus on `<body>`
   * and a keyboard user restarts the page from the top.
   */
  const refocusRef = useRef<number | null>(null)
  /** Fades only the edge the list continues past — [85]. */
  const { attach: attachList, fadeStyle } = useScrollFade()

  const cancelConfirm = (id: number) => {
    refocusRef.current = id
    setConfirmingId(null)
  }

  if (chores.length === 0) {
    return <p className="mt-3 text-xs text-muted">{emptyLabel}</p>
  }

  return (
    <ul
      ref={attachList}
      style={fadeStyle}
      /*
       * [85]: no scrollbar, and the fade only on an edge that continues — a chunky platform
       * scrollbar inside a 112px box was the loudest thing in it, and [84]'s unconditional top
       * fade was washing out the first row at rest. Not `ScrollArea`, because this is a `<ul>`:
       * the list semantics have to stay on the element that scrolls.
       */
      className="scroll-fade-y scrollbar-none mt-3 flex max-h-28 flex-col gap-1.5 overflow-y-auto"
      // The card owns the score; this is supporting detail, so it is not a landmark.
      aria-label="Recent chores"
      /*
       * Escape backs out from anywhere in the list, the same escape the overlays offer. On the
       * `<ul>` rather than the confirming row because events bubble *up*: a handler on the row
       * would miss a key pressed anywhere else in the list, including — after a cancel — the row
       * focus has just returned to.
       */
      onKeyDown={(event) => {
        if (event.key === 'Escape' && confirmingId !== null) {
          event.preventDefault()
          cancelConfirm(confirmingId)
        }
      }}
    >
      {chores.map((chore) => {
        const removable = Boolean(onRemove) && chore.status === 'Pending'

        /*
         * The confirm replaces the row's own content rather than sitting beside it: at `text-xs`
         * inside a 112px scroller there is no room for both, and a row that grew would push the
         * rows below it under the reader's eye.
         */
        if (removable && confirmingId === chore.id) {
          return (
            <li
              key={chore.id}
              // Escape backs out from anywhere inside the row, the same escape the overlays offer.
              className={[
                'flex items-center gap-1.5 text-xs',
                align === 'right' ? 'flex-row-reverse text-right' : '',
              ].join(' ')}
            >
              <span className="min-w-0 flex-1 truncate font-display font-semibold text-muted">
                Delete {chore.activityTitle}?
              </span>
              <button
                type="button"
                disabled={isRemoving}
                onClick={() => {
                  onRemove?.(chore.id)
                  setConfirmingId(null)
                }}
                aria-label={`Delete ${chore.activityTitle}`}
                className="focus-ring shrink-0 rounded-control border border-ink-accent bg-danger px-1.5 py-0.5 font-display text-[0.65rem] font-bold text-danger-fg disabled:opacity-50"
              >
                Delete
              </button>
              {/* Never disabled while a delete is in flight: backing out must always be available. */}
              <button
                type="button"
                onClick={() => cancelConfirm(chore.id)}
                aria-label={`Keep ${chore.activityTitle}`}
                className="focus-ring shrink-0 rounded-control px-1 py-0.5 font-display text-[0.65rem] font-semibold text-muted underline"
              >
                Keep
              </button>
            </li>
          )
        }

        return (
          <li
            key={chore.id}
            /*
             * **The whole row opens the confirm, not only the glyph** ([79]).
             *
             * Hover is the desktop hint, and a phone has none — the owner's point. The glyph stays
             * a real `<button>` because that is what keyboard and screen-reader users need, and it
             * is not wrapped in another button (nested interactive elements are invalid HTML and
             * produce an ambiguous accessible name). Instead the row carries a click as an
             * *enlarged target*: a tap anywhere on it opens the same confirm the glyph does. The
             * glyph's own click bubbles here and sets the same id, which is idempotent.
             */
            onClick={removable ? () => setConfirmingId(chore.id) : undefined}
            className={[
              // `group` is what lets the trigger hide until this row is hovered or focused.
              'group flex items-center gap-1.5 text-xs',
              removable ? 'cursor-pointer' : '',
              align === 'right' ? 'flex-row-reverse text-right' : '',
            ].join(' ')}
          >
            {/*
             * A status dot rather than a badge: at this size a word per row would crowd out the
             * chore name, which is the thing being scanned for.
             */}
            <ChoreStatusDot status={chore.status} />
            {/*
             * The row says its status twice, both times without punctuation — [83], owner's call
             * replacing the `+N` / `(N)` / `—` notation, which made three states into three bits
             * of typography to decode:
             *
             * - approved: the number and the Points mark, plainly — it happened, this is what it
             *   paid. No `+`: the mark is the unit, and a sign implies a ledger.
             * - pending:  **no figure at all.** The dot already says "waiting", and a number on an
             *   unapproved chore reads as already earned — the exact claim `describeLogPoints`
             *   exists to prevent, now made by omission instead of brackets.
             * - rejected: the title struck through. The universal mark for "this didn't count",
             *   and it needs no legend.
             *
             * The sr-only status keeps carrying the state in words for screen readers, where a
             * strikethrough and a missing number are both silent.
             */}
            <ChoreTitle status={chore.status} className="truncate font-display font-semibold">
              {chore.activityTitle}
            </ChoreTitle>
            <ChoreCredit
              status={chore.status}
              points={chore.pointsAwarded}
              className="text-muted"
            />
            <span className="sr-only">{STATUS_LABEL[chore.status]}</span>
            {/*
             * Pending only, and only on your own column. An approved chore has already moved the
             * score and may sit in a settled period; taking it back is the partner's job, through
             * rejection. Showing a control that can only fail would be the "no raw server
             * internals" rule one step too late — at the message rather than the affordance.
             */}
            {removable && (
              /*
               * Hidden until wanted, but never *absent*: `opacity-0` keeps it in the tab order and
               * in the accessibility tree, so a keyboard reveals it via `focus-visible` and a
               * screen reader finds it regardless. `hidden` would have removed it from both.
               *
               * **`focus-visible`, not `group-focus-within`** — [80], and it is a bug fix rather
               * than a preference. Cancelling hands focus back to this trigger (see `cancelConfirm`),
               * which is right for a keyboard user but meant `group-focus-within` then held the ×
               * lit until you clicked somewhere else: the owner saw a glyph that would not go away.
               * `:focus-visible` does not match focus that followed a mouse click, so a pointer user
               * sees it fade and a keyboard user still sees where they are. Scoped to the button
               * itself because the group — the `<li>` — is not focusable.
               *
               * **`opacity-0` at every width since [84].** It used to be `sm:opacity-0`, leaving
               * the × permanently on screen below 640px on the theory that a phone has no hover to
               * reveal it. The owner's correction: a resting × is exactly the mis-tap target the
               * confirm step was introduced to remove, and on touch the affordance is already the
               * row — tapping anywhere on it opens the same confirm. So the glyph is a pointer
               * convenience only, and a phone shows a clean row.
               */
              <button
                type="button"
                onClick={() => setConfirmingId(chore.id)}
                aria-label={`Remove ${chore.activityTitle}`}
                ref={(node) => {
                  if (node && refocusRef.current === chore.id) {
                    refocusRef.current = null
                    node.focus()
                  }
                }}
                className="focus-ring ml-auto shrink-0 rounded-control p-0.5 text-muted opacity-0 transition-opacity hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
              >
                <RejectIcon className="size-3" />
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
