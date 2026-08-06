import { baseApi } from '../../api/baseApi'

/**
 * Opening a loot box. Shape confirmed against the running API in [51]/[53] and against
 * `LootBoxDtos.cs` for the branch that could not be forced (see below).
 */

export type OpenLootBoxResult = {
  competitionId: number
  /**
   * **The discriminator.** Both payload fields below are nullable, so the prize kind is answerable
   * from the shape as well — and that answer is not the contract. Always switch on this.
   */
  result: 'coins' | 'bonusReward'
  /** `int?` server-side: null on a bonus-reward roll, not 0. */
  coinsAwarded: number | null
  reward: { id: number; title: string } | null
}

export const lootBoxApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    /**
     * Rolls on the first open and replays afterwards — idempotent, and the roll is stored on the
     * competition (log `025`). A repeat call credits nothing, so a double-open cannot double-pay.
     *
     * ### The invalidations, each for a reason
     *
     * - **`Competition`** is the mechanism, not a cost: it clears this card *and* surfaces the next
     *   queued box, since the server hands them back oldest-first.
     * - **`Me`** is the Coin balance.
     * - **`Reward`** because `?affordable=` is computed server-side from that balance ([51]).
     * - **`Competition`** is *also* what refreshes the prize feed: since [36a] a won box is listed
     *   by `GET .../competitions/history`, which provides the same tag.
     *
     * `Redemption` and `Badge` were dropped in [36a]. They were here because a bonus prize used to
     * be written as a zero-cost redemption — a row that could not actually be inserted
     * (`ck_redemptions_coins_spent_positive`) and that wrongly counted towards the
     * First-redemption and Big-spender badges. Opening a box now moves neither.
     *
     * Unlike [51]'s redeem this is unconditional. There the `Competition` refetch was avoidable work
     * against an endpoint that settles lazily on every call; here it is the whole point.
     */
    openLootBox: build.mutation<OpenLootBoxResult, { householdId: number; competitionId: number }>({
      query: ({ householdId, competitionId }) => ({
        url: `/api/households/${householdId}/competitions/${competitionId}/open-box`,
        method: 'POST',
      }),
      invalidatesTags: ['Competition', 'Me', 'Reward'],
    }),
  }),
})

export const { useOpenLootBoxMutation } = lootBoxApi
