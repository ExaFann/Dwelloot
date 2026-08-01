// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeStore } from '../../app/store'
import { authApi } from './authApi'
import { signedIn, signedOut } from './authSlice'

/**
 * The two behaviours that only exist once auth is wired: the token reaching the wire, and the 401
 * rule that finding 1 in log `042` forced.
 */

type StubResponse = { status: number; body: unknown }

function stubFetch(...responses: StubResponse[]) {
  const requests: Request[] = []
  let call = 0
  const spy = vi.fn((input: Request) => {
    requests.push(input)
    const { status, body } = responses[Math.min(call++, responses.length - 1)]
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  })
  vi.stubGlobal('fetch', spy)
  return { spy, requests }
}

const OK_LOGIN = {
  status: 200,
  body: { token: 'jwt.signed.token', user: { id: 7, name: 'Alex' } },
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the token reaches the wire', () => {
  it('sends Authorization: Bearer when signed in', async () => {
    const { requests } = stubFetch({ status: 200, body: { id: 7 } })
    const store = makeStore()
    store.dispatch(signedIn({ token: 'jwt.signed.token', user: { id: 7, name: 'Alex' } }))

    await store.dispatch(authApi.endpoints.me.initiate())

    expect(requests[0].headers.get('Authorization')).toBe('Bearer jwt.signed.token')
  })

  // The other direction. A helper that always appended a header would pass the test above.
  it('sends no Authorization header when signed out', async () => {
    const { requests } = stubFetch({ status: 401, body: { error: 'Authentication is required.' } })
    const store = makeStore()

    await store.dispatch(authApi.endpoints.me.initiate())

    expect(requests[0].headers.get('Authorization')).toBeNull()
  })

  it('stops sending it after signing out', async () => {
    const { requests } = stubFetch({ status: 200, body: { id: 7 } })
    const store = makeStore()
    store.dispatch(signedIn({ token: 'jwt.signed.token', user: { id: 7, name: 'Alex' } }))
    store.dispatch(signedOut())

    await store.dispatch(authApi.endpoints.me.initiate())

    expect(requests[0].headers.get('Authorization')).toBeNull()
  })
})

describe('401 handling', () => {
  /**
   * A 60-minute JWT with no refresh simply dies. The only correct response on an authenticated
   * request is to clear the session, or the app keeps rendering as signed in while everything fails.
   */
  it('signs the user out when an authenticated request is rejected', async () => {
    stubFetch({ status: 401, body: { error: 'Authentication is required.', errors: null } })
    const store = makeStore()
    store.dispatch(signedIn({ token: 'expired.jwt', user: { id: 7, name: 'Alex' } }))

    await store.dispatch(authApi.endpoints.me.initiate())

    expect(store.getState().auth.token).toBeNull()
    expect(localStorage.getItem('dwelloot.session')).toBeNull()
  })

  /**
   * Finding 1: **a failed login also returns 401**, with `Invalid email or password.` A blanket rule
   * would treat a mistyped password as a session expiry. This is the assertion that would fail if
   * the endpoint exclusion were removed.
   */
  it('does NOT sign the user out when a login is rejected', async () => {
    stubFetch({ status: 401, body: { error: 'Invalid email or password.', errors: null } })
    const store = makeStore()
    store.dispatch(signedIn({ token: 'still.valid.jwt', user: { id: 7, name: 'Alex' } }))

    await store
      .dispatch(authApi.endpoints.login.initiate({ email: 'a@b.c', password: 'wrong' }))
      .catch(() => undefined)

    expect(store.getState().auth.token).toBe('still.valid.jwt')
  })

  it('does NOT sign the user out when a registration is rejected', async () => {
    stubFetch({ status: 401, body: { error: 'Nope.', errors: null } })
    const store = makeStore()
    store.dispatch(signedIn({ token: 'still.valid.jwt', user: { id: 7, name: 'Alex' } }))

    await store
      .dispatch(
        authApi.endpoints.register.initiate({ name: 'A', email: 'a@b.c', password: 'password1' }),
      )
      .catch(() => undefined)

    expect(store.getState().auth.token).toBe('still.valid.jwt')
  })

  // Both directions on the status, too: only 401 should sign out.
  it.each([400, 403, 404, 409, 423, 500])('leaves the session alone on %i', async (status) => {
    stubFetch({ status, body: { error: 'Something else.', errors: null } })
    const store = makeStore()
    store.dispatch(signedIn({ token: 'valid.jwt', user: { id: 7, name: 'Alex' } }))

    await store.dispatch(authApi.endpoints.me.initiate())

    expect(store.getState().auth.token).toBe('valid.jwt')
  })
})

describe('login', () => {
  it('stores the session on success', async () => {
    stubFetch(OK_LOGIN)
    const store = makeStore()

    await store.dispatch(authApi.endpoints.login.initiate({ email: 'a@b.c', password: 'pw' }))

    expect(store.getState().auth).toEqual({
      token: 'jwt.signed.token',
      user: { id: 7, name: 'Alex' },
    })
    expect(localStorage.getItem('dwelloot.session')).toContain('jwt.signed.token')
  })

  it('posts to the documented path', async () => {
    const { requests } = stubFetch(OK_LOGIN)
    const store = makeStore()

    await store.dispatch(authApi.endpoints.login.initiate({ email: 'a@b.c', password: 'pw' }))

    expect(requests[0].url).toContain('/api/auth/login')
    expect(requests[0].method).toBe('POST')
  })

  it('leaves the session empty when login fails', async () => {
    stubFetch({ status: 401, body: { error: 'Invalid email or password.', errors: null } })
    const store = makeStore()

    await store
      .dispatch(authApi.endpoints.login.initiate({ email: 'a@b.c', password: 'wrong' }))
      .catch(() => undefined)

    expect(store.getState().auth.token).toBeNull()
  })
})
