import { describe, expect, it } from 'vitest'
import { MAX_TITLE_LENGTH, hasErrors, validateChore, MAX_INT } from './choreValidation'

/**
 * These rules exist because of a defect that reached the screen: an empty points box was encoded as
 * `points: null`, which fails **JSON deserialisation** rather than model validation, and the server
 * answers with its own type name — `"The JSON value could not be converted to
 * API.Dtos.Activities.CreateActivityRequest…"` — plus `"request": ["The request field is required."]`.
 * Neither key is a form field, so both were shown to the user verbatim.
 *
 * Every case below is therefore a payload that must **never leave the client**.
 */

const valid = { title: 'Water the plants', points: '8' }

describe('a valid draft', () => {
  it('produces no errors', () => {
    expect(validateChore(valid)).toEqual({})
    expect(hasErrors(validateChore(valid))).toBe(false)
  })

  it.each(['1', '10', '999', '2147483647'])('accepts %s points', (points) => {
    expect(validateChore({ ...valid, points }).points).toBeUndefined()
  })

  it('accepts a title at exactly the limit', () => {
    expect(validateChore({ ...valid, title: 'a'.repeat(MAX_TITLE_LENGTH) }).title).toBeUndefined()
  })

  it('accepts surrounding whitespace, which the server trims anyway', () => {
    expect(validateChore({ title: '  Water the plants  ', points: ' 8 ' })).toEqual({})
  })
})

describe('the title', () => {
  it.each([
    ['empty', ''],
    ['only spaces', '   '],
    ['only a tab', '\t'],
  ])('is rejected when %s', (_name, title) => {
    // Trimmed before measuring, matching `TextInput.Normalize` server-side: three spaces is blank,
    // not three characters.
    expect(validateChore({ ...valid, title }).title).toBeTruthy()
  })

  it('is rejected one character past the limit', () => {
    expect(validateChore({ ...valid, title: 'a'.repeat(MAX_TITLE_LENGTH + 1) }).title).toBeTruthy()
  })

  it('measures the trimmed length, not the raw length', () => {
    // 80 characters plus padding is still 80 characters to the server.
    const padded = `  ${'a'.repeat(MAX_TITLE_LENGTH)}  `
    expect(validateChore({ ...valid, title: padded }).title).toBeUndefined()
  })
})

describe('the points', () => {
  /** The exact input that produced the defect. */
  it('rejects an empty box rather than sending null', () => {
    const errors = validateChore({ ...valid, points: '' })
    expect(errors.points).toBeTruthy()
    expect(errors.points).toMatch(/point value/i)
  })

  it('rejects whitespace only', () => {
    expect(validateChore({ ...valid, points: '   ' }).points).toBeTruthy()
  })

  it.each([
    ['zero', '0'],
    ['negative', '-5'],
  ])('rejects %s, matching the server range of 1 and up', (_name, points) => {
    expect(validateChore({ ...valid, points }).points).toBeTruthy()
  })

  it.each([
    ['a decimal', '2.5'],
    ['a word', 'ten'],
    ['a partial number', '1e'],
  ])('rejects %s', (_name, points) => {
    expect(validateChore({ ...valid, points }).points).toBeTruthy()
  })

  it('rejects Infinity, which Number() happily produces', () => {
    expect(validateChore({ ...valid, points: 'Infinity' }).points).toBeTruthy()
  })

  it('distinguishes "not a number" from "too small"', () => {
    // Both directions: a validator returning one message for everything would pass each case above.
    const notANumber = validateChore({ ...valid, points: 'ten' }).points
    const tooSmall = validateChore({ ...valid, points: '0' }).points
    expect(notANumber).not.toBe(tooSmall)
  })
})

describe('both fields at once', () => {
  it('reports each independently', () => {
    const errors = validateChore({ title: '', points: '' })
    expect(errors.title).toBeTruthy()
    expect(errors.points).toBeTruthy()
    expect(hasErrors(errors)).toBe(true)
  })

  // The other direction — a validator that always reported both would pass the case above.
  it('reports only the field that is wrong', () => {
    expect(validateChore({ title: 'Fine', points: '' }).title).toBeUndefined()
    expect(validateChore({ title: '', points: '5' }).points).toBeUndefined()
  })
})

/**
 * The **upper** end of `[Range(1, int.MaxValue)]`, which this file mirrored only the bottom half of.
 *
 * A value above the range never reaches model validation: it overflows a .NET `int` during JSON
 * deserialisation, and the reply names the DTO type — the same leak [47] removed from the
 * `points: null` path and left open on this one. So the assertion that matters is not the message,
 * it is that a request is never sent; that half lives in the component test.
 */
describe('a points beyond int range', () => {
  it('is accepted exactly at int.MaxValue, because the server accepts it', () => {
    expect(validateChore({ title: 'Dishes', points: String(MAX_INT) }).points).toBeUndefined()
  })

  it('is rejected one past it', () => {
    expect(validateChore({ title: 'Dishes', points: String(MAX_INT + 1) }).points).toBeDefined()
  })

  it('is rejected for a value far beyond it — the probe that found this', () => {
    expect(validateChore({ title: 'Dishes', points: '99999999999' }).points).toBeDefined()
  })

  it('never names the DTO, the JSON path or the raw bound', () => {
    const message = validateChore({ title: 'Dishes', points: '99999999999' }).points ?? ''
    expect(message).not.toMatch(/API\.Dtos|\$\.|2147483647|JSON/i)
  })

  it('is 2147483647, matching int.MaxValue', () => {
    expect(MAX_INT).toBe(2147483647)
  })
})
