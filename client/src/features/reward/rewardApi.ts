import { baseApi } from '../../api/baseApi'
import type { Paged } from '../activity/activityApi'
import { buildRewardQuery, type StoreQueryState } from './storeQuery'

/**
 * The reward catalogue and its management. Shapes confirmed against the running API in task [51].
 */

export type Reward = {
  id: number
  title: string
  coinCost: number
  /**
   * Whether redeeming this voids that day's duel for **both** partners.
   *
   * [28] added this field to `GET /api/rewards` for one reason: the store must disclose the
   * consequence at the point of redemption, and that copy is **derived from the flag** rather than
   * matched on the title "Full chore day off", so it cannot drift from what settlement actually
   * does. Nothing in this feature reads the title to decide anything.
   */
  pausesCompetition: boolean
}

export const rewardApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    /**
     * The catalogue, carrying all four of `wireframes.md` §4's controls. The query string is built
     * by `storeQuery.ts`, which is where the API's rules live.
     */
    rewards: build.query<Paged<Reward>, StoreQueryState>({
      query: (state) => `/api/rewards?${buildRewardQuery(state)}`,
      providesTags: ['Reward'],
    }),

    createReward: build.mutation<Reward, { title: string; coinCost: number }>({
      query: (body) => ({ url: '/api/rewards', method: 'POST', body }),
      invalidatesTags: ['Reward'],
    }),

    /**
     * `PATCH` accepts partial bodies and treats null as "leave alone", but the editor always has
     * every field and sends every field — the same call [47] made for chores.
     *
     * Re-pricing is safe to expose because `redemptions.coins_spent` is a snapshot (§4.3): past
     * purchases keep what they actually cost. That column is why editing exists at all.
     */
    updateReward: build.mutation<Reward, { id: number; title: string; coinCost: number }>({
      query: ({ id, ...body }) => ({ url: `/api/rewards/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['Reward'],
    }),

    /**
     * Removes a reward from the store.
     *
     * The server **archives** rather than deletes (§4.2 and log `029`): `redemptions` cascades from
     * `rewards`, and those rows are read by settlement's daily void check, by two badge counts and
     * by the Notices feed — so a hard delete would let one partner un-void a day the other had paid
     * to pause, and set their badge progress back.
     *
     * Nothing here says "archive". From the user's side the reward is gone; the copy promises only
     * the part they can observe, which is that what they already redeemed is untouched.
     */
    deleteReward: build.mutation<void, { id: number }>({
      query: ({ id }) => ({ url: `/api/rewards/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Reward'],
    }),

    /**
     * Spend Coins.
     *
     * `pausesCompetition` is passed in but **not sent** — the request body is only `rewardId`, and
     * that is deliberate server-side: there is no cost field to tamper with because the charge is
     * read from the reward row (log `030`). The flag is here purely to decide invalidation.
     *
     * ### Why `Competition` is conditional
     *
     * Redeeming a pausing reward voids that day's duel, so the standing genuinely changes. An
     * ordinary redemption cannot move a score. `GET .../competitions/current` runs **lazy
     * settlement on every call** (§4.7), so invalidating it unconditionally would be real server
     * work for a guaranteed no-op — the same reasoning that kept `createActivityLog` off that tag
     * in [46].
     *
     * `Me` is the balance, `Reward` matters because `?affordable=` is computed server-side *from*
     * that balance, `Redemption` is the Notices feed, and `Badge` is First redemption / Big spender
     * (log `030`). Nothing subscribes to `Badge` until [54]; it is correct now rather than something
     * [54] has to remember.
     */
    redeemReward: build.mutation<
      {
        id: number
        rewardId: number
        coinsSpent: number
        coinsRemaining: number
        redeemedAt: string
      },
      { rewardId: number; pausesCompetition: boolean }
    >({
      query: ({ rewardId }) => ({ url: '/api/redemptions', method: 'POST', body: { rewardId } }),
      invalidatesTags: (_result, _error, arg) =>
        arg.pausesCompetition
          ? ['Me', 'Reward', 'Redemption', 'Badge', 'Competition']
          : ['Me', 'Reward', 'Redemption', 'Badge'],
    }),
  }),
})

export const {
  useRewardsQuery,
  useCreateRewardMutation,
  useUpdateRewardMutation,
  useDeleteRewardMutation,
  useRedeemRewardMutation,
} = rewardApi
