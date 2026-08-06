import { describe, expect, it } from 'vitest'
import {
  checkPassword,
  isPasswordAcceptable,
  PASSWORD_MIN_LENGTH,
  PASSWORD_RULES,
  validateEmail,
  validateName,
} from './passwordPolicy'

/**
 * These pin what the **running API** does, not what ASP.NET Identity does by default. The two
 * differ, and the difference is the whole reason this file exists.
 *
 * Each literal below was captured from a probe against `POST /api/auth/register`. Anything asserted
 * here that the server disagrees with is a client that refuses passwords the account could use —
 * which no server response would ever contradict, so nothing else would catch it.
 */

describe('the mirrored rules match the probed server', () => {
  /**
   * The one most likely to be "fixed" into wrongness. Identity's default
   * `RequireNonAlphanumeric = true` is switched off here, and `Aaaaaaa1` was a **201**.
   */
  it('does NOT require a symbol', () => {
    expect(isPasswordAcceptable('Aaaaaaa1')).toBe(true)
    expect(PASSWORD_RULES.some((r) => /symbol|special|punctuation/i.test(r.label))).toBe(false)
  })

  it('does not require unique characters beyond the four rules', () => {
    // `Aaaaaaa1aaaaaa` was also a 201 — repetition is not a rejection.
    expect(isPasswordAcceptable('Aaaaaaa1aaaaaa')).toBe(true)
  })

  it.each([
    ['too short', 'Aa1', ['length']],
    ['no digit and no uppercase', 'aaaaaaaa', ['upper', 'digit']],
    ['no lowercase', 'AAAAAAA1', ['lower']],
    ['no digit', 'Aaaaaaaa', ['digit']],
  ])('reports exactly which rules %s breaks', (_case, password, expectedUnmet) => {
    const unmet = checkPassword(password)
      .filter((r) => !r.met)
      .map((r) => r.id)
    expect(unmet.sort()).toEqual([...expectedUnmet].sort())
  })

  it('accepts the password the project uses for its own test accounts', () => {
    expect(isPasswordAcceptable('Passw0rd!23')).toBe(true)
  })

  it('is 8, matching the DTO', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8)
    expect(isPasswordAcceptable('Aaaaaa1')).toBe(false)
    expect(isPasswordAcceptable('Aaaaaaa1')).toBe(true)
  })

  /** Four rules, and the screen has to be able to list all of them. */
  it('exposes every rule with a label', () => {
    expect(PASSWORD_RULES).toHaveLength(4)
    for (const rule of PASSWORD_RULES) expect(rule.label.length).toBeGreaterThan(0)
  })
})

describe('the email check stays loose on purpose', () => {
  it.each(['a@b.co', 'first.last+tag@sub.domain.example', "o'brien@example.com"])(
    'accepts %s',
    (email) => expect(validateEmail(email)).toBeUndefined(),
  )

  it.each(['', '   ', 'nobody', 'nobody@', '@example.com', 'a b@example.com', 'a@b'])(
    'rejects %s',
    (email) => expect(validateEmail(email)).toBeDefined(),
  )

  it('never names a regex or a .NET attribute', () => {
    expect(validateEmail('nope')).not.toMatch(/EmailAddress|regex|pattern|field/i)
  })
})

describe('the name check', () => {
  it('rejects blank and whitespace-only', () => {
    expect(validateName('')).toBe('Enter your name.')
    expect(validateName('   ')).toBe('Enter your name.')
  })

  /** 60, not the 80 used for chores and rewards — the server's `[CleanText(60)]`. */
  it('caps at 60, measuring the trimmed length', () => {
    expect(validateName('a'.repeat(60))).toBeUndefined()
    expect(validateName(`  ${'a'.repeat(60)}  `)).toBeUndefined()
    expect(validateName('a'.repeat(61))).toBeDefined()
  })
})
