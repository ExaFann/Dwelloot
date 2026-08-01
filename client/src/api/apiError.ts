/**
 * Turns anything RTK Query can hand back into one displayable shape.
 *
 * The backend has exactly one error body (task [33]) — `{ error, errors, traceId }` — on every
 * failure from every source, including unmatched routes and unauthenticated requests. RTK Query's
 * error union is wider than that, because it also covers failures that never reached the server. A
 * component should not have to discriminate between the two before it can show a sentence.
 *
 * Every shape handled here was captured from the running API during task [41]; the fixtures in
 * `apiError.test.ts` are those exact bodies.
 */

export type ApiError = {
  /** HTTP status, or `null` when no response arrived (network failure, timeout). */
  status: number | null
  /** Always a non-empty, human-readable sentence. Safe to render. */
  message: string
  /** The per-field map from model validation. `null` when there is none. */
  fieldErrors: Record<string, string[]> | null
  /** Correlates with the server log. `null` for transport failures. */
  traceId: string | null
}

/** The last resort, when a body tells us nothing usable. */
const GENERIC_MESSAGE = 'Something went wrong. Please try again.'
const OFFLINE_MESSAGE = 'Could not reach the server. Check your connection and try again.'

/**
 * The documented body. `errors` is **always present and null when empty** — never key-checked.
 *
 * `title` is not part of that contract; it is ASP.NET's **ProblemDetails**, which the API is not
 * supposed to emit. It does, in exactly one place: `AuthController.cs:46` returns
 * `ValidationProblem(ModelState)` to surface Identity's errors, so a duplicate email at registration
 * comes back with `title` and no `error` (task [42]). Reading it as a fallback costs nothing and also
 * covers any un-caught ASP.NET model-binding path, which produces the same shape.
 */
type ErrorEnvelope = {
  error?: unknown
  title?: unknown
  errors?: unknown
  traceId?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Accepts the map only if it really is `{ [field]: string[] }` with at least one entry. */
function readFieldErrors(value: unknown): Record<string, string[]> | null {
  if (!isRecord(value)) return null

  const result: Record<string, string[]> = {}
  for (const [field, messages] of Object.entries(value)) {
    if (Array.isArray(messages)) {
      const strings = messages.filter((m): m is string => typeof m === 'string' && m.length > 0)
      if (strings.length > 0) result[field] = strings
    }
  }

  return Object.keys(result).length > 0 ? result : null
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

export function toApiError(error: unknown): ApiError {
  // Transport failures: RTK Query's non-numeric statuses. No response body exists.
  if (isRecord(error) && typeof error.status === 'string') {
    if (error.status === 'PARSING_ERROR') {
      // A response *did* arrive; it just was not JSON. `originalStatus` is the real HTTP status,
      // and this is what a missing VITE_API_BASE_URL produces — index.html with a 200.
      const originalStatus = typeof error.originalStatus === 'number' ? error.originalStatus : null
      return {
        status: originalStatus,
        message: GENERIC_MESSAGE,
        fieldErrors: null,
        traceId: null,
      }
    }

    return {
      status: null,
      message: OFFLINE_MESSAGE,
      fieldErrors: null,
      traceId: null,
    }
  }

  const status = isRecord(error) && typeof error.status === 'number' ? error.status : null
  const body: ErrorEnvelope = isRecord(error) && isRecord(error.data) ? error.data : {}

  return {
    status,
    message: readString(body.error) ?? readString(body.title) ?? GENERIC_MESSAGE,
    fieldErrors: readFieldErrors(body.errors),
    traceId: readString(body.traceId),
  }
}

/**
 * Looks up one field's first message, **case-insensitively**.
 *
 * The API returns PascalCase keys (`Name`, `Title`, `Points`) while request bodies and every other
 * part of the JSON are camelCase, so a form binding `errors.title` to its `title` input finds
 * nothing. Verified against the live API in task [41].
 */
export function fieldError(error: ApiError, field: string): string | undefined {
  if (!error.fieldErrors) return undefined
  const wanted = field.toLowerCase()
  for (const [key, messages] of Object.entries(error.fieldErrors)) {
    if (key.toLowerCase() === wanted) return messages[0]
  }
  return undefined
}

/**
 * Every message whose key does not correspond to one of the form's own fields.
 *
 * Not every key in `errors` is a field. A malformed JSON body produces `$` (a JSON path) and
 * `request`, neither of which any input is bound to — so a form that renders only what it recognises
 * discards both and appears to reject the submission for no stated reason.
 *
 * Render these alongside the form. Verified against the live API in task [41].
 */
export function unclaimedFieldErrors(error: ApiError, claimedFields: readonly string[]): string[] {
  if (!error.fieldErrors) return []
  const claimed = new Set(claimedFields.map((f) => f.toLowerCase()))
  return Object.entries(error.fieldErrors)
    .filter(([key]) => !claimed.has(key.toLowerCase()))
    .flatMap(([, messages]) => messages)
}
