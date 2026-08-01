import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeStore } from './store'
import { API_TAGS, baseApi } from '../api/baseApi'
import { DEV_FALLBACK_BASE_URL } from '../api/config'

/**
 * Small checks on wiring that fails quietly.
 *
 * A store missing `baseApi.middleware` still constructs and still builds. It only misbehaves later,
 * when a query dispatches and never resolves — which reads as a network problem.
 */

/**
 * A throwaway endpoint, injected here and nowhere else, so the store can be exercised end to end
 * before [42] adds a real one. Injecting onto the real `baseApi` is the point: a probe on a separate
 * `createApi` instance would prove nothing about the slice the app actually uses.
 */
const probeApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    probe: build.query<{ ok: boolean }, void>({ query: () => '/api/probe' }),
  }),
})

/** Replaces `fetch` and records the `Request` objects RTK Query builds. */
function stubFetch(body: unknown = { ok: true }) {
  const requests: Request[] = []
  const spy = vi.fn((input: Request) => {
    requests.push(input)
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  })
  vi.stubGlobal('fetch', spy)
  return { spy, requests }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the store', () => {
  it('registers the API reducer under its own path', () => {
    const state = makeStore().getState()
    expect(state).toHaveProperty(baseApi.reducerPath)
  })

  it('runs the API middleware, so a dispatched query actually resolves', async () => {
    const { spy } = stubFetch()

    const store = makeStore()
    const result = await store.dispatch(probeApi.endpoints.probe.initiate())

    // Without the middleware the thunk never reaches the base query and `data` stays undefined.
    expect(result.data).toEqual({ ok: true })
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('prepends the resolved base URL to endpoint paths', async () => {
    const { requests } = stubFetch()

    const store = makeStore()
    await store.dispatch(probeApi.endpoints.probe.initiate())

    // The assertion that catches a base URL which silently resolved to '' — that would make every
    // request relative, hit the SPA fallback, and return index.html with a 200.
    expect(requests[0].url).toBe(`${DEV_FALLBACK_BASE_URL}/api/probe`)
  })

  it('sends no cookies, since auth is a bearer token and CORS omits AllowCredentials', async () => {
    const { requests } = stubFetch()

    const store = makeStore()
    await store.dispatch(probeApi.endpoints.probe.initiate())

    expect(requests[0].credentials).not.toBe('include')
  })

  it('hands out an independent store each time', () => {
    // Tests need isolation: RTK Query caches across dispatches, so a shared store would leak one
    // test's cached responses into the next.
    expect(makeStore()).not.toBe(makeStore())
  })
})

describe('cache tags', () => {
  /**
   * `injectEndpoints` cannot extend `tagTypes`. A tag an injected endpoint provides or invalidates
   * but that is missing here is **silently ignored** — the invalidation never fires, the screen
   * keeps showing stale data, and nothing is logged.
   */
  it('declares one tag per entity in api-design.md', () => {
    expect([...API_TAGS]).toEqual([
      'Me',
      'Household',
      'Activity',
      'ActivityLog',
      'Competition',
      'Reward',
      'Redemption',
      'Badge',
    ])
  })

  it('has no duplicates', () => {
    expect(new Set(API_TAGS).size).toBe(API_TAGS.length)
  })
})
