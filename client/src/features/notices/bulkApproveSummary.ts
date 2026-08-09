import type { BulkApproveResult } from '../activity/activityApi'

/**
 * What to say after a bulk approve.
 *
 * **The count comes from the response, never from the request.** `POST /api/activity-logs/bulk-approve`
 * returns HTTP 200 whether it approved everything, some, or nothing — the detail is in `skipped`,
 * which `api-design.md` does not mention. Reporting "Approved 3" because three ids were sent is a
 * guess, and it is wrong in the most ordinary case there is: the partner dealt with one of them on
 * their own device a moment earlier.
 *
 * `NotPending` therefore gets its own wording. It does not mean an error — it means *someone already
 * handled this*, which in a two-person app is information the user wants rather than a failure.
 */

const NOT_PENDING = 'NotPending'

function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

export function summariseBulkApprove({ approved, skipped }: BulkApproveResult): string {
  const alreadyHandled = skipped.filter((s) => s.reason === NOT_PENDING).length
  const otherwiseSkipped = skipped.length - alreadyHandled

  const parts: string[] = []

  if (approved.length > 0) {
    parts.push(`Approved ${plural(approved.length, 'chore')}.`)
  }

  if (alreadyHandled > 0) {
    parts.push(
      approved.length > 0
        ? `${plural(alreadyHandled, 'other')} had already been dealt with.`
        : `${plural(alreadyHandled, 'chore')} had already been dealt with.`,
    )
  }

  if (otherwiseSkipped > 0) {
    // `LogNotFound` and anything the server adds later. Vague on purpose: the reason codes are the
    // server's vocabulary, not the user's.
    parts.push(`${plural(otherwiseSkipped, 'chore')} could not be approved.`)
  }

  // Reachable only if the server returns two empty arrays, which the 400 on an empty `ids` should
  // prevent — but a silent "" would be worse than an honest shrug.
  return parts.length > 0 ? parts.join(' ') : 'Nothing changed.'
}
