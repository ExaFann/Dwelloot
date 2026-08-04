import { describe, expect, it } from 'vitest'
import { MAX_TITLE_LENGTH, hasErrors, validateReward } from './rewardValidation'

/**
 * The mirror of `choreValidation.test.ts`, and for the same reason one DTO along: an empty cost box
 * encoded as `coinCost: null` fails **JSON deserialisation** rather than model validation, and the
 * server answers with its own type name — `"The JSON value could not be converted to
 * API.Dtos.Rewards.CreateRewardRequest…"` — plus `"request": ["The request field is required."]`.
 * Captured from the running API in [51], not assumed from the resemblance to [47].
 *
 * Every case below is a payload that must never leave the client.
 */

const valid = { title: 'Breakfast in bed', coinCost: '30' }

describe('a valid draft', () => {
  it('produces no errors', () => {
    expect(validateReward(valid)).toEqual({})
    expect(hasErrors(validateReward(valid))).toBe(false)
  })

  it.each(['1', '30', '2147483647'])('accepts a cost of %s', (coinCost) => {
    expect(validateReward({ ...valid, coinCost }).coinCost).toBeUndefined()
  })

  it('accepts a title at exactly the limit', () => {
    expect(validateReward({ ...valid, title: 'a'.repeat(MAX_TITLE_LENGTH) }).title).toBeUndefined()
  })

  it('accepts surrounding whitespace, which the server trims anyway', () => {
    expect(validateReward({ title: '  Breakfast in bed  ', coinCost: ' 30 ' })).toEqual({})
  })
})

describe('the title', () => {
  it.each([
    ['empty', ''],
    ['only spaces', '   '],
    ['only a tab', '\t'],
  ])('is rejected when %s', (_name, title) => {
    expect(validateReward({ ...valid, title }).title).toBe('Give the reward a name.')
  })

  /** Both sides of the boundary, so an off-by-one in either direction fails. */
  it('is rejected one character past the limit', () => {
    const errors = validateReward({ ...valid, title: 'a'.repeat(MAX_TITLE_LENGTH + 1) })
    expect(errors.title).toBe(`Keep it to ${MAX_TITLE_LENGTH} characters or fewer.`)
  })

  it('measures the trimmed length, not the typed length', () => {
    // 80 characters of content inside 4 of whitespace: the server would trim it and accept.
    const padded = `  ${'a'.repeat(MAX_TITLE_LENGTH)}  `
    expect(validateReward({ ...valid, title: padded }).title).toBeUndefined()
  })
})

describe('the cost', () => {
  it.each([
    ['empty', ''],
    ['only spaces', '  '],
  ])('is rejected when %s — this is the payload that leaks the DTO name', (_name, coinCost) => {
    expect(validateReward({ ...valid, coinCost }).coinCost).toBe('Say what it costs in Coins.')
  })

  it('rejects text that is not a number', () => {
    expect(validateReward({ ...valid, coinCost: 'lots' }).coinCost).toBe('The cost must be a number.')
  })

  it('rejects a fraction of a Coin', () => {
    expect(validateReward({ ...valid, coinCost: '2.5' }).coinCost).toBe('Coins come in whole numbers.')
  })

  it.each(['0', '-1', '-40'])('rejects %s, matching the server’s Range(1, …)', (coinCost) => {
    expect(validateReward({ ...valid, coinCost }).coinCost).toBe('It has to cost at least 1 Coin.')
  })
})

describe('hasErrors', () => {
  it('reports both fields at once', () => {
    const errors = validateReward({ title: '', coinCost: '' })
    expect(errors.title).toBeDefined()
    expect(errors.coinCost).toBeDefined()
    expect(hasErrors(errors)).toBe(true)
  })
})
