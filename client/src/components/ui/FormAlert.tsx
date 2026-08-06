import type { ApiError } from '../../api/apiError'
import { unclaimedFieldEntries } from '../../api/apiError'
import { humaniseMessages } from '../../api/humaniseError'

/**
 * Form-level error display.
 *
 * Renders the API's sentence **plus every field message no input claimed**. That second part is
 * load-bearing, not defensive padding:
 *
 * - A taken email returns `{"DuplicateEmail": […], "DuplicateUserName": […]}`. No input is bound to
 *   either key, so a form that rendered only errors it recognised would show nothing and appear to
 *   reject the submission for no reason.
 * - A malformed request body returns `$` and `request` — a JSON path and a parameter name.
 *
 * Both shapes were captured from the running API (logs `041`, `042`).
 *
 * Those raw messages now pass through `humaniseError` on the way out, which is what stops the
 * "Username 'you@example.com' is already taken" wording reaching someone who never entered a
 * username. Anything the map has not seen is shown **verbatim** — the alternative is a form that
 * silently eats a message nobody anticipated.
 */

/**
 * Wrapper sentences that carry nothing their field messages do not.
 *
 * The first is the project's own envelope (`Program.cs:166`); the second is ASP.NET's
 * ProblemDetails title, which is what `AuthController.cs:46` produces. Above a single red-outlined
 * field, *"One or more fields are invalid"* says less than the field already does — the owner's
 * note on the pairing screen.
 */
const REDUNDANT_WRAPPERS = new Set([
  'one or more fields are invalid.',
  'one or more validation errors occurred.',
])

function isWrapper(message: string): boolean {
  return REDUNDANT_WRAPPERS.has(message.trim().toLowerCase())
}

export function FormAlert({
  error,
  claimedFields,
}: {
  error: ApiError | null
  /** The inputs this form renders its own errors against; anything else is shown here. */
  claimedFields: readonly string[]
}) {
  if (!error) return null

  const extra = humaniseMessages(unclaimedFieldEntries(error, claimedFields))

  /*
   * The headline is dropped only when it is one of those wrappers **and** something else is going
   * to be shown in its place — either an unclaimed message here, or a field error on an input.
   *
   * Both halves matter. Drop it with nothing to replace it and the user gets a form that rejected
   * them and said nothing, which is the failure this component was written for. Keep it alongside a
   * single field error and the alert repeats, in vaguer words, what the field already says.
   */
  const somethingElseSpeaks = extra.length > 0 || error.fieldErrors !== null
  const headline = isWrapper(error.message) && somethingElseSpeaks ? null : error.message

  if (headline === null && extra.length === 0) return null

  return (
    <div
      role="alert"
      className="rounded-base border-2 border-ink-accent bg-danger px-3 py-2.5 text-danger-fg"
    >
      {headline && <p className="font-display text-sm font-bold">{headline}</p>}
      {extra.length > 0 && (
        <ul
          className={[
            'text-sm',
            // A single message reads as the alert's own sentence; several need bullets to separate.
            extra.length > 1 ? 'list-disc pl-5' : '',
            headline ? 'mt-1' : 'font-display font-bold',
          ].join(' ')}
        >
          {extra.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
