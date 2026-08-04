import { describe, expect, it } from 'vitest'
import { describeBadge, describeProgress } from './badgeDisplay'
import type { Badge } from './badgeApi'

/** Rows captured from the running API in [54]. */
const UNLOCKED: Badge = {
  id: 1,
  name: 'First chore',
  criteria: 'Get your first logged chore approved.',
  unlocked: true,
  unlockedAt: '2026-08-05T09:00:00Z',
}

const LOCKED: Badge = {
  id: 2,
  name: '3-day win streak',
  criteria: 'Win the daily duel three days in a row.',
  unlocked: false,
  unlockedAt: null,
}

const NOW = new Date('2026-08-05T12:00:00Z')

describe('an unlocked badge', () => {
  it('says so in a word, not only a colour', () => {
    expect(describeBadge(UNLOCKED, NOW).status).toBe('Unlocked')
  })

  it('says when it was earned', () => {
    expect(describeBadge(UNLOCKED, NOW).detail).toBe('Earned 3 h ago')
  })

  /**
   * `unlocked` and `unlockedAt` are separate fields, so this combination is expressible even though
   * the server should never send it. Without the branch the detail line would read "Earned null".
   */
  it('still says something with no timestamp', () => {
    expect(describeBadge({ ...UNLOCKED, unlockedAt: null }, NOW).detail).toBe('Earned')
  })
})

describe('a locked badge', () => {
  it('says so in a word', () => {
    expect(describeBadge(LOCKED, NOW).status).toBe('Locked')
  })

  /**
   * Straight from the response. Log `027` recorded this as [54]'s obligation: log `026` pins the
   * unlock thresholds against this same seeded text, so a local copy would be free to drift from
   * the rule that actually fires.
   */
  it('shows the server’s criteria as the thing to do', () => {
    expect(describeBadge(LOCKED, NOW).detail).toBe('Win the daily duel three days in a row.')
  })

  it('never shows an unlock time', () => {
    expect(describeBadge(LOCKED, NOW).detail).not.toMatch(/earned/i)
  })
})

describe('describeProgress', () => {
  it('counts the unlocked ones', () => {
    expect(describeProgress([UNLOCKED, LOCKED, LOCKED])).toBe('1 of 3 unlocked')
  })

  it('handles none and all', () => {
    expect(describeProgress([LOCKED, LOCKED])).toBe('0 of 2 unlocked')
    expect(describeProgress([UNLOCKED, UNLOCKED])).toBe('2 of 2 unlocked')
  })

  /**
   * **Both numbers come from the list**, so a seventh seeded badge appears with no client change —
   * which is exactly what log `027` built the endpoint to allow. A hard-coded 6 passes every test
   * above; only a list of a different length catches it.
   */
  it('does not assume six', () => {
    expect(describeProgress([UNLOCKED])).toBe('1 of 1 unlocked')
    expect(describeProgress(Array(9).fill(LOCKED) as Badge[])).toBe('0 of 9 unlocked')
  })
})
