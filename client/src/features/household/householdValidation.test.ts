import { describe, expect, it } from 'vitest'
import {
  INVITE_CODE_LENGTH,
  MAX_NAME_LENGTH,
  validateHouseholdName,
  validateInviteCode,
} from './householdValidation'

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

/**
 * The invite code is an **exact** length, and the boundary is asserted from both sides.
 *
 * A rule written as "at least 6" would pass every test below that only checked 5 and 6, so 7 is
 * checked too — the server's attribute is `StringLength(6, MinimumLength = 6)` and one-sided client
 * validation would let a 7-character code through to produce the very message this exists to hide.
 */
describe('the invite code', () => {
  it('accepts exactly six characters', () => {
    expect(validateInviteCode('ABC234')).toBeUndefined()
  })

  it('accepts six characters with surrounding whitespace', () => {
    expect(validateInviteCode('  ABC234  ')).toBeUndefined()
  })

  it('asks for a code when the field is empty', () => {
    expect(validateInviteCode('')).toBe('Enter the invite code your partner shared.')
    expect(validateInviteCode('   ')).toBe('Enter the invite code your partner shared.')
  })

  it.each([
    ['too short', 'ABC', 3],
    ['one short', 'ABC23', 5],
    ['one long', 'ABC2345', 7],
  ])('rejects a code that is %s, and counts what was typed', (_case, value, length) => {
    expect(validateInviteCode(value)).toBe(
      `Invite codes are ${INVITE_CODE_LENGTH} characters — this one has ${length}.`,
    )
  })

  /**
   * The message must not read like the server's. Pinned as a property rather than as a string, so
   * rewording the copy is free but reintroducing the .NET sentence is not.
   */
  it('never names the DTO property or the attribute', () => {
    for (const value of ['', 'A', 'ABCDEFG']) {
      const message = validateInviteCode(value) ?? ''
      expect(message).not.toMatch(/InviteCode|minimum length|maximum length|field/i)
    }
  })

  it('is six, matching Household.InviteCodeLength', () => {
    expect(INVITE_CODE_LENGTH).toBe(6)
  })
})
