import { baseApi } from '../../api/baseApi'

/**
 * The badge catalogue with this caller's unlock state. Shape confirmed against the running API
 * in [54].
 *
 * Not household-scoped and takes no parameters — badges are the one catalogue with no
 * `household_id`, and unlocks hang off the user (log `027`). A caller with no household gets all six,
 * all locked, rather than the 409 the activity and reward lists return.
 */

export type Badge = {
  id: number
  name: string
  /**
   * "How do I earn this", from the server.
   *
   * **Never a local copy.** Log `027` recorded this as an obligation on [54]: log `026` pins the
   * unlock thresholds against this same seeded text, so a second copy in the client would be free to
   * drift from the rule that actually fires. It is also what makes a locked badge more than a grey
   * square.
   */
  criteria: string
  unlocked: boolean
  /** Present and `null` when locked, rather than omitted — a client parses one shape either way. */
  unlockedAt: string | null
}

/** `{ items }` with no `total`: six fixed rows, no filter and no pager (log `027`). */
export type BadgeList = { items: Badge[] }

export const badgeApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    badges: build.query<BadgeList, void>({
      query: () => '/api/badges',
      providesTags: ['Badge'],
    }),
  }),
})

export const { useBadgesQuery } = badgeApi
