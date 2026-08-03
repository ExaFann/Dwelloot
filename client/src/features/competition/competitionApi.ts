import { baseApi } from '../../api/baseApi'

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

export const competitionApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    currentCompetition: build.query<CurrentCompetition, { householdId: number }>({
      query: ({ householdId }) => `/api/households/${householdId}/competitions/current`,
      /**
       * This request has a side effect on the server: it settles any period that has closed
       * (handover §4.7 — lazy settlement, no scheduler). That is why it also provides `Competition`
       * rather than being treated as a read-only cache entry: approving a log changes the score, so
       * [48] invalidates this tag and the standing refreshes.
       */
      providesTags: ['Competition'],
    }),
  }),
})

export const { useCurrentCompetitionQuery } = competitionApi
