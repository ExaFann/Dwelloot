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
export function tugShares(myPoints: number, partnerPoints: number): { mine: number; partner: number } {
  const total = myPoints + partnerPoints
  // An even split is the honest picture of 0–0, and zero-width segments read as a broken component.
  if (total <= 0) return { mine: 50, partner: 50 }
  const mine = Math.round((myPoints / total) * 100)
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
