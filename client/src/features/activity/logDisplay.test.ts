import { describe, expect, it } from 'vitest'
import { describeLogPoints, relativeTime } from './logDisplay'

describe('describeLogPoints', () => {
  /**
   * The finding this function exists for: `pointsAwarded` is what the chore was **worth**, not what
   * was earned. It is populated on Pending rows (not credited yet) and Rejected rows (never will
   * be) — measured in [46], a rejected "Clean the kitchen bench" still reports 5.
   */
  it('credits an approved log', () => {
    expect(describeLogPoints('Approved', 10)).toEqual({
      text: '+10 pts',
      tone: 'approved',
      label: 'Approved',
    })
  })

  it('makes a pending log conditional, not a credit', () => {
    const display = describeLogPoints('Pending', 25)
    expect(display.tone).toBe('pending')
    expect(display.text).toContain('25')
    // The number is present but qualified — "+25 pts" would claim a balance the user does not have.
    expect(display.text).not.toBe('+25 pts')
    expect(display.text).toMatch(/if approved/i)
  })

  it('shows no figure at all for a rejected log', () => {
    const display = describeLogPoints('Rejected', 5)
    expect(display.tone).toBe('rejected')
    // Any number here reads as a credit for points that will never be awarded.
    expect(display.text).not.toContain('5')
    expect(display.text).toMatch(/no points/i)
  })

  /**
   * Both directions: a formatter that always returned the "pending" wording would pass the pending
   * case on its own. The three must be mutually distinguishable.
   */
  it('renders the three statuses differently from one another', () => {
    const texts = (['Approved', 'Pending', 'Rejected'] as const).map(
      (status) => describeLogPoints(status, 10).text,
    )
    expect(new Set(texts).size).toBe(3)
  })

  it('never prefixes a plus except when the points were actually awarded', () => {
    expect(describeLogPoints('Pending', 10).text.startsWith('+')).toBe(false)
    expect(describeLogPoints('Rejected', 10).text.startsWith('+')).toBe(false)
    expect(describeLogPoints('Approved', 10).text.startsWith('+')).toBe(true)
  })

  it('handles a zero-point chore without a stray sign', () => {
    expect(describeLogPoints('Approved', 0).text).toBe('+0 pts')
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
