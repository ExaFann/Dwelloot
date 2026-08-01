import type { ApiError } from '../../api/apiError'
import { unclaimedFieldErrors } from '../../api/apiError'

/**
 * Form-level error display.
 *
 * Renders the API's sentence **plus every field message no input claimed**. That second part is not
 * defensive padding — it is load-bearing:
 *
 * - Registering with a taken email returns `{"DuplicateEmail": […], "DuplicateUserName": […]}`.
 *   No input is bound to either key, so a form that only rendered errors it recognised would show
 *   nothing and appear to reject the submission for no reason.
 * - A malformed request body returns `$` and `request`, which are a JSON path and a parameter name.
 *
 * Both shapes were captured from the running API (logs `041`, `042`).
 */
export function FormAlert({
  error,
  claimedFields,
}: {
  error: ApiError | null
  /** The inputs this form renders its own errors against; anything else is shown here. */
  claimedFields: readonly string[]
}) {
  if (!error) return null

  const extra = unclaimedFieldErrors(error, claimedFields)

  return (
    <div
      role="alert"
      className="rounded-base border-2 border-ink-accent bg-danger px-3 py-2.5 text-danger-fg"
    >
      <p className="font-display text-sm font-bold">{error.message}</p>
      {extra.length > 0 && (
        <ul className="mt-1 list-disc pl-5 text-sm">
          {extra.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
