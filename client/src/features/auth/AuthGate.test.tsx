// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { makeStore } from '../../app/store'
import { routes } from '../../app/routes'
import { signedIn } from './authSlice'

/**
 * The 3×3 decision table from log `043`, every cell asserted.
 *
 * Redirect cells assert **both** that the destination was reached and that the protected content was
 * not rendered. The second half matters: a gate that renders the page *and* redirects passes a
 * destination-only check while flashing content and firing its queries.
 */

const SIGNED_IN_USER = { id: 7, name: 'Alex' }

type MeShape = { householdId: number | null }

/**
 * Routed **by path**, and `response` applies only to `/api/auth/me` — the thing these tests are
 * about.
 *
 * It used to answer every request with that one body, which was harmless while the guarded pages
 * fetched nothing of their own. Once [46]–[48] gave them queries, `/api/activities` resolved to the
 * `/me` object, `data.items.length` threw, and the route rendered its error element instead of the
 * page. It surfaced as a **flake**, because the heading under assertion is static markup: passing
 * depended on whether the assertion won the race against the crash.
 *
 * This is the second time the same lying stub has been found — `routes.test.tsx` had it too, fixed
 * during [46]. **A stub that answers a path it was never told about is a lie with a delayed fuse.**
 */
function stubMe(response: { status: number; body: unknown } | 'never') {
  const requests: Request[] = []
  const empty = (body: unknown) =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

  const spy = vi.fn((input: Request) => {
    requests.push(input)
    const path = new URL(input.url).pathname

    if (path === '/api/auth/me') {
      if (response === 'never') return new Promise<Response>(() => {}) // stays pending
      return Promise.resolve(
        new Response(JSON.stringify(response.body), {
          status: response.status,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    }

    // Everything the guarded pages fetch. Shapes, not contents — these tests are about routing.
    if (path.endsWith('/competitions/current')) {
      return empty({
        periodType: 'Daily',
        periodStart: '2026-08-03T12:00:00Z',
        periodEnd: '2026-08-04T12:00:00Z',
        myPoints: 0,
        partnerPoints: 0,
        settled: false,
        voided: false,
        unopenedLootBox: null,
      })
    }
    if (path.startsWith('/api/households/')) {
      return empty({ id: 10, name: 'House', inviteCode: 'X', members: [{ id: 7, name: 'Alex' }] })
    }
    return empty({ items: [], total: 0 })
  })

  vi.stubGlobal('fetch', spy)
  return { spy, requests }
}

function meBody({ householdId }: MeShape) {
  return {
    id: 7,
    name: 'Alex',
    email: 'alex@example.com',
    householdId,
    lifetimePoints: 0,
    coins: 0,
    currentWinStreak: 0,
  }
}

function renderAt(path: string, { signedInAs }: { signedInAs?: boolean } = {}) {
  const store = makeStore()
  if (signedInAs) store.dispatch(signedIn({ token: 'jwt.token', user: SIGNED_IN_USER }))
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  )
  return { store, router }
}

const at = (router: { state: { location: { pathname: string } } }) => router.state.location.pathname

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

// ─── Column 1: not signed in ──────────────────────────────────────────────────

describe('not signed in', () => {
  it.each(['/', '/log', '/notices', '/store', '/me'])('%s redirects to /login', async (path) => {
    stubMe('never')
    const { router } = renderAt(path)

    await waitFor(() => expect(at(router)).toBe('/login'))
    // The other half: the protected screen must not have rendered on the way past.
    expect(screen.queryByRole('navigation', { name: 'Primary' })).not.toBeInTheDocument()
  })

  it('/pairing redirects to /login', async () => {
    stubMe('never')
    const { router } = renderAt('/pairing')
    await waitFor(() => expect(at(router)).toBe('/login'))
  })

  it.each(['/login', '/register'])('%s renders', async (path) => {
    stubMe('never')
    renderAt(path)
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument()
  })

  /**
   * A skipped query that is not actually skipped only shows up as a spurious 401 — which would then
   * fire `baseApi`'s auto-logout against someone who is already signed out.
   */
  it('never requests /me', async () => {
    const { requests } = stubMe('never')
    renderAt('/login')
    await screen.findByRole('heading', { level: 1 })
    expect(requests).toHaveLength(0)
  })
})

// ─── Column 2: signed in, no household ────────────────────────────────────────

describe('signed in, no household', () => {
  it.each(['/', '/log', '/notices', '/store', '/me'])('%s redirects to /pairing', async (path) => {
    stubMe({ status: 200, body: meBody({ householdId: null }) })
    const { router } = renderAt(path, { signedInAs: true })

    await waitFor(() => expect(at(router)).toBe('/pairing'))
    expect(screen.queryByRole('navigation', { name: 'Primary' })).not.toBeInTheDocument()
  })

  it('/pairing renders', async () => {
    stubMe({ status: 200, body: meBody({ householdId: null }) })
    renderAt('/pairing', { signedInAs: true })
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Set up a household' }),
    ).toBeInTheDocument()
  })

  it.each(['/login', '/register'])('%s redirects to /pairing', async (path) => {
    stubMe({ status: 200, body: meBody({ householdId: null }) })
    const { router } = renderAt(path, { signedInAs: true })
    await waitFor(() => expect(at(router)).toBe('/pairing'))
  })
})

// ─── Column 3: signed in, has household ───────────────────────────────────────

describe('signed in, has household', () => {
  it.each([
    ['/', 'Home'],
    ['/log', 'Log a chore'],
    ['/notices', 'Notices'],
    ['/store', 'Store'],
    ['/me', 'Me'],
  ])('%s renders %s', async (path, heading) => {
    stubMe({ status: 200, body: meBody({ householdId: 10 }) })
    renderAt(path, { signedInAs: true })
    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument()
  })

  /** Otherwise a paired user could create or join a second household. */
  it('/pairing redirects to /', async () => {
    stubMe({ status: 200, body: meBody({ householdId: 10 }) })
    const { router } = renderAt('/pairing', { signedInAs: true })
    await waitFor(() => expect(at(router)).toBe('/'))
  })

  it.each(['/login', '/register'])('%s redirects to /', async (path) => {
    stubMe({ status: 200, body: meBody({ householdId: 10 }) })
    const { router } = renderAt(path, { signedInAs: true })
    await waitFor(() => expect(at(router)).toBe('/'))
    // A signed-in user must not be shown a login form.
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
  })
})

// ─── The states between the columns ───────────────────────────────────────────

describe('while /me is in flight', () => {
  it('shows a loading state and not the protected screen', async () => {
    stubMe('never')
    renderAt('/', { signedInAs: true })

    expect(await screen.findByRole('status')).toHaveTextContent(/loading/i)
    // Rendering optimistically would flash the dashboard before bouncing an unpaired user away.
    expect(screen.queryByRole('navigation', { name: 'Primary' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1, name: 'Home' })).not.toBeInTheDocument()
  })
})

describe('when /me fails for a reason other than a dead session', () => {
  it('shows the error and stays put rather than redirecting to /pairing', async () => {
    stubMe({ status: 500, body: { error: 'An unexpected error occurred.', errors: null } })
    const { router } = renderAt('/store', { signedInAs: true })

    expect(await screen.findByRole('alert')).toHaveTextContent('An unexpected error occurred.')
    // A failed request means the household is *unknown*, not absent. Redirecting would tell a user
    // with a perfectly good household to go and create another one.
    expect(at(router)).toBe('/store')
  })

  it('offers a retry', async () => {
    stubMe({ status: 500, body: { error: 'An unexpected error occurred.', errors: null } })
    renderAt('/store', { signedInAs: true })
    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument()
  })
})

describe('when /me returns 401', () => {
  /** No branch in AuthGate handles this — `baseApi` signs the user out and the gate re-renders. */
  it('signs the user out and lands on /login', async () => {
    stubMe({ status: 401, body: { error: 'Authentication is required.', errors: null } })
    const { router, store } = renderAt('/', { signedInAs: true })

    await waitFor(() => expect(at(router)).toBe('/login'))
    expect(store.getState().auth.token).toBeNull()
  })
})

// ─── The destination is preserved ─────────────────────────────────────────────

describe('the requested destination survives a redirect', () => {
  it('is carried in location state', async () => {
    stubMe('never')
    const { router } = renderAt('/store')

    await waitFor(() => expect(at(router)).toBe('/login'))
    expect(router.state.location.state).toMatchObject({ from: { pathname: '/store' } })
  })

  it('is where the user lands after signing in', async () => {
    const requests: Request[] = []
    let call = 0
    vi.stubGlobal(
      'fetch',
      vi.fn((input: Request) => {
        requests.push(input)
        const path = new URL(input.url).pathname
        if (path === '/api/auth/login') {
          call++
          return Promise.resolve(
            new Response(JSON.stringify({ token: 'jwt.token', user: SIGNED_IN_USER }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
          )
        }
        return Promise.resolve(
          new Response(JSON.stringify(meBody({ householdId: 10 })), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
      }),
    )

    const { router } = renderAt('/store')
    await waitFor(() => expect(at(router)).toBe('/login'))

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Email'), 'alex@example.com')
    await user.type(screen.getByLabelText('Password'), 'Passw0rd!23')
    await user.click(screen.getByRole('button', { name: /log in/i }))

    // Not '/'. Discarding the requested path is the bug this guards.
    await waitFor(() => expect(at(router)).toBe('/store'))
    expect(call).toBe(1)
  })
})

// ─── Sign out ─────────────────────────────────────────────────────────────────

describe('signing out', () => {
  it('clears state and storage, and the gate redirects to /login', async () => {
    stubMe({ status: 200, body: meBody({ householdId: 10 }) })
    const { router, store } = renderAt('/me', { signedInAs: true })

    await screen.findByRole('button', { name: /sign out/i })
    expect(localStorage.getItem('dwelloot.session')).not.toBeNull()

    await userEvent.setup().click(screen.getByRole('button', { name: /sign out/i }))

    await waitFor(() => expect(at(router)).toBe('/login'))
    expect(store.getState().auth.token).toBeNull()
    expect(localStorage.getItem('dwelloot.session')).toBeNull()
  })

  /**
   * RTK Query's cache is keyed by endpoint and argument, not by user, so without `resetApiState` the
   * next person to sign in on this device sees the previous user's `/me` until it refetches.
   */
  it('empties the API cache', async () => {
    stubMe({ status: 200, body: meBody({ householdId: 10 }) })
    const { store } = renderAt('/me', { signedInAs: true })

    await screen.findByRole('button', { name: /sign out/i })
    await waitFor(() => expect(Object.keys(store.getState().api.queries)).not.toHaveLength(0))

    await userEvent.setup().click(screen.getByRole('button', { name: /sign out/i }))

    await waitFor(() => expect(Object.keys(store.getState().api.queries)).toHaveLength(0))
  })
})
