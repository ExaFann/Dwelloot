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

/**
 * `int.MaxValue`, and the reason it is here rather than left to the server.
 *
 * `[Range(1, int.MaxValue)]` has two ends and this file mirrored only the lower one. A value above
 * the range does not reach model validation at all: it overflows a .NET `int` during **JSON
 * deserialisation**, which answers with
 *
 *     "$.points": ["The JSON value could not be converted to API.Dtos.Activities…"]
 *
 * — byte for byte the leak [47] shipped to a screen once, reached through a different door. The fix
 * there was `points: null`; nobody checked the other end of the same rule.
 *
 * Mirrored exactly rather than capped at something more sensible: the standing rule is that client
 * validation must never refuse a value the server would accept, because no server response would
 * ever contradict it (`passwordPolicy.ts` makes the same argument).
 */
export const MAX_INT = 2147483647

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
      // Matches the server's `[Range(1, int.MaxValue)]`, lower bound.
      errors.points = 'Points must be at least 1.'
    } else if (value > MAX_INT) {
      // The upper bound of the same rule — see `MAX_INT`. Without this the request leaks the DTO.
      errors.points = 'That is more points than a chore can be worth.'
    }
  }

  return errors
}

export function hasErrors(errors: ChoreErrors): boolean {
  return Object.keys(errors).length > 0
}
