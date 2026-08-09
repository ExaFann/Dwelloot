import { baseApi } from '../../api/baseApi'
import type { Paged } from '../activity/activityApi'

/**
 * The partner's redemptions — the Notices tab's middle section.
 *
 * `GET /api/redemptions?scope=household&excludeMine=true` is a **different endpoint** from
 * `/api/redemptions/mine`, and `api-design.md` records that using `/mine` here was an earlier draft's
 * mistake: this section shows the *partner's* activity, not the caller's.
 *
 * `scope=household` is the only implemented value and anything else is a 400 rather than a silent
 * fallback — deliberately, because a client that mistypes it and is quietly handed the whole
 * household's rows has received *more* data than it asked for.
 */

export type HouseholdRedemption = {
  id: number
  userId: number
  rewardId: number
  rewardTitle: string
  /**
   * A **snapshot** of what was actually paid (handover §4.3), never the reward's current price.
   * Recomputing from the catalogue is the exact drift this column exists to prevent — "they redeemed
   * the day off" reads very differently at 80 Coins than at whatever it was repriced to since.
   */
  coinsSpent: number
  redeemedAt: string
}

/** `GET /api/redemptions/mine`. No `userId` — the caller is implied. */
export type MyRedemption = {
  id: number
  rewardId: number
  rewardTitle: string
  coinsSpent: number
  redeemedAt: string
}

export const redemptionApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    partnerRedemptions: build.query<Paged<HouseholdRedemption>, { take?: number }>({
      query: ({ take = 5 }) =>
        `/api/redemptions?scope=household&excludeMine=true&take=${take}`,
      providesTags: ['Redemption'],
    }),

    /**
     * The caller's own. Together with `partnerRedemptions` these **partition** the household's
     * redemptions — `api-design.md` states every row appears in exactly one of them — so merging the
     * two can never double-count.
     */
    myRedemptions: build.query<Paged<MyRedemption>, { take?: number }>({
      query: ({ take = 5 }) => `/api/redemptions/mine?take=${take}`,
      providesTags: ['Redemption'],
    }),
  }),
})

export const { usePartnerRedemptionsQuery, useMyRedemptionsQuery } = redemptionApi
