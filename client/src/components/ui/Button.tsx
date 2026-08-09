import type { ButtonHTMLAttributes, ReactNode } from 'react'

/**
 * The first shared component. Carries the press physics and the token classes so no screen retypes
 * them — the drift that `design-tokens.md` §1 exists to prevent.
 */

type Variant = 'primary' | 'success' | 'danger' | 'neutral'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-primary-fg border-ink-accent',
  success: 'bg-success text-success-fg border-ink-accent',
  danger: 'bg-danger text-danger-fg border-ink-accent',
  neutral: 'bg-card text-body border-ink',
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  /** Replaces the label and disables the button while a request is in flight. */
  pending?: boolean
  pendingLabel?: string
  children: ReactNode
}

export function Button({
  variant = 'primary',
  pending = false,
  pendingLabel = 'Working…',
  disabled,
  className = '',
  children,
  ...rest
}: Props) {
  const isDisabled = disabled || pending

  return (
    <button
      // `type` defaults to "submit" inside a form, which is rarely what a bare button wants. Callers
      // that need submit pass it explicitly.
      type="button"
      disabled={isDisabled}
      // Announced by screen readers while the request is in flight, without moving focus.
      aria-busy={pending || undefined}
      className={[
        /*
         * `rounded-control`, not `rounded-base`. Surfaces are square; things you press keep their
         * corners, because a square slab with a hard shadow reads as a card lying on the page rather
         * than a key standing off it. See `--geometry-radius-control` in `theme.css`.
         */
        /*
         * `inline-flex` + `min-h-11`, so a button sized by a 16px icon and a button sized by a line
         * of text are the same height.
         *
         * Without it the height came from whatever was inside: a text label produces a line box with
         * ascender and descender space, a bare `<svg>` produces a 16px inline replaced element, and
         * the two differ by a few pixels. It showed up on the Store card, where a disabled **Redeem**
         * sat beside an icon-only **Edit** and the pair looked mismatched — the shadow that normally
         * masks a small difference is absent while a control is disabled.
         *
         * 44px is also the touch-target minimum, so the floor is doing two jobs.
         */
        'focus-ring inline-flex min-h-11 items-center justify-center rounded-control border-2 px-4 py-2.5 font-display text-sm font-bold uppercase tracking-[0.02em]',
        VARIANTS[variant],
        // `pressable` carries the shadow; a disabled control should not look liftable.
        isDisabled ? 'cursor-not-allowed opacity-60' : 'pressable',
        className,
      ].join(' ')}
      {...rest}
    >
      {pending ? pendingLabel : children}
    </button>
  )
}
