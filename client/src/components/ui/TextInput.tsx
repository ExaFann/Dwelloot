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
        /*
         * Deliberately **not** `role="alert"`.
         *
         * Every form that renders these also renders a `FormAlert`, which is the assertive
         * announcement. Making each field error assertive too means one failed submit fires several
         * live regions at once, and simultaneous alerts interrupt each other — the user may hear one,
         * some, or a fragment. The message is still reachable: `aria-describedby` above ties it to the
         * input, so it is read when focus arrives, and `aria-invalid` marks the field as bad.
         *
         * Found in [44] by a test that could not tell two alerts apart.
         */
        <p id={errorId} className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
