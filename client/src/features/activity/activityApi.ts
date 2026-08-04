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

/** Item shape of `GET /api/activity-logs` — the partner's logs. Confirmed against the API. */
export type PartnerActivityLog = {
  id: number
  activityTitle: string
  pointsAwarded: number
  loggedByUserId: number
  status: ActivityLogStatus
  completedAt: string
}

/** `GET /api/activity-logs?status=pending` — the approval queue. Same shape as PartnerActivityLog. */
export type PendingApproval = PartnerActivityLog

/** `POST /api/activity-logs/bulk-approve`. Note `skipped`, which `api-design.md` omits. */
export type BulkApproveResult = {
  approved: number[]
  skipped: { id: number; reason: string }[]
}

export type ActivityLogDecision = {
  id: number
  status: ActivityLogStatus
  approvedAt: string | null
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

    /**
     * The **partner's** logs — `GET /api/activity-logs` never returns the caller's own.
     *
     * The `status` filter is optional, which is not obvious from `api-design.md`'s quick reference
     * (it documents the path as `?status=pending`, the approval queue). Omitting it returns every
     * status, which is what the dashboard's per-person feed needs: the point is to see what your
     * partner has been doing, approved or not.
     */
    partnerActivityLogs: build.query<Paged<PartnerActivityLog>, { pageSize?: number }>({
      query: ({ pageSize = 4 }) => `/api/activity-logs?pageSize=${pageSize}`,
      providesTags: ['ActivityLog'],
    }),

    myActivityLogs: build.query<Paged<MyActivityLog>, { take?: number; status?: ActivityLogStatus }>({
      query: ({ take = 5, status }) => {
        const params = new URLSearchParams({ take: String(take) })
        if (status) params.set('status', status)
        return `/api/activity-logs/mine?${params.toString()}`
      },
      providesTags: ['ActivityLog'],
    }),

    /** The approval queue. Excludes the caller's own logs by construction — handover §4.4. */
    pendingApprovals: build.query<Paged<PendingApproval>, void>({
      query: () => '/api/activity-logs?status=pending',
      providesTags: ['ActivityLog'],
    }),

    /**
     * Approving turns a pending log into points, so unlike creating one this **does** move the
     * standing — measured in [48], `partnerPoints` went 0 → 10 straight after. Hence `Competition`
     * as well as `ActivityLog`; this is the invalidation [46] deferred.
     *
     * Not `Me`: the points go to the *logger*, and the approver is the other person.
     */
    approveLog: build.mutation<ActivityLogDecision, { id: number }>({
      query: ({ id }) => ({ url: `/api/activity-logs/${id}/approve`, method: 'PATCH' }),
      invalidatesTags: ['ActivityLog', 'Competition'],
    }),

    /** A reason is required — trimmed server-side, capped at 200 characters. */
    rejectLog: build.mutation<ActivityLogDecision, { id: number; reason: string }>({
      query: ({ id, reason }) => ({
        url: `/api/activity-logs/${id}/reject`,
        method: 'PATCH',
        body: { reason },
      }),
      // A rejected log will never award points, so the standing is unchanged — but a pending log the
      // user can see disappears from the queue, and `Competition` costs nothing to refresh here.
      invalidatesTags: ['ActivityLog', 'Competition'],
    }),

    /**
     * **Partial success at HTTP 200.** The response carries `skipped` alongside `approved`, with
     * reasons `NotPending` (someone already dealt with it) and `LogNotFound`. Counting the request
     * rather than the response would misreport the common two-device race — see log `048`.
     */
    bulkApprove: build.mutation<BulkApproveResult, { ids: number[] }>({
      query: (body) => ({ url: '/api/activity-logs/bulk-approve', method: 'POST', body }),
      invalidatesTags: ['ActivityLog', 'Competition'],
    }),

    /**
     * A household's own chore, added from the Log screen ([47a]).
     *
     * `category` is sent explicitly even though the API defaults it — v1 is Chore-only
     * (`wireframes.md` §2), and being explicit means adding a second category later is a UI change
     * rather than a silent behaviour change here.
     *
     * Invalidates `Activity`, which refreshes both this screen's list and the dashboard's quick-add
     * row — the new chore is eligible for one-tap logging immediately.
     */
    createActivity: build.mutation<Activity, { title: string; points: number }>({
      query: (body) => ({
        url: '/api/activities',
        method: 'POST',
        body: { ...body, category: 'Chore' },
      }),
      invalidatesTags: ['Activity'],
    }),

    /**
     * Rename a chore or re-price it. `PATCH` accepts partial bodies — sending only `title` keeps the
     * existing points, confirmed against the API — but the editor always sends both, because it
     * always has both.
     *
     * Points are a **snapshot** on each log (handover §4.3), so re-pricing changes what future logs
     * are worth and leaves history alone. That is why editing is safe to expose at all.
     */
    updateActivity: build.mutation<Activity, { id: number; title: string; points: number }>({
      query: ({ id, ...body }) => ({ url: `/api/activities/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['Activity'],
    }),

    /**
     * Removes a chore from the household's list.
     *
     * The server **archives** rather than deletes (handover §4.2): a hard delete would cascade to
     * `activity_logs`, and the live competition period is computed from approved logs — so deleting
     * a chore mid-period would retroactively reduce whoever logged it. Either partner can delete any
     * chore, which made that a weapon.
     *
     * Nothing here says "archive": from the user's side the chore is gone. The copy does promise
     * that already-logged points survive, which is the part they can observe.
     */
    deleteActivity: build.mutation<void, { id: number }>({
      query: ({ id }) => ({ url: `/api/activities/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Activity'],
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
  usePartnerActivityLogsQuery,
  usePendingApprovalsQuery,
  useApproveLogMutation,
  useRejectLogMutation,
  useBulkApproveMutation,
  useCreateActivityMutation,
  useUpdateActivityMutation,
  useDeleteActivityMutation,
  useCreateActivityLogMutation,
} = activityApi
