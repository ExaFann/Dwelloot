import { baseApi } from '../../api/baseApi'
import type { Paged } from '../activity/activityApi'

/**
 * The current competition period. Shape confirmed against the running API in task [45].
 *
 * **`myPoints` and `partnerPoints` are relative to the caller** — fetching the same period as the
 * other partner returns them swapped. So nothing here has to match user ids; "me" is whoever holds
 * the token.
 */

export type PeriodType = 'Daily' | 'Weekly' | 'Monthly'

/** Populated only when a closed period has an unopened box. **Task [53]** renders it, not [45]. */
export type UnopenedLootBox = {
  competitionId: number
  periodType: PeriodType
  won: boolean
  isWinWin: boolean
}

export type CurrentCompetition = {
  periodType: PeriodType
  /**
   * A UTC instant at **local** midnight, not a date. `2026-08-02T12:00:00Z` is 3 August in
   * Pacific/Auckland, so `slice(0, 10)` reports the wrong day — see log `045`.
   */
  periodStart: string
  periodEnd: string
  myPoints: number
  partnerPoints: number
  settled: boolean
  /** A `pausesCompetition` reward was redeemed for this day: no winner, no box for either side. */
  voided: boolean
  unopenedLootBox: UnopenedLootBox | null
}

/**
 * One opened loot box in the household's prize feed — task [36a].
 *
 * Same union as `OpenLootBoxResult`: `result` is the discriminator and both payloads are nullable,
 * so the prize kind is answerable two ways and only one is the contract (log `053`).
 */
export type HouseholdPrize = {
  competitionId: number
  userId: number
  periodType: PeriodType
  result: 'coins' | 'bonusReward'
  coinsAwarded: number | null
  reward: { id: number; title: string } | null
  openedAt: string
}

export const competitionApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    /**
     * `periodType` defaults to `Daily` server-side and Weekly/Monthly are accepted — settlement has
     * always covered all three, so the dashboard's week and month views needed **no backend change**.
     * An unknown value is a 400 rather than a silent fallback to Daily.
     */
    currentCompetition: build.query<
      CurrentCompetition,
      { householdId: number; periodType?: PeriodType }
    >({
      query: ({ householdId, periodType }) =>
        `/api/households/${householdId}/competitions/current${
          periodType ? `?periodType=${periodType}` : ''
        }`,
      /**
       * This request has a side effect on the server: it settles any period that has closed
       * (handover §4.7 — lazy settlement, no scheduler). That is why it also provides `Competition`
       * rather than being treated as a read-only cache entry: approving a log changes the score, so
       * [48] invalidates this tag and the standing refreshes.
       */
      providesTags: ['Competition'],
    }),

    /**
     * What this household has **won** — task [36a], the endpoint `api-design.md` listed from the
     * design phase and struck through as "NOT IMPLEMENTED — returns 404".
     *
     * One row per *opened* box, so a win-win gives two. An unopened box is not a prize yet.
     *
     * Tagged `Competition`, not a tag of its own: opening a box already invalidates that tag, so
     * the feed refreshes on the one action that can add to it, with no new cache entity to reason
     * about.
     */
    householdPrizes: build.query<Paged<HouseholdPrize>, { householdId: number; take?: number }>({
      query: ({ householdId, take = 6 }) =>
        `/api/households/${householdId}/competitions/history?take=${take}`,
      providesTags: ['Competition'],
    }),
  }),
})

export const { useCurrentCompetitionQuery, useHouseholdPrizesQuery } = competitionApi
