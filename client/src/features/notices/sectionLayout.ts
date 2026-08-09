/**
 * The Notices tab's three sections are **fixed boxes that scroll inside**, not boxes that grow.
 *
 * ### The problem this solves
 *
 * Each section was sized by its contents, so approving one chore, or a partner logging three,
 * re-laid out the whole page: the two feeds on the right jumped up or down, and on a phone the
 * section you were reading moved under your thumb. The owner's word for it was "uncontrollable" —
 * the page had no shape of its own, only the shape of whatever data happened to be loaded.
 *
 * A fixed height gives every section a permanent place. Scrolling moves the *contents* of a box,
 * which is a small, local, expected motion, instead of moving every box below it.
 *
 * ### The trade-off, stated rather than hidden
 *
 * A fixed height reserves space that an empty section does not need — a household with nothing
 * waiting still gets a full-size "Waiting on you" card. That is deliberate: the alternative is a
 * card that changes size the moment the first chore arrives, which is the behaviour being removed.
 * Empty states are centred so the box does not read as a rendering failure.
 *
 * ### Why these classes and not `max-h`
 *
 * `max-h` still grows with content up to the cap, so it fixes only the worst case. `h` fixes all of
 * them.
 *
 * `min-h-0` on the scroll area is load-bearing and easy to lose: a flex child defaults to
 * `min-height: auto`, which refuses to shrink below its content, so `overflow-y-auto` never
 * activates and the section grows anyway. The scroll appears to "not work" and the cause is one
 * missing class on a parent.
 */

/**
 * The section card itself: a column with a fixed height, so the header and any action bar stay put
 * while only the list moves.
 *
 * `h-full` from `lg` hands the height decision to the grid row, which is what keeps the left column
 * and the two stacked right-hand cards aligned to the same bottom edge.
 */
export const SECTION_SHELL =
  'flex h-[22rem] min-h-0 flex-col rounded-base border-2 border-ink bg-card p-4 sm:p-5 lg:h-auto lg:flex-1'

/**
 * The scrolling region between them. `min-h-0` is the class that makes the overflow real; `flex-1`
 * is what makes it take the space the header and footer do not.
 */
/**
 * The scrolling region between them. `min-h-0` is the class that makes the overflow real; `flex-1`
 * is what makes it take the space the header and footer do not.
 *
 * **Spread onto a `<ScrollArea>`, not a plain `<div>`** since [85] — that component owns the
 * overflow, the hidden scrollbar and the edge fade, so those three are not retyped four times.
 */
export const SECTION_BODY = 'mt-3 min-h-0 flex-1'

/**
 * The height of an `lg` grid row.
 *
 * `22rem` since [84], down from `34rem`. The old figure existed to make one tall card equal two
 * stacked ones plus their gap; the layout is now **two rows of two**, so each row only has to be a
 * comfortable card — and 34rem of card was most of a laptop screen for a queue that is usually two
 * items long.
 */
export const SECTION_ROW_HEIGHT = 'lg:h-[22rem]'
