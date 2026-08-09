// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { LIVE_POLL_MS, liveQueryOptions } from './liveSync'

/**
 * These pin the **shape of the answer**, not that a constant equals itself.
 *
 * The behaviour — "a query re-runs every 20s" — belongs to RTK Query, and a test that drove fake
 * timers through a live subscription would be testing the library. What is genuinely this project's
 * decision, and genuinely easy to lose in a later edit, is *which four options* are set together.
 * Each one of them is load-bearing and three of them are silent when missing:
 *
 * - Drop `skipPollingIfUnfocused` and every backgrounded tab keeps hitting the API forever. Nothing
 *   in the UI changes, so nobody notices until a bill or a log volume does.
 * - Drop `refetchOnFocus` and the interval has to cover the whole time since you last looked,
 *   instead of just while you are watching. This is the option doing most of the work.
 * - Drop `refetchOnReconnect` and a phone that slept through a bus ride shows yesterday.
 *
 * Verified in a real browser during this task, which is the part these assertions cannot reach: with
 * the tab reporting `visibilityState: 'hidden'`, **57 seconds produced zero polls** — the skip
 * working exactly as intended.
 */

describe('the live-sync options', () => {
  it('polls on an interval', () => {
    expect(liveQueryOptions.pollingInterval).toBe(LIVE_POLL_MS)
  })

  /**
   * A backgrounded tab must go quiet. This is the difference between polling and a background job
   * nobody asked for, and its absence is invisible in the UI.
   */
  it('stops entirely when the tab is not being looked at', () => {
    expect(liveQueryOptions.skipPollingIfUnfocused).toBe(true)
  })

  it('refreshes on focus and on reconnect, so the interval only covers time spent watching', () => {
    expect(liveQueryOptions.refetchOnFocus).toBe(true)
    expect(liveQueryOptions.refetchOnReconnect).toBe(true)
  })

  /**
   * A bound, not an exact value — the number is a judgement call and should be free to change. What
   * must not happen silently is someone "improving responsiveness" into a request every second for
   * an app where the thing being awaited takes minutes.
   */
  it('keeps the interval in a range that suits two people doing chores', () => {
    expect(LIVE_POLL_MS).toBeGreaterThanOrEqual(10_000)
    expect(LIVE_POLL_MS).toBeLessThanOrEqual(60_000)
  })
})
