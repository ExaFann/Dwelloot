import { baseApi } from '../../api/baseApi'

/**
 * Household create and join. Shapes confirmed against the running API in task [44].
 *
 * **Neither mutation invalidates `Me` automatically**, and that is deliberate rather than an
 * omission. Invalidating `Me` is what makes `AuthGate` see a household and redirect, so it is the
 * trigger that ends the pairing screen — and creating a household needs one more step first: the
 * invite code has to be shown. `PairingPage` invalidates at the right moment for each path.
 */

export type CreateHouseholdRequest = { name: string }
export type CreateHouseholdResponse = {
  id: number
  name: string
  /** The **sole credential** for joining (handover §4.5). Shown once here, and again in [56]. */
  inviteCode: string
  isFull: boolean
}

export type JoinHouseholdRequest = { inviteCode: string }
export type JoinHouseholdResponse = { id: number; isFull: boolean }

export type HouseholdMember = { id: number; name: string }
export type HouseholdResponse = {
  id: number
  name: string
  inviteCode: string
  /**
   * One or two entries. **This is the only way to know whether a partner has joined** — a solo
   * household's `competitions/current` is an ordinary `0–0` payload with no field distinguishing it
   * from a quiet two-person day (task [45]).
   */
  members: HouseholdMember[]
}

export const householdApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getHousehold: build.query<HouseholdResponse, { householdId: number }>({
      query: ({ householdId }) => `/api/households/${householdId}`,
      providesTags: ['Household'],
    }),

    createHousehold: build.mutation<CreateHouseholdResponse, CreateHouseholdRequest>({
      query: (body) => ({ url: '/api/households', method: 'POST', body }),
    }),

    /**
     * Join by invite code.
     *
     * **Invalidates everything household-scoped**, because since [70] this endpoint can *move* an
     * already-solo user: they leave one household and enter another in a single transaction, and
     * their old chores, rewards, competitions and logs are deleted by cascade. A cache left holding
     * the previous household's catalogue would render rows the server would 404 on.
     *
     * `Me` is the important one — it carries `householdId`, and invalidating it is what lets
     * `AuthGate` notice the change and re-route. `PairingPage` still dispatches that invalidation
     * itself for the *create* path, which has no mutation-level tag of its own.
     */
    joinHousehold: build.mutation<JoinHouseholdResponse, JoinHouseholdRequest>({
      query: (body) => ({ url: '/api/households/join', method: 'POST', body }),
      invalidatesTags: [
        'Me',
        'Household',
        'Activity',
        'ActivityLog',
        'Competition',
        'Reward',
        'Redemption',
      ],
    }),

    /**
     * Rename, from the Me screen ([56]).
     *
     * The response is `{ id, name }` only — deliberately not the full details object (log `015`) —
     * so `Household` is invalidated rather than the reply being merged into the cache. `Me` is not
     * invalidated: the household's name is not on `/api/auth/me`.
     */
    renameHousehold: build.mutation<
      { id: number; name: string },
      { householdId: number; name: string }
    >({
      query: ({ householdId, name }) => ({
        url: `/api/households/${householdId}`,
        method: 'PATCH',
        body: { name },
      }),
      invalidatesTags: ['Household'],
    }),

    /**
     * Leave the household. Two branches server-side (log `015`), and the caller cannot choose:
     *
     * - **One of two leaves** — `household_id` cleared, `is_full` reset so the partner can pair again.
     * - **The last member leaves** — the household row is **deleted**, taking its activities,
     *   rewards, competitions and claims with it by cascade.
     *
     * ### No navigation here
     *
     * Invalidating `Me` sets `householdId` to null, and **`AuthGate` redirects to `/pairing`** on the
     * next render. Navigating here as well would be a second mechanism doing the gate's job —
     * `LoginPage` already proved what that costs, racing the gate and silently discarding the
     * requested destination (handover §3).
     *
     * Every household-scoped tag goes too, because every one of them is now unreadable: a departed
     * member gets a 404 from `GET /api/households/{id}` immediately, verified over HTTP in [16].
     */
    leaveHousehold: build.mutation<{ left: boolean }, { householdId: number }>({
      query: ({ householdId }) => ({
        url: `/api/households/${householdId}/leave`,
        method: 'POST',
      }),
      invalidatesTags: [
        'Me',
        'Household',
        'Activity',
        'ActivityLog',
        'Competition',
        'Reward',
        'Redemption',
      ],
    }),
  }),
})

export const {
  useGetHouseholdQuery,
  useCreateHouseholdMutation,
  useJoinHouseholdMutation,
  useRenameHouseholdMutation,
  useLeaveHouseholdMutation,
} = householdApi
