import { describe, expect, it } from 'vitest'
import { describePrize, describeWin } from './lootBoxCopy'
import type { OpenLootBoxResult } from './lootBoxApi'

const coins = (overrides: Partial<OpenLootBoxResult> = {}): OpenLootBoxResult => ({
  competitionId: 453,
  result: 'coins',
  coinsAwarded: 22,
  reward: null,
  ...overrides,
})

const bonus = (overrides: Partial<OpenLootBoxResult> = {}): OpenLootBoxResult => ({
  competitionId: 55,
  result: 'bonusReward',
  // `int?` server-side, so this really is null rather than 0 — `LootBoxDtos.cs`.
  coinsAwarded: null,
  reward: { id: 7, title: 'Foot massage' },
  ...overrides,
})

describe('describeWin', () => {
  it.each([
    ['Daily', /the daily duel/i],
    ['Weekly', /the week/i],
    ['Monthly', /the month/i],
  ] as const)('names the %s period', (periodType, expected) => {
    expect(describeWin(periodType, false)).toMatch(expected)
  })

  /**
   * A win-win is one prize received by both (log `025`). Claiming the win outright would take
   * credit for a draw the partner also earned.
   */
  it('says both of you on a win-win, and not on a solo win', () => {
    expect(describeWin('Daily', true)).toMatch(/both/i)
    expect(describeWin('Daily', false)).not.toMatch(/both/i)
  })

  /** No dates anywhere: the payload has none, and period instants are local-midnight UTC. */
  it.each(['Daily', 'Weekly', 'Monthly'] as const)('claims no date for %s', (periodType) => {
    for (const winWin of [true, false]) {
      expect(describeWin(periodType, winWin)).not.toMatch(/today|yesterday|\d/i)
    }
  })
})

describe('describePrize', () => {
  it('reads the Coin amount from the response', () => {
    const prize = describePrize(coins({ coinsAwarded: 22 }))
    expect(prize.kind).toBe('coins')
    expect(prize.headline).toBe('+22 Coins')
  })

  it('names the bonus reward and says it is already claimed', () => {
    const prize = describePrize(bonus())
    expect(prize.kind).toBe('reward')
    expect(prize.headline).toBe('Foot massage')
    // Opening a bonus box writes a zero-cost redemption; without saying so, the obvious next move
    // is to go to the Store and try to buy the thing you just won.
    expect(prize.detail).toMatch(/no coins needed/i)
  })

  /**
   * **The discriminator is `result`.** Both payload fields are nullable, so the kind is answerable
   * from the shape too — and that second answer is not the contract. These two cases are the ones
   * that fail against a component sniffing `coinsAwarded !== null`.
   */
  it('trusts result over the shape: a bonus payload carrying coins still reads as the reward', () => {
    expect(describePrize(bonus({ coinsAwarded: 22 })).kind).toBe('reward')
  })

  it('trusts result over the shape: a coins payload carrying a reward still reads as Coins', () => {
    const prize = describePrize(coins({ reward: { id: 7, title: 'Foot massage' } }))
    expect(prize.kind).toBe('coins')
    expect(prize.headline).toBe('+22 Coins')
  })

  /** Defensive, and honest about it: the server should never send this, and 0 beats "+null Coins". */
  it('survives a coins result with no amount', () => {
    expect(describePrize(coins({ coinsAwarded: null })).headline).toBe('+0 Coins')
  })
})
