import { describe, expect, it } from 'vitest'
import { MAX_NAME_LENGTH, validateHouseholdName } from './householdValidation'

/**
 * The cap here is **60**, not the 80 chores and rewards use. Copying the 80 across would have let
 * through a name the server rejects — the server's own message names 60, and both sides of the
 * boundary were checked live in [54].
 */

describe('a valid name', () => {
  it('passes', () => {
    expect(validateHouseholdName('Duel House')).toBeUndefined()
  })

  it('accepts exactly the limit', () => {
    expect(validateHouseholdName('a'.repeat(MAX_NAME_LENGTH))).toBeUndefined()
  })

  it('accepts surrounding whitespace, which the server trims anyway', () => {
    expect(validateHouseholdName('  Duel House  ')).toBeUndefined()
  })
})

describe('an invalid name', () => {
  it.each([
    ['empty', ''],
    ['only spaces', '   '],
    ['only a tab', '\t'],
  ])('is rejected when %s', (_name, value) => {
    expect(validateHouseholdName(value)).toBe('Give your household a name.')
  })

  it('is rejected one character past the limit', () => {
    expect(validateHouseholdName('a'.repeat(MAX_NAME_LENGTH + 1))).toBe(
      `Keep it to ${MAX_NAME_LENGTH} characters or fewer.`,
    )
  })

  /** The trimmed length is what the server measures, so it is what this measures. */
  it('measures the trimmed length, not the typed length', () => {
    expect(validateHouseholdName(`  ${'a'.repeat(MAX_NAME_LENGTH)}  `)).toBeUndefined()
  })

  /** The cap is this project's shortest; a test that passed at 80 would not be testing it. */
  it('is 60, not the 80 chores and rewards use', () => {
    expect(MAX_NAME_LENGTH).toBe(60)
    expect(validateHouseholdName('a'.repeat(80))).toBeDefined()
  })
})
