import { describe, expect, it } from 'vitest'
import { STATUS_LABEL, choresForPeriod, relativeTime } from './logDisplay'

/**
 * `describeLogPoints`'s tests lived here and pinned `+10 pts` / `25 pts if approved` / `No points`.
 * That notation was retired by [83] and its last consumer removed by [84]; an audit found the
 * function and these assertions still standing — a tested definition of something the app no
 * longer renders, which is the exact duplication [84] set out to end. The **rule** survives, in
 * `ChoreCredit`, tested against the surfaces that show it.
 *
 * What is left here is the word, and it is worth its own test for one reason: it is spoken aloud.
 */
describe('STATUS_LABEL', () => {
  it('names every status, and never leaks the API spelling', () => {
    // "Pending" is the server's word; "Waiting" is the app's. The mapping is the whole point.
    expect(STATUS_LABEL.Pending).toBe('Waiting')
    expect(STATUS_LABEL.Approved).toBe('Approved')
    expect(STATUS_LABEL.Rejected).toBe('Rejected')
  })

  /**
   * Both directions: a map that returned one label for everything would pass a spot check. These
   * words are the *only* status a screen reader gets — the dot is `aria-hidden` and a
   * strikethrough is silent — so two statuses sharing a label would be two states it cannot tell
   * apart.
   */
  it('gives the three statuses three different words', () => {
    expect(new Set(Object.values(STATUS_LABEL)).size).toBe(3)
  })
})

describe('relativeTime', () => {
  // Fixed, so the test pins behaviour rather than racing the clock.
  const now = new Date('2026-08-03T12:00:00Z')
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString()

  it.each([
    ['0 seconds', 0, 'Just now'],
    ['30 seconds', 30_000, 'Just now'],
    ['1 minute', 60_000, '1 min ago'],
    ['12 minutes', 12 * 60_000, '12 min ago'],
    ['59 minutes', 59 * 60_000, '59 min ago'],
    ['1 hour', 3_600_000, '1 h ago'],
    ['5 hours', 5 * 3_600_000, '5 h ago'],
    ['23 hours', 23 * 3_600_000, '23 h ago'],
    ['25 hours', 25 * 3_600_000, 'Yesterday'],
  ])('%s → %s', (_name, elapsed, expected) => {
    expect(relativeTime(ago(elapsed), now)).toBe(expected)
  })

  it('falls back to a date beyond two days', () => {
    const result = relativeTime(ago(5 * 24 * 3_600_000), now)
    expect(result).not.toMatch(/ago|yesterday|just now/i)
    expect(result).toMatch(/\d/)
  })

  /** Server and browser clocks disagree by a second or two; a fresh log must not read as negative. */
  it('does not produce a negative for a timestamp slightly in the future', () => {
    const future = new Date(now.getTime() + 2_000).toISOString()
    expect(relativeTime(future, now)).toBe('Just now')
  })

  /**
   * The timezone trap from log `045`, in its second form. A chore logged at 22:30 NZ on 3 August is
   * `2026-08-03T10:30:00Z`; one logged at 01:00 NZ on 4 August is `2026-08-03T13:00:00Z` — the
   * *same* UTC date. Any ISO-slicing formatter would call both "3 August". Relative output must not
   * depend on UTC calendar days at all.
   */
  it('reports elapsed time, not a UTC calendar difference', () => {
    const evening = '2026-08-03T10:30:00Z'
    const nextMorningNz = new Date('2026-08-03T13:00:00Z')
    // 2.5 hours apart, and on different local days — the answer must be about elapsed time.
    expect(relativeTime(evening, nextMorningNz)).toBe('2 h ago')
  })
})

describe('choresForPeriod', () => {
  /**
   * The bug: at a day boundary the scores reset to 0–0 while the chore columns still listed
   * yesterday's approved chores. Measured live — 0–0 for the day against 120–5 for the week, with
   * nine stale rows under the avatars.
   *
   * `periodStart` is a UTC instant at *local* midnight, so this compares instants. Every fixture
   * below straddles that boundary rather than sitting a whole day either side of it, because a
   * comparison that only works on obviously-distant dates is not testing the boundary.
   */
  const START = '2026-08-05T12:00:00Z'
  const log = (id: number, status: 'Approved' | 'Pending' | 'Rejected', completedAt: string) => ({
    id,
    status,
    completedAt,
  })

  it('keeps everything logged inside the period, whatever its status', () => {
    const logs = [
      log(1, 'Approved', '2026-08-05T20:00:00Z'),
      log(2, 'Pending', '2026-08-05T13:00:00Z'),
      log(3, 'Rejected', '2026-08-06T01:00:00Z'),
    ]
    expect(choresForPeriod(logs, START).map((l) => l.id)).toEqual([1, 2, 3])
  })

  it('clears approved and rejected chores from before it — the duel they belong to is over', () => {
    const logs = [
      log(1, 'Approved', '2026-08-05T09:00:00Z'),
      log(2, 'Rejected', '2026-08-04T22:00:00Z'),
    ]
    expect(choresForPeriod(logs, START)).toEqual([])
  })

  /** The one exception, and the reason it exists: a pending chore is the thing still to act on. */
  it('keeps a pending chore however old it is', () => {
    const logs = [log(1, 'Pending', '2026-07-01T09:00:00Z')]
    expect(choresForPeriod(logs, START).map((l) => l.id)).toEqual([1])
  })

  /** Exactly on the boundary is inside the new period, not the old one. */
  it('treats the boundary instant as inside', () => {
    expect(choresForPeriod([log(1, 'Approved', START)], START).map((l) => l.id)).toEqual([1])
  })

  it('shows everything when there is no period to clear against', () => {
    const logs = [log(1, 'Approved', '2026-01-01T00:00:00Z')]
    expect(choresForPeriod(logs, undefined)).toHaveLength(1)
    expect(choresForPeriod(logs, 'not-a-date')).toHaveLength(1)
  })

  it('does not mutate what it was given', () => {
    const logs = [log(1, 'Approved', '2026-08-04T09:00:00Z')]
    choresForPeriod(logs, START)
    expect(logs).toHaveLength(1)
  })
})
