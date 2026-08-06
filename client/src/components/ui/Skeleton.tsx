/**
 * Loading placeholders shaped like the thing that is coming.
 *
 * Every screen said `Loading…` in muted text. That is honest but it tells the user nothing about
 * what they are waiting for, and the layout jumps the moment the data lands because a one-line
 * sentence is replaced by a list. A placeholder the same shape as the content answers both: it
 * reads as "this is filling in" rather than "this is broken", and the page stops moving.
 *
 * ### The accessibility rule these have to keep
 *
 * The bars are decoration — `aria-hidden`. The **announcement** is a single visually-hidden
 * sentence with `role="status"`, so a screen reader hears "Loading chores" once instead of being
 * read a fence of empty boxes. Replacing the old `<p role="status">Loading…</p>` with bare divs
 * would have silently removed that announcement, which is the kind of regression a visual change
 * makes without anyone noticing.
 *
 * ### No shimmer
 *
 * `design-tokens.md` forbids gradients, and every shimmer effect is a moving gradient. These pulse
 * opacity instead, which is flat, and they hold still under `prefers-reduced-motion` because
 * Tailwind's `animate-pulse` already respects it via `motion-safe`-style handling in this project's
 * reduced-motion rules — the bars stay visible either way, so nothing is lost.
 */

type Props = {
  /** What is loading, in the user's words. Announced once: "Loading your chores…". */
  label: string
  /** How many placeholder rows to draw. Match the usual content, not the maximum. */
  rows?: number
}

export function SkeletonList({ label, rows = 3 }: Props) {
  return (
    <div>
      <span role="status" className="sr-only">
        {label}
      </span>
      <ul aria-hidden="true" className="flex animate-pulse flex-col gap-2">
        {Array.from({ length: rows }, (_, index) => (
          <li
            key={index}
            className="flex items-center justify-between gap-3 rounded-control border-2 border-ink bg-page px-3 py-2.5"
          >
            {/*
             * Widths alternate rather than being uniform. A stack of identical bars reads as a
             * pattern; uneven ones read as text that has not arrived yet.
             */}
            <span
              className="h-4 rounded-base bg-ink opacity-20"
              style={{ width: index % 2 === 0 ? '60%' : '45%' }}
            />
            <span className="h-4 w-10 shrink-0 rounded-base bg-ink opacity-20" />
          </li>
        ))}
      </ul>
    </div>
  )
}

/** A single block, for a card that is not a list — the head-to-head panel, a stats tile. */
export function SkeletonBlock({ label, className = '' }: { label: string; className?: string }) {
  return (
    <div className={className}>
      <span role="status" className="sr-only">
        {label}
      </span>
      <div
        aria-hidden="true"
        className="h-full w-full animate-pulse rounded-base bg-ink opacity-10"
      />
    </div>
  )
}
