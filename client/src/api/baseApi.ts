import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query'
import { API_BASE_URL } from './config'
import { signedOut } from '../features/auth/authSlice'

/**
 * The base RTK Query slice. Endpoints are added by feature files with `injectEndpoints`.
 *
 * Injection rather than one slice: every endpoint in a single module would be a very large file by
 * [56], and every feature task would edit it.
 */

/**
 * Cache tags, taken from `api-design.md`'s quick reference rather than invented.
 *
 * Declared in full here because `injectEndpoints` **cannot extend this list** — a tag an injected
 * endpoint uses but that is missing here is silently ignored, so the invalidation never fires and
 * the screen shows stale data with nothing logged.
 */
export const API_TAGS = [
  'Me',
  'Household',
  'Activity',
  'ActivityLog',
  'Competition',
  'Reward',
  'Redemption',
  'Badge',
] as const

/**
 * Endpoints where a 401 is a *rejected credential*, not a dead session.
 *
 * `POST /api/auth/login` answers **401 "Invalid email or password."** — the same status as the
 * **401 "Authentication is required."** an expired token produces (verified against the running API
 * in task [42]). A blanket "401 means log out" rule would therefore treat a mistyped password as a
 * session expiry.
 *
 * Keyed on the endpoint name rather than the URL: RTK Query already knows which endpoint it is
 * running, and URL matching would break the moment a path changed.
 */
const CREDENTIAL_ENDPOINTS = new Set(['login', 'register'])

const rawBaseQuery = fetchBaseQuery({
  baseUrl: API_BASE_URL,
  /**
   * No `credentials` option, deliberately. Authentication is a bearer token in the `Authorization`
   * header, never a cookie — which is why the backend's CORS policy omits `AllowCredentials`
   * (handover §3.2). Setting `credentials: 'include'` would ask the browser to send cookies
   * cross-origin, the preflight would fail against that policy, and the fix would look like a
   * server problem.
   */
  prepareHeaders: (headers, { getState }) => {
    /**
     * Typed structurally rather than with `RootState`, which would be a cycle:
     * `store` → `baseApi` → `store`. This is the one place the store's shape is asserted instead of
     * inferred, and it is narrow enough to be obvious if it drifts.
     */
    const token = (getState() as { auth: { token: string | null } }).auth.token
    if (token) headers.set('Authorization', `Bearer ${token}`)
    return headers
  },
})

/**
 * Signs the user out when the server rejects the session.
 *
 * There is no refresh token — a 60-minute JWT simply dies (handover §3.2) — so the only correct
 * response to a 401 on an authenticated request is to clear the session and let the user sign in
 * again. Without this the app would keep rendering as though signed in while every request failed.
 */
const baseQueryWithAuth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
  args,
  api,
  extraOptions,
) => {
  const result = await rawBaseQuery(args, api, extraOptions)

  if (result.error?.status === 401 && !CREDENTIAL_ENDPOINTS.has(api.endpoint)) {
    api.dispatch(signedOut())
  }

  return result
}

export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithAuth,
  tagTypes: API_TAGS,
  endpoints: () => ({}),
})
