import { describe, expect, it } from 'vitest'
import { initialsOf, motifOf } from './avatarIdentity'

/**
 * The two derivations behind the generated avatar. Pure, so they are tested as a table — and they
 * are what makes the mark stable without any storage.
 */

describe('initialsOf', () => {
  it.each([
    ['Alex Kirk', 'AK'],
    ['Sam', 'S'],
    ['alex kirk', 'AK'],
    ['  Alex   Kirk  ', 'AK'],
    ['Mary Jane Watson', 'MW'],
  ])('%o → %o', (name, expected) => {
    expect(initialsOf(name)).toBe(expected)
  })

  it('takes the first and last word, not the first two', () => {
    // A middle name must not displace the surname.
    expect(initialsOf('Mary Jane Watson')).toBe('MW')
  })

  it.each([
    ['', '?'],
    ['   ', '?'],
  ])('falls back for %o rather than rendering nothing', (name, expected) => {
    expect(initialsOf(name)).toBe(expected)
  })

  /**
   * `name` is user-supplied and the backend stores text verbatim (handover §4.11), so an emoji or
   * an astral-plane character is reachable. `name[0]` would slice a surrogate pair in half and emit
   * a replacement character.
   */
  it('does not split an astral-plane character', () => {
    expect(initialsOf('🦊 Fox')).toBe('🦊F')
    expect(initialsOf('𝒜lice')).toBe('𝒜')
  })
})

describe('motifOf', () => {
  it('is stable for the same id', () => {
    // The whole point: derived, never stored, so it must not drift between calls or sessions.
    expect(motifOf(42)).toBe(motifOf(42))
  })

  it('spreads ids across all four motifs', () => {
    const seen = new Set([0, 1, 2, 3, 4, 5, 6, 7].map(motifOf))
    expect(seen.size).toBe(4)
  })

  it.each([0, 1, 7, 42, 12345, 999999])('stays in range for %i', (id) => {
    const motif = motifOf(id)
    expect(motif).toBeGreaterThanOrEqual(0)
    expect(motif).toBeLessThan(4)
  })

  // Ids come from the server and should always be positive, but an out-of-range index would be an
  // undefined class name — a silent styling failure rather than an error.
  it.each([-1, -42, 3.7])('stays in range for the implausible input %o', (id) => {
    const motif = motifOf(id)
    expect(Number.isInteger(motif)).toBe(true)
    expect(motif).toBeGreaterThanOrEqual(0)
    expect(motif).toBeLessThan(4)
  })

  it('gives two partners with the same initial different motifs', () => {
    // Colour is by role and initials can collide, so the motif is the only thing left to tell
    // "Sam Alder" from "Sam Bright".
    expect(motifOf(7)).not.toBe(motifOf(8))
  })
})
