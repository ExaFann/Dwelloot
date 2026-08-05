// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { Provider } from 'react-redux'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { routes } from './routes'
import { makeStore } from './store'
import { signedIn } from '../features/auth/authSlice'

/**
 * The route skeleton.
 *
 * Every expectation below is a **literal** — the paths, the headings and the hrefs are written out
 * here rather than read from `routes`. Deriving them from the table under test would produce a suite
 * that passes against any route table at all, which is the first row of the handover's §5.1
 * taxonomy: an expectation derived from the constant under test.
 */

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/**
 * Wrapped in `<Provider>` since [42], and given a session since [43].
 *
 * These tests are about **routing and layout**, so each render is set up with whatever auth state
 * that route requires — the guard's own behaviour is `AuthGate.test.tsx`'s subject. Defaulting to a
 * fully paired user keeps every assertion here about the thing it was written to check.
 */
function renderAt(path: string, householdId: number | null = 10) {
  /**
   * Routed **by path**. It used to answer every request with the `/me` body, which was harmless
   * until [46] gave the dashboard its own queries — `/api/activities` then resolved to an object
   * with no `items`, `data.items.length` threw, and the route rendered its error element instead of
   * the page.
   *
   * It surfaced as a *flake*: the `h1` is static, so whether the test passed depended on whether the
   * assertion won the race against the crash. Passed alone, failed under full-suite load.
   */
  const json = (body: unknown) =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

  vi.stubGlobal(
    'fetch',
    vi.fn((input: Request) => {
      const requestPath = new URL(input.url).pathname
      if (requestPath === '/api/activities') return json({ items: [], total: 0 })
      if (requestPath === '/api/activity-logs/mine') return json({ items: [], total: 0 })
      /*
       * The approval queue, which every screen now requests: `BottomNav` reads it for the Notices
       * badge, so it is part of the shell rather than of one page.
       */
      if (requestPath === '/api/activity-logs') return json({ items: [], total: 0 })
      if (requestPath === '/api/redemptions' || requestPath === '/api/redemptions/mine') {
        return json({ items: [], total: 0 })
      }
      if (requestPath === '/api/badges') return json({ items: [] })
      if (requestPath.endsWith('/competitions/current')) {
        return json({
          periodType: 'Daily',
          periodStart: '2026-08-02T12:00:00Z',
          periodEnd: '2026-08-03T12:00:00Z',
          myPoints: 0,
          partnerPoints: 0,
          settled: false,
          voided: false,
          unopenedLootBox: null,
        })
      }
      if (requestPath.startsWith('/api/households/')) {
        return json({ id: 10, name: 'House', inviteCode: 'ABC123', members: [{ id: 7, name: 'Alex' }] })
      }
      if (requestPath === '/api/auth/me') {
        return json({
          id: 7,
          name: 'Alex',
          email: 'alex@example.com',
          householdId,
          lifetimePoints: 0,
          coins: 0,
          currentWinStreak: 0,
        })
      }
      /*
       * **A 404, not the `/me` body.** The catch-all used to answer every unknown path with the
       * caller — the "lie with a delayed fuse" from log `048`, and the direct cause of this file
       * flaking through [46]–[48]. Adding a query to a shared component (here `BottomNav`) is
       * exactly how a new path arrives, so the fallback has to be honest about not knowing it.
       */
      return Promise.resolve(
        new Response(JSON.stringify({ error: 'That endpoint does not exist.', errors: null }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    }),
  )

  const store = makeStore()
  // `/login` and `/register` are the signed-out screens; everything else needs a session.
  if (path !== '/login' && path !== '/register') {
    store.dispatch(signedIn({ token: 'jwt.token', user: { id: 7, name: 'Alex' } }))
  }

  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  )
  return router
}

/** path → the `h1` that path must render. Written by hand from wireframes.md and api-design.md. */
const APP_SCREENS = [
  ['/', 'Home'],
  ['/log', 'Log a chore'],
  ['/notices', 'Notices'],
  ['/store', 'Store'],
  ['/me', 'Me'],
] as const

const BARE_SCREENS = [
  ['/login', 'Log in'],
  ['/register', 'Create an account'],
] as const

/** Reachable only while signed in without a household, so it needs its own setup. */
const PAIRING_SCREEN = ['/pairing', 'Set up a household'] as const

describe('every screen is reachable', () => {
  it.each([...APP_SCREENS, ...BARE_SCREENS])('%s renders "%s"', async (path, heading) => {
    renderAt(path)
    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument()
  })

  it('/pairing renders "Set up a household"', async () => {
    renderAt(PAIRING_SCREEN[0], null)
    expect(
      await screen.findByRole('heading', { level: 1, name: PAIRING_SCREEN[1] }),
    ).toBeInTheDocument()
  })

  it('all five wireframe screens plus the three onboarding screens exist', () => {
    // Pins the count, so deleting a route from the table fails here rather than silently reducing
    // what `it.each` covers. Onboarding is 3: the two bare screens plus pairing, which is tested
    // separately because it needs a signed-in-but-unpaired session.
    expect(APP_SCREENS).toHaveLength(5)
    expect(BARE_SCREENS).toHaveLength(2)
    expect(PAIRING_SCREEN).toHaveLength(2)
  })
})

describe('the navigation appears exactly where it should', () => {
  it.each(APP_SCREENS)('%s shows the primary nav', async (path) => {
    renderAt(path)
    expect(await screen.findByRole('navigation', { name: 'Primary' })).toBeInTheDocument()
  })

  // The other direction. "Nav renders" alone passes against a layout that renders it everywhere,
  // including on the login screen of a signed-out user.
  it.each([...BARE_SCREENS.map(([p]) => p), '/no-such-page'] as string[])(
    '%s shows no nav',
    async (path) => {
      renderAt(path)
      // Wait for the screen itself first — asserting an absence against an empty document would
      // pass whatever the layout did.
      await screen.findByRole('heading', { level: 1 })
      expect(screen.queryByRole('navigation', { name: 'Primary' })).not.toBeInTheDocument()
    },
  )
})

describe('the active tab is marked, and only the active tab', () => {
  it.each(APP_SCREENS)('%s marks exactly one link as current', async (path) => {
    renderAt(path)
    const nav = await screen.findByRole('navigation', { name: 'Primary' })
    const current = within(nav)
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page')
    expect(current).toHaveLength(1)
  })

  it.each([
    ['/', 'Home'],
    ['/log', 'Log'],
    ['/notices', 'Notices'],
    ['/store', 'Store'],
    ['/me', 'Me'],
  ])('%s marks the %s tab', async (path, label) => {
    renderAt(path)
    const nav = await screen.findByRole('navigation', { name: 'Primary' })
    expect(within(nav).getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page')
  })

  /**
   * The `end` prop on the dashboard link. Without it `/` matches every path as a prefix, so Home
   * stays highlighted on all five screens — and the "exactly one is current" test above is what
   * catches that, but only if this case is exercised from a non-root path.
   */
  it('does not leave Home marked while on another tab', async () => {
    renderAt('/store')
    const nav = await screen.findByRole('navigation', { name: 'Primary' })
    expect(within(nav).getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current')
  })
})

describe('the navigation links point where their labels say', () => {
  it.each([
    ['Home', '/'],
    ['Log', '/log'],
    ['Notices', '/notices'],
    ['Store', '/store'],
    ['Me', '/me'],
  ])('%s → %s', async (label, href) => {
    renderAt('/')
    const nav = await screen.findByRole('navigation', { name: 'Primary' })
    expect(within(nav).getByRole('link', { name: label })).toHaveAttribute('href', href)
  })

  it('has five tabs and no more', async () => {
    renderAt('/')
    const nav = await screen.findByRole('navigation', { name: 'Primary' })
    expect(within(nav).getAllByRole('link')).toHaveLength(5)
  })
})

describe('unknown paths', () => {
  it.each(['/no-such-page', '/store/42/nope', '/log/extra'])('%s reaches Not found', (path) => {
    renderAt(path)
    expect(screen.getByRole('heading', { level: 1, name: 'Nothing here' })).toBeInTheDocument()
  })

  /**
   * Pins a React Router default that is easy to be surprised by: matching is **case-insensitive**
   * unless a route sets `caseSensitive: true`, so `/LOG` is the Log screen rather than a 404.
   *
   * Left as the default deliberately — it is forgiving for a hand-typed URL and this is an
   * authenticated SPA with no canonical-URL concern. Recorded as a test because it was found by a
   * failing assertion that expected the opposite, and the next person will assume the same thing.
   */
  it('matches case-insensitively, so /LOG is the Log screen and not a 404', async () => {
    renderAt('/LOG')
    expect(await screen.findByRole('heading', { level: 1, name: 'Log a chore' })).toBeInTheDocument()
  })

  // A missing catch-all renders nothing at all, which is easy to mistake for a styling problem.
  it('does not silently fall through to the dashboard', () => {
    renderAt('/no-such-page')
    expect(screen.queryByRole('heading', { level: 1, name: 'Home' })).not.toBeInTheDocument()
  })

  it('offers a way back, since the bare layout has no navigation', () => {
    renderAt('/no-such-page')
    expect(screen.getByRole('link', { name: /back to home/i })).toHaveAttribute('href', '/')
  })
})

describe('the app shell', () => {
  it('puts a skip link first, ahead of the five nav tabs', async () => {
    renderAt('/')
    await screen.findByRole('navigation', { name: 'Primary' })
    const links = screen.getAllByRole('link')
    expect(links[0]).toHaveAccessibleName(/skip to content/i)
    expect(links[0]).toHaveAttribute('href', '#main')
  })

  it('has a main landmark for the skip link to reach', async () => {
    renderAt('/')
    expect(await screen.findByRole('main')).toHaveAttribute('id', 'main')
  })

  it('gives bare screens a main landmark too', async () => {
    renderAt('/login')
    expect(await screen.findByRole('main')).toBeInTheDocument()
  })
})
