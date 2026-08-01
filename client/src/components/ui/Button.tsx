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
        'focus-ring rounded-base border-2 px-4 py-2.5 font-display text-sm font-bold uppercase tracking-[0.02em]',
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
