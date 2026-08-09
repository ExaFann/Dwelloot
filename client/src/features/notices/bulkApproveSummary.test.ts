import { describe, expect, it } from 'vitest'
import { summariseBulkApprove } from './bulkApproveSummary'

/**
 * `POST /api/activity-logs/bulk-approve` returns **HTTP 200 whatever happens** — the detail is in
 * `skipped`, which `api-design.md` does not document. Every case below is a real response captured
 * from the running API in [48].
 *
 * The property under test is that the count comes from the **response**, never the request.
 */

describe('a clean run', () => {
  it('reports what was approved', () => {
    // Real: two valid pending ids.
    expect(summariseBulkApprove({ approved: [30, 28], skipped: [] })).toBe('Approved 2 chores.')
  })

  it('says "chore", singular, for one', () => {
    expect(summariseBulkApprove({ approved: [30], skipped: [] })).toBe('Approved 1 chore.')
  })
})

describe('the two-device race', () => {
  /**
   * Real: sending the same two ids twice. In a two-person app the partner having already dealt with
   * something on their own device is the ordinary case, not an edge case — so it is reported as
   * information, not as a failure.
   */
  it('reports nothing approved when everything was already handled', () => {
    const summary = summariseBulkApprove({
      approved: [],
      skipped: [
        { id: 30, reason: 'NotPending' },
        { id: 28, reason: 'NotPending' },
      ],
    })
    expect(summary).toMatch(/already been dealt with/i)
    // The assertion that matters: it must not claim two were approved.
    expect(summary).not.toMatch(/approved 2/i)
    expect(summary).not.toMatch(/^Approved/)
  })

  it('reports a partial run honestly', () => {
    const summary = summariseBulkApprove({
      approved: [32],
      skipped: [{ id: 30, reason: 'NotPending' }],
    })
    expect(summary).toContain('Approved 1 chore.')
    expect(summary).toMatch(/1 other had already been dealt with/i)
    // Three ids were sent; only one worked. Claiming three is the bug this file exists to prevent.
    expect(summary).not.toMatch(/approved 2|approved 3/i)
  })
})

describe('other skip reasons', () => {
  /** Real: one valid id plus a nonexistent one. */
  it('mentions a failure without repeating the server vocabulary', () => {
    const summary = summariseBulkApprove({
      approved: [32],
      skipped: [{ id: 999999, reason: 'LogNotFound' }],
    })
    expect(summary).toContain('Approved 1 chore.')
    expect(summary).toMatch(/could not be approved/i)
    // `LogNotFound` is the server's word, not the user's.
    expect(summary).not.toContain('LogNotFound')
  })

  it('separates "already handled" from "could not be approved"', () => {
    const summary = summariseBulkApprove({
      approved: [1],
      skipped: [
        { id: 2, reason: 'NotPending' },
        { id: 3, reason: 'LogNotFound' },
      ],
    })
    expect(summary).toMatch(/already been dealt with/i)
    expect(summary).toMatch(/could not be approved/i)
  })

  it('treats an unknown reason as a failure rather than dropping it', () => {
    // The server may add reason codes; silence would under-report.
    const summary = summariseBulkApprove({
      approved: [],
      skipped: [{ id: 5, reason: 'SomethingNewEntirely' }],
    })
    expect(summary).toMatch(/could not be approved/i)
  })
})

describe('the degenerate case', () => {
  /** The 400 on an empty `ids` should prevent this, but silence would be worse than a shrug. */
  it('never returns an empty string', () => {
    expect(summariseBulkApprove({ approved: [], skipped: [] })).toBeTruthy()
  })
})
