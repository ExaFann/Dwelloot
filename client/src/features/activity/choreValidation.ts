/**
 * Client-side validation for a chore's title and points.
 *
 * **This exists because the server's rejection of a malformed payload is not fit to show a user.**
 * Sending `points: null` — a plausible encoding of an empty box — fails JSON deserialisation rather
 * than model validation, and the reply names the .NET request type:
 *
 *     "$.points": ["The JSON value could not be converted to
 *                   API.Dtos.Activities.CreateActivityRequest. Path: $.points | LineNumber: 0 …"]
 *
 * plus `"request": ["The request field is required."]`. Neither key is a form field, so both land in
 * the unclaimed-error list and are shown verbatim. Task [47] shipped that to the screen once.
 *
 * The rules below mirror the server's, so a valid form produces a valid request. The server stays
 * the authority — anything it still rejects is rendered through `fieldError` as before — but the
 * two shapes that produce *unpresentable* errors are now unreachable.
 */

/** The server's cap, from `CleanTextAttribute` on the request DTO. */
export const MAX_TITLE_LENGTH = 80

export type ChoreDraft = { title: string; points: string }
export type ChoreErrors = { title?: string; points?: string }

export function validateChore({ title, points }: ChoreDraft): ChoreErrors {
  const errors: ChoreErrors = {}

  /**
   * Trimmed before testing, matching `TextInput.Normalize` server-side (handover §4.11): a title of
   * only spaces is blank, not 3 characters long.
   */
  const trimmed = title.trim()
  if (trimmed.length === 0) {
    errors.title = 'Give the chore a name.'
  } else if (trimmed.length > MAX_TITLE_LENGTH) {
    errors.title = `Keep it to ${MAX_TITLE_LENGTH} characters or fewer.`
  }

  const raw = points.trim()
  if (raw.length === 0) {
    errors.points = 'Give the chore a point value.'
  } else {
    const value = Number(raw)
    if (!Number.isFinite(value)) {
      errors.points = 'Points must be a number.'
    } else if (!Number.isInteger(value)) {
      // The column is an `int`; a decimal would be truncated silently or rejected obscurely.
      errors.points = 'Points must be a whole number.'
    } else if (value < 1) {
      // Matches the server's `[Range(1, int.MaxValue)]`.
      errors.points = 'Points must be at least 1.'
    }
  }

  return errors
}

export function hasErrors(errors: ChoreErrors): boolean {
  return Object.keys(errors).length > 0
}
