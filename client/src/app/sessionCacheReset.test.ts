import { describe, expect, it, vi } from 'vitest'
import type { Middleware } from '@reduxjs/toolkit'
import { sessionCacheReset } from './sessionCacheReset'
import { baseApi } from '../api/baseApi'
import { signedIn, signedOut } from '../features/auth/authSlice'

/**
 * The session cache reset — task [86].
 *
 * The owner's report: "Authentication is required." on the dashboard for a few seconds after
 * logging in, healing on its own. It was a cached 401 from the *previous* session being replayed —
 * `resetApiState` was wired to the Sign out button only, so the two paths that matter more (the
 * automatic 401 logout, and signing back in) left every error entry in place.
 *
 * Tested as a middleware rather than through a store-and-fetch round trip: the rule is "this action
 * means the cache is about someone else", which is a statement about actions. Driving a real query
 * to a rejected cache entry first would test RTK Query's plumbing, not this decision — and
 * `initiate()` does not issue a request in this environment anyway, which would have made the
 * assertions vacuous in the quiet way §7.1 catalogues.
 */

const RESET = baseApi.util.resetApiState().type

/** Runs one action through the middleware and reports what it dispatched, in order. */
function run(action: unknown): { dispatched: string[]; reachedReducer: boolean } {
  const dispatched: string[] = []
  let reachedReducer = false

  const store = {
    dispatch: (next: { type: string }) => dispatched.push(next.type),
    getState: () => ({}),
  } as unknown as Parameters<Middleware>[0]

  const invoke = sessionCacheReset(store)((passed) => {
    reachedReducer = true
    return passed
  })
  invoke(action)

  return { dispatched, reachedReducer }
}

describe('the API cache follows the session', () => {
  /** The path that had no reset: `baseApi` dispatches this itself on any non-credential 401. */
  it('empties the cache when the session ends', () => {
    expect(run(signedOut()).dispatched).toContain(RESET)
  })

  /**
   * And the other half. Signing out already leaves nothing on screen, so the entries that survive
   * it are precisely the ones the *next* sign-in would be shown — which is the reported bug.
   */
  it('empties the cache when a new session begins', () => {
    expect(run(signedIn({ token: 't', user: { id: 1, name: 'Alex' } })).dispatched).toContain(RESET)
  })

  /**
   * Both directions. A middleware that reset on *every* action would pass the two above and make
   * the app unusable — every unrelated dispatch would throw away the cache and refetch the screen.
   */
  it('leaves the cache alone for anything else', () => {
    expect(run({ type: 'theme/themeModeChanged', payload: 'dark' }).dispatched).not.toContain(RESET)
  })

  /** It is a middleware, not an interceptor: the action must still reach the reducers. */
  it.each([
    ['signedOut', signedOut()],
    ['signedIn', signedIn({ token: 't', user: { id: 1, name: 'Alex' } })],
    ['an unrelated action', { type: 'theme/themeModeChanged' }],
  ])('passes %s along the chain', (_name, action) => {
    expect(run(action).reachedReducer).toBe(true)
  })

  /**
   * Order matters and is easy to get backwards: the reset's refetches must start *after* the auth
   * state has changed, or a restarted query would go out with the old token and 401 — recreating
   * the bug this fixes.
   */
  it('resets only after the action has reached the reducers', () => {
    const order: string[] = []
    const store = {
      dispatch: () => order.push('reset'),
      getState: () => ({}),
    } as unknown as Parameters<Middleware>[0]

    sessionCacheReset(store)(() => order.push('reducer'))(signedIn({
      token: 't',
      user: { id: 1, name: 'Alex' },
    }))

    expect(order).toEqual(['reducer', 'reset'])
  })
})

describe('the sign-out button still resets explicitly', () => {
  /**
   * Belt and braces, and deliberately not removed: the button's own `resetApiState` is now a no-op
   * duplicate, but it is also the line that documents the rule at the place a reader looks first.
   * This asserts the middleware makes it redundant rather than that it was deleted.
   */
  it('is redundant, not required', () => {
    const spy = vi.fn()
    const store = { dispatch: spy, getState: () => ({}) } as unknown as Parameters<Middleware>[0]
    sessionCacheReset(store)((a) => a)(signedOut())

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0].type).toBe(RESET)
  })
})
