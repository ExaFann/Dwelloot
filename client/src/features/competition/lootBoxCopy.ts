import type { PeriodType } from './competitionApi'
import type { OpenLootBoxResult } from './lootBoxApi'

/**
 * Everything the reveal says, decided here rather than in JSX — the same split `standing.ts` uses,
 * so the rules are tested as a table and the component is a renderer with no judgement of its own.
 */

/**
 * Why this does not reuse `periodLabel` from `standing.ts`.
 *
 * That function answers "which period am I in" and returns *"Today"* / *"This week"*. A loot box is
 * always for a period that has **closed**, so "Today" would be wrong, and there is nothing in the
 * payload to replace it with: `unopenedLootBox` carries `competitionId`, `periodType`, `won` and
 * `isWinWin` and no dates at all.
 *
 * That is a mercy rather than a limitation. Period instants are UTC at **local** midnight, so
 * `2026-08-04T12:00:00Z` is 5 August in Auckland and every naive date read is off by a day (log
 * `045`). With no date in the payload there is nothing to get wrong.
 */
const DUEL: Record<PeriodType, string> = {
  Daily: 'the daily duel',
  Weekly: 'the week',
  Monthly: 'the month',
}

export function describeWin(periodType: PeriodType, isWinWin: boolean): string {
  return isWinWin
    // A genuine tie pays out twice — one prize, received by both (log `025`). Saying "you won"
    // would take credit for the draw the partner also earned.
    ? `You both took ${DUEL[periodType]}. A draw pays out for both of you.`
    : `You won ${DUEL[periodType]}.`
}

export type Prize =
  | { kind: 'coins'; amount: number; headline: string; detail: string }
  | { kind: 'reward'; headline: string; detail: string }

/**
 * What came out of the box.
 *
 * **`result` is the discriminator.** `coinsAwarded` and `reward` are both nullable
 * (`LootBoxDtos.cs`: `int? CoinsAwarded`), so "which prize is this" is answerable from the shape of
 * the payload too — and that second answer is not the contract. It would agree with `result` until
 * the day it did not, which is the same trap as reading a reward's title instead of its
 * `pausesCompetition` flag ([51]).
 */
export function describePrize(result: OpenLootBoxResult): Prize {
  if (result.result === 'bonusReward') {
    return {
      kind: 'reward',
      headline: result.reward?.title ?? 'A bonus reward',
      /**
       * Opening a bonus box writes a **zero-cost redemption** (log `025`), which is what makes the
       * prize real instead of a label on a competition row. Saying so matters: without it the
       * obvious next move is to go to the Store and try to buy the thing you just won.
       */
      detail: 'Yours already — no Coins needed.',
    }
  }

  const amount = result.coinsAwarded ?? 0
  return {
    kind: 'coins',
    amount,
    headline: `+${amount} Coins`,
    detail: 'Spend them in the Store.',
  }
}
