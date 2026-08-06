import { baseApi } from '../../api/baseApi'

/**
 * The approval queue for store changes — task [68].
 *
 * Separate from `rewardApi` because it is a different subject: `rewardApi` is the catalogue, this
 * is the queue of things that want to alter it. They share the `RewardChange` tag, which is how a
 * proposal made on the Store screen shows up in the queue on the Notices screen.
 */

export type RewardChangeKind = 'Create' | 'Update' | 'Delete'

export type RewardChange = {
  id: number
  kind: RewardChangeKind
  rewardId: number | null
  /** The reward as it stands today. Null for a `Create`, which has no existing row. */
  currentTitle: string | null
  currentCoinCost: number | null
  /** What is being asked for. Null on a field the change does not touch. */
  proposedTitle: string | null
  proposedCoinCost: number | null
  requestedByName: string
  requestedAt: string
}

export const rewardChangeApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    /** Your partner's proposals. The server never includes your own. */
    pendingRewardChanges: build.query<RewardChange[], void>({
      query: () => '/api/reward-changes',
      providesTags: ['RewardChange'],
    }),

    /**
     * Approving applies the change, so the catalogue moves with it — and so does `Redemption`,
     * because an approved delete archives a reward the feed describes.
     */
    approveRewardChange: build.mutation<RewardChange, { id: number }>({
      query: ({ id }) => ({ url: `/api/reward-changes/${id}/approve`, method: 'POST' }),
      invalidatesTags: ['RewardChange', 'Reward'],
    }),

    /** Rejecting changes nothing in the store, so only the queue is invalidated. */
    rejectRewardChange: build.mutation<RewardChange, { id: number; reason: string }>({
      query: ({ id, reason }) => ({
        url: `/api/reward-changes/${id}/reject`,
        method: 'POST',
        body: { reason },
      }),
      invalidatesTags: ['RewardChange'],
    }),
  }),
})

export const {
  usePendingRewardChangesQuery,
  useApproveRewardChangeMutation,
  useRejectRewardChangeMutation,
} = rewardChangeApi
