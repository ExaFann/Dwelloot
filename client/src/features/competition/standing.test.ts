import { describe, expect, it } from 'vitest'
import { describeStanding, periodLabel, tugShares } from './standing'

/**
 * The rules, as a table. Every state is its own case with a literal expectation, and the two
 * directions of every asymmetric rule are separate assertions — a function that ignored its inputs
 * and always said "leading" would pass a one-sided test.
 */

const live = { settled: false, voided: false }
const withPartner = { hasPartner: true }

describe('no partner', () => {
  it('is not a contest, whatever the points say', () => {
    expect(describeStanding({ myPoints: 0, partnerPoints: 0, ...live }, { hasPartner: false })).toEqual({
      kind: 'noPartner',
    })
  })

  /**
   * Handover §4.8: fewer than two members is not a contest. A solo household's payload is an
   * ordinary 0–0, so without the member check the widget would show a duel against nobody.
   */
  it('wins over every other signal', () => {
    expect(
      describeStanding(
        { myPoints: 50, partnerPoints: 0, settled: true, voided: true },
        { hasPartner: false },
      ),
    ).toEqual({ kind: 'noPartner' })
  })
})

describe('a live period', () => {
  it('reports nothing logged when both are zero', () => {
    expect(describeStanding({ myPoints: 0, partnerPoints: 0, ...live }, withPartner)).toEqual({
      kind: 'nothingYet',
    })
  })

  it('reports a lead, with the margin', () => {
    expect(describeStanding({ myPoints: 25, partnerPoints: 10, ...live }, withPartner)).toEqual({
      kind: 'leading',
      margin: 15,
    })
  })

  // The other direction, as its own case.
  it('reports trailing, with the margin', () => {
    expect(describeStanding({ myPoints: 10, partnerPoints: 25, ...live }, withPartner)).toEqual({
      kind: 'trailing',
      margin: 15,
    })
  })

  it('distinguishes a scoring tie from an empty one', () => {
    expect(describeStanding({ myPoints: 20, partnerPoints: 20, ...live }, withPartner)).toEqual({
      kind: 'levelPegging',
    })
  })

  it('treats a one-point lead as a lead', () => {
    expect(describeStanding({ myPoints: 1, partnerPoints: 0, ...live }, withPartner)).toEqual({
      kind: 'leading',
      margin: 1,
    })
  })
})

describe('a voided period', () => {
  /**
   * A `pausesCompetition` reward was redeemed, so there is no winner however the points fell.
   * Announcing a lead would promise a payout that cannot happen.
   */
  it.each([
    ['while ahead', 40, 10],
    ['while behind', 10, 40],
    ['while level', 10, 10],
    ['with nothing logged', 0, 0],
  ])('overrides the score %s', (_name, myPoints, partnerPoints) => {
    expect(
      describeStanding({ myPoints, partnerPoints, settled: false, voided: true }, withPartner),
    ).toEqual({ kind: 'voided' })
  })

  it('overrides settled too', () => {
    expect(
      describeStanding(
        { myPoints: 40, partnerPoints: 10, settled: true, voided: true },
        withPartner,
      ),
    ).toEqual({ kind: 'voided' })
  })
})

describe('a settled period', () => {
  const settled = { settled: true, voided: false }

  it('reports a win', () => {
    expect(describeStanding({ myPoints: 30, partnerPoints: 5, ...settled }, withPartner)).toEqual({
      kind: 'won',
      margin: 25,
    })
  })

  it('reports a loss', () => {
    expect(describeStanding({ myPoints: 5, partnerPoints: 30, ...settled }, withPartner)).toEqual({
      kind: 'lost',
      margin: 25,
    })
  })

  /**
   * Deliberately "drawn", never "win-win". A settled equal non-zero period *is* a win-win under
   * §4.8, but inferring that here duplicates a settlement rule the payload does not state — and the
   * UI would disagree silently if the server's definition moved. Both shapes must read the same.
   */
  it.each([
    ['with points on both sides', 20, 20],
    ['with nothing logged at all', 0, 0],
  ])('reports a draw %s, without claiming a win-win', (_name, myPoints, partnerPoints) => {
    expect(describeStanding({ myPoints, partnerPoints, ...settled }, withPartner)).toEqual({
      kind: 'drawn',
    })
  })

  it('is distinguishable from the same score still in progress', () => {
    const scores = { myPoints: 30, partnerPoints: 5 }
    expect(describeStanding({ ...scores, settled: true, voided: false }, withPartner).kind).toBe('won')
    expect(describeStanding({ ...scores, settled: false, voided: false }, withPartner).kind).toBe(
      'leading',
    )
  })
})

describe('tugShares', () => {
  it.each([
    ['a clean sweep', 10, 0, 100, 0],
    ['the other way', 0, 10, 0, 100],
    ['a quarter', 5, 15, 25, 75],
    ['level', 20, 20, 50, 50],
  ])('%s → %i/%i', (_name, mine, theirs, expectedMine, expectedTheirs) => {
    expect(tugShares(mine, theirs)).toEqual({ mine: expectedMine, partner: expectedTheirs })
  })

  it('splits 0–0 evenly rather than collapsing the bar', () => {
    expect(tugShares(0, 0)).toEqual({ mine: 50, partner: 50 })
  })

  /**
   * The shares must always sum to 100 — `partner` is derived by subtraction for this reason. Two
   * independent `Math.round` calls drift apart on thirds and leave a gap in the track.
   */
  it.each([
    [1, 2],
    [2, 1],
    [1, 3],
    [7, 11],
    [333, 667],
    [1, 999999],
  ])('always sums to 100 (%i vs %i)', (mine, theirs) => {
    const shares = tugShares(mine, theirs)
    expect(shares.mine + shares.partner).toBe(100)
  })

  it('never produces a negative share', () => {
    const shares = tugShares(0, 999999)
    expect(shares.mine).toBeGreaterThanOrEqual(0)
    expect(shares.partner).toBeGreaterThanOrEqual(0)
  })
})

describe('periodLabel', () => {
  /**
   * Derived from `periodType`, never formatted from `periodStart` — those are UTC instants at
   * *local* midnight, so `2026-08-02T12:00:00Z` is 3 August in NZ and a monthly period starting
   * 1 August is `2026-07-31T12:00:00Z`, which any naive slice reports as July. See log `045`.
   */
  it.each([
    ['Daily', 'Today'],
    ['Weekly', 'This week'],
    ['Monthly', 'This month'],
  ] as const)('%s → %s', (periodType, expected) => {
    expect(periodLabel(periodType)).toBe(expected)
  })
})
