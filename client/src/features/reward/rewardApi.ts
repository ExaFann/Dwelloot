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

/**
 * What a store mutation did — task [68].
 *
 * A paired household's changes go to the partner's queue instead of taking effect, and the server
 * says which happened with the **status code**: 201/200/204 for applied, **202 Accepted** for
 * queued. The client cannot work this out for itself — it would have to know the household's member
 * count, which it may hold a stale copy of, and getting it wrong means showing "Saved" over a store
 * that has not changed.
 *
 * Discriminated on `outcome` rather than on the shape of the payload: the same rule [53] applies to
 * loot box prizes, where `result` is the contract and the nullable fields are not.
 */
export type RewardMutationOutcome<TApplied> =
  | { outcome: 'applied'; reward: TApplied }
  | { outcome: 'queued'; changeRequestId: number; message: string }

/**
 * Reads the status code rather than sniffing the body.
 *
 * 202 is the one status that means "understood, not done yet", and it is the only signal that does
 * not depend on the queued and applied bodies happening to differ in a field name.
 */
function readOutcome<T>(
  body: unknown,
  meta: { response?: Response } | undefined,
): RewardMutationOutcome<T> {
  if (meta?.response?.status === 202) {
    const queued = body as { changeRequestId: number; message: string }
    return { outcome: 'queued', changeRequestId: queued.changeRequestId, message: queued.message }
  }
  return { outcome: 'applied', reward: body as T }
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

    createReward: build.mutation<
      RewardMutationOutcome<Reward>,
      { title: string; coinCost: number }
    >({
      query: (body) => ({ url: '/api/rewards', method: 'POST', body }),
      transformResponse: readOutcome<Reward>,
      // `RewardChange` too: a queued create is a new row in the partner's queue, and this client
      // may be showing that queue on another tab.
      invalidatesTags: ['Reward', 'RewardChange'],
    }),

    /**
     * `PATCH` accepts partial bodies and treats null as "leave alone", but the editor always has
     * every field and sends every field — the same call [47] made for chores.
     *
     * Re-pricing is safe to expose because `redemptions.coins_spent` is a snapshot (§4.3): past
     * purchases keep what they actually cost. That column is why editing exists at all.
     */
    updateReward: build.mutation<
      RewardMutationOutcome<Reward>,
      { id: number; title: string; coinCost: number }
    >({
      query: ({ id, ...body }) => ({ url: `/api/rewards/${id}`, method: 'PATCH', body }),
      transformResponse: readOutcome<Reward>,
      invalidatesTags: ['Reward', 'RewardChange'],
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
    deleteReward: build.mutation<RewardMutationOutcome<void>, { id: number }>({
      query: ({ id }) => ({ url: `/api/rewards/${id}`, method: 'DELETE' }),
      transformResponse: readOutcome<void>,
      invalidatesTags: ['Reward', 'RewardChange'],
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
