import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'
import { API_BASE_URL } from './config'

/**
 * The base RTK Query slice. **No endpoints** — feature files add their own with
 * `baseApi.injectEndpoints`, starting with auth in [42].
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

export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({
    baseUrl: API_BASE_URL,
    /**
     * No `credentials` option, deliberately. Authentication is a bearer token in the `Authorization`
     * header, never a cookie — which is why the backend's CORS policy omits `AllowCredentials`
     * (handover §3.2). Setting `credentials: 'include'` here would ask the browser to send cookies
     * cross-origin, the preflight would fail against that policy, and the fix would look like a
     * server problem. [42] adds `prepareHeaders` for the token.
     */
  }),
  tagTypes: API_TAGS,
  endpoints: () => ({}),
})
