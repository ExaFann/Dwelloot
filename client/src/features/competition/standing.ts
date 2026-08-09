import type { CurrentCompetition, PeriodType } from './competitionApi'

/**
 * Everything the head-to-head widget needs to say, decided here rather than in JSX.
 *
 * Keeping it a pure function means the rules below are tested as a table, without rendering — and
 * the component becomes a renderer with no judgement of its own.
 */

export type Standing =
  /** A household of one. Not a contest at all — handover §4.8. */
  | { kind: 'noPartner' }
  /** Live period, nobody has scored. */
  | { kind: 'nothingYet' }
  /** Live period, someone is ahead. */
  | { kind: 'leading'; margin: number }
  | { kind: 'trailing'; margin: number }
  /** Live period, equal and non-zero. */
  | { kind: 'levelPegging' }
  /** A `pausesCompetition` reward voided this period for **both** partners. */
  | { kind: 'voided' }
  /** Closed and settled. */
  | { kind: 'won'; margin: number }
  | { kind: 'lost'; margin: number }
  | { kind: 'drawn' }

export function describeStanding(
  competition: Pick<CurrentCompetition, 'myPoints' | 'partnerPoints' | 'settled' | 'voided'>,
  { hasPartner }: { hasPartner: boolean },
): Standing {
  if (!hasPartner) return { kind: 'noPartner' }

  const { myPoints, partnerPoints, settled, voided } = competition
  const margin = Math.abs(myPoints - partnerPoints)

  /**
   * Checked before settled and before the scores. A voided day has no winner however the points
   * fell, so announcing "you're ahead" would be telling the user something that cannot pay out.
   */
  if (voided) return { kind: 'voided' }

  if (settled) {
    if (myPoints > partnerPoints) return { kind: 'won', margin }
    if (myPoints < partnerPoints) return { kind: 'lost', margin }
    /**
     * Deliberately just "drawn", never "win-win".
     *
     * A settled, equal, non-zero period *is* a win-win under §4.8 — but inferring that here would
     * duplicate a settlement rule the payload does not state, and the UI would disagree silently if
     * the server's definition moved. `unopenedLootBox` is what actually tells a user they won
     * something, and [53] renders it.
     */
    return { kind: 'drawn' }
  }

  if (myPoints === 0 && partnerPoints === 0) return { kind: 'nothingYet' }
  if (myPoints > partnerPoints) return { kind: 'leading', margin }
  if (myPoints < partnerPoints) return { kind: 'trailing', margin }
  return { kind: 'levelPegging' }
}

/**
 * How far the tug bar leans, as whole percentages that always sum to 100.
 *
 * `partner` is derived by subtraction rather than computed independently, so rounding can never
 * leave a one-pixel gap or overflow the track.
 */
/**
 * How far a rope has been pulled, as whole percentages that always sum to 100.
 *
 * ### Why this is not `myPoints / total`
 *
 * Share-of-total was the original rule and it made the rope lie at exactly the moment people look at
 * it most. **One chore to nil is 100% of the points scored**, so the marker slammed to the far end
 * and the widget announced a rout over a single 5-point chore. By the end of a busy day the same
 * 5-point gap barely moved it. The bar was most dramatic when the least had happened — which is the
 * problem the owner reported.
 *
 * So position is driven by the **lead**, measured against a scale that starts at `SETTLING_SCALE` and
 * grows once the real scores exceed it:
 *
 * | Scores | Lead | Marker |
 * |---|---|---|
 * | 0–0 | 0 | dead centre |
 * | 5–0 | 5 of 30 | 58% — a nudge |
 * | 15–0 | 15 of 30 | 75% |
 * | 60–10 | 50 of 70 | 86%, and capped below the end |
 *
 * `MAX_LEAN` keeps the marker off the ends entirely: a rope pulled fully out of the frame stops
 * reading as a contest, and no lead in a two-person day is ever truly final.
 */
const SETTLING_SCALE = 30
const MAX_LEAN = 46

export function tugShares(myPoints: number, partnerPoints: number): { mine: number; partner: number } {
  const lead = myPoints - partnerPoints
  // An even split is the honest picture of 0–0, and zero-width segments read as a broken component.
  if (lead === 0) return { mine: 50, partner: 50 }

  /**
   * The scale only ever grows. Using the raw total instead would shrink the denominator whenever
   * scores are low, which is the share-of-total behaviour this replaced.
   */
  const scale = Math.max(SETTLING_SCALE, myPoints + partnerPoints)
  const lean = Math.max(-1, Math.min(1, lead / scale)) * MAX_LEAN
  const mine = Math.round(50 + lean)
  return { mine, partner: 100 - mine }
}

/**
 * "Today" / "This week" / "This month".
 *
 * Derived from `periodType` rather than formatted from `periodStart`, which avoids a real trap:
 * those instants are UTC at *local* midnight, so `2026-08-02T12:00:00Z` is 3 August in NZ and any
 * `slice(0, 10)` or `getUTCDate()` reports the wrong day — the wrong *month* for monthly periods.
 * See log `045`.
 */
export function periodLabel(periodType: PeriodType): string {
  switch (periodType) {
    case 'Daily':
      return 'Today'
    case 'Weekly':
      return 'This week'
    case 'Monthly':
      return 'This month'
  }
}
