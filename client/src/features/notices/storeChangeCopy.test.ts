import { describe, expect, it } from 'vitest'
import { describeChange } from './storeChangeCopy'
import type { RewardChange } from '../reward/rewardChangeApi'

/**
 * The user is being asked to **agree to something**, so the sentence has to be right about what
 * would happen. Getting it wrong here is worse than a layout bug: they would be consenting to a
 * change other than the one described.
 */

function change(over: Partial<RewardChange> = {}): RewardChange {
  return {
    id: 1,
    kind: 'Update',
    rewardId: 5,
    currentTitle: 'Foot massage',
    currentCoinCost: 40,
    proposedTitle: null,
    proposedCoinCost: null,
    requestedByName: 'Sam',
    requestedAt: '2026-08-07T09:00:00Z',
    ...over,
  }
}

describe('a price change', () => {
  /**
   * **Both numbers, not just the new one.** "Change the price to 5 Coins" hides whether that is a
   * rise or a cut — and a cut before a purchase is the exact abuse this whole queue exists to stop.
   * The one number a partner most needs is the one being moved away from.
   */
  it('names the old price as well as the new one', () => {
    const text = describeChange(change({ proposedCoinCost: 5 }))
    expect(text).toContain('40')
    expect(text).toContain('5')
  })

  it('names the reward it applies to', () => {
    expect(describeChange(change({ proposedCoinCost: 5 }))).toContain('Foot massage')
  })
})

describe('a rename', () => {
  it('says what it would become', () => {
    const text = describeChange(change({ proposedTitle: 'Back rub' }))
    expect(text).toContain('Back rub')
    expect(text).toContain('Foot massage')
  })

  /** Both at once must mention both, not silently describe one. */
  it('describes a rename and a re-price together', () => {
    const text = describeChange(change({ proposedTitle: 'Back rub', proposedCoinCost: 5 }))
    expect(text).toContain('Back rub')
    expect(text).toContain('5')
    expect(text).toContain('40')
  })
})

describe('the discriminator is the kind, never the payload', () => {
  /**
   * A rename and a re-price both arrive as `Update` with one field set, so reading the fields to
   * guess the intent misdescribes anything that touches both. The same rule [53] applies to loot
   * box prizes: `result` is the contract and the nullable fields are not.
   */
  it('describes a create from its own fields', () => {
    const text = describeChange(
      change({
        kind: 'Create',
        rewardId: null,
        currentTitle: null,
        currentCoinCost: null,
        proposedTitle: 'Breakfast in bed',
        proposedCoinCost: 30,
      }),
    )
    expect(text).toMatch(/add/i)
    expect(text).toContain('Breakfast in bed')
    expect(text).toContain('30')
  })

  /**
   * A delete carries **no** proposed values — so a description built by inspecting which fields are
   * non-null would say nothing at all, or worse, fall through to the update wording.
   */
  it('describes a delete even though it proposes nothing', () => {
    const text = describeChange(
      change({ kind: 'Delete', proposedTitle: null, proposedCoinCost: null }),
    )
    expect(text).toMatch(/remove/i)
    expect(text).toContain('Foot massage')
    expect(text).not.toMatch(/price/i)
  })

  /** A create and a delete must not read alike. */
  it('tells create and delete apart', () => {
    const created = describeChange(
      change({
        kind: 'Create',
        rewardId: null,
        currentTitle: null,
        proposedTitle: 'X',
        proposedCoinCost: 1,
      }),
    )
    const deleted = describeChange(change({ kind: 'Delete' }))
    expect(created).not.toEqual(deleted)
  })
})

describe('edge cases that would otherwise render an empty sentence', () => {
  /** A patch asking for the values it already has is legal and says nothing. */
  it('does not produce a dangling “For X:” when nothing actually changes', () => {
    const text = describeChange(change({ proposedTitle: 'Foot massage', proposedCoinCost: 40 }))
    expect(text).not.toMatch(/:\s*$/)
    expect(text).toContain('Foot massage')
  })

  it('never renders a bare null or undefined', () => {
    for (const kind of ['Create', 'Update', 'Delete'] as const) {
      const text = describeChange(change({ kind, rewardId: kind === 'Create' ? null : 5 }))
      expect(text).not.toMatch(/null|undefined|NaN/)
    }
  })
})
