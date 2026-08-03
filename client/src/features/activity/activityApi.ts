import { baseApi } from '../../api/baseApi'

/**
 * Activities (user-facing: **Chores**) and the caller's own logs. Shapes confirmed against the
 * running API in task [46].
 */

export type Activity = { id: number; title: string; points: number }
export type Paged<T> = { items: T[]; total: number }

export type ActivityLogStatus = 'Pending' | 'Approved' | 'Rejected'

export type MyActivityLog = {
  id: number
  activityTitle: string
  /**
   * What the chore was **worth when logged** — not what was earned. Populated on `Pending` and
   * `Rejected` rows too, where nothing has been or will be credited. It is a snapshot column
   * (handover §4.3) so that editing a chore later cannot re-value past logs. Always render it
   * through `describeLogPoints`, never on its own.
   */
  pointsAwarded: number
  status: ActivityLogStatus
  completedAt: string
  approvedAt: string | null
  rejectReason: string | null
}

export type CreateActivityLogResponse = {
  id: number
  activityId: number
  status: ActivityLogStatus
  completedAt: string
}

export const activityApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    /** The quick-add row. `sort`/`pageSize` are `api-design.md`'s, not a hand-picked list. */
    quickAddActivities: build.query<Paged<Activity>, void>({
      query: () => '/api/activities?category=Chore&pageSize=5&sort=title',
      providesTags: ['Activity'],
    }),

    /**
     * The full chore list for the log screen ([47]).
     *
     * `sort=title` is fixed: alphabetical is what makes a list scannable, and the only other valid
     * value is `points` — confirmed from the API's own 400, which names them
     * ("Unknown sort field. Valid values: title, points."). Sorting is the Store's job ([51]).
     */
    activities: build.query<Paged<Activity>, { search?: string }>({
      query: ({ search }) => {
        const params = new URLSearchParams({ category: 'Chore', sort: 'title' })
        // Only sent when non-empty: `search=` would be a filter for the empty string.
        if (search?.trim()) params.set('search', search.trim())
        return `/api/activities?${params.toString()}`
      },
      providesTags: ['Activity'],
    }),

    myActivityLogs: build.query<Paged<MyActivityLog>, { take?: number }>({
      query: ({ take = 5 }) => `/api/activity-logs/mine?take=${take}`,
      providesTags: ['ActivityLog'],
    }),

    createActivityLog: build.mutation<CreateActivityLogResponse, { activityId: number }>({
      query: (body) => ({ url: '/api/activity-logs', method: 'POST', body }),
      /**
       * `ActivityLog` only — deliberately **not** `Competition`.
       *
       * A new log is `Pending`, and the standing counts only *approved* logs: measured directly in
       * [46], a pending 25-point log left `myPoints` at 10. Invalidating `Competition` would refetch
       * a standing that cannot have changed, and that endpoint runs lazy settlement on every call
       * (§4.7), so it would be real server work for a guaranteed no-op.
       *
       * The standing moves when the *partner approves* — [48]'s invalidation to make.
       */
      invalidatesTags: ['ActivityLog'],
    }),
  }),
})

export const {
  useQuickAddActivitiesQuery,
  useActivitiesQuery,
  useMyActivityLogsQuery,
  useCreateActivityLogMutation,
} = activityApi
