import { useId, type InputHTMLAttributes } from 'react'

/**
 * A labelled text input that can show a server-side field error.
 *
 * The wiring that matters is `aria-describedby` + `aria-invalid`: without them a screen reader
 * announces the field as ordinary and never reads the error, so the form is unusable non-visually
 * even though it looks correct.
 */

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  label: string
  /** A message from the API, already resolved through `fieldError`. */
  error?: string
}

export function TextInput({ label, error, className = '', ...rest }: Props) {
  const id = useId()
  const errorId = `${id}-error`

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-display text-sm font-semibold">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={[
          'focus-ring rounded-base border-2 bg-card px-3 py-2.5 text-body placeholder:text-muted',
          error ? 'border-danger' : 'border-ink',
          className,
        ].join(' ')}
        {...rest}
      />
      {error && (
        // `role="alert"` so the message is announced when it appears after a failed submit.
        <p id={errorId} role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
