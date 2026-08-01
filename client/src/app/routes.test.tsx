// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { Provider } from 'react-redux'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { routes } from './routes'
import { makeStore } from './store'

/**
 * The route skeleton.
 *
 * Every expectation below is a **literal** — the paths, the headings and the hrefs are written out
 * here rather than read from `routes`. Deriving them from the table under test would produce a suite
 * that passes against any route table at all, which is the first row of the handover's §5.1
 * taxonomy: an expectation derived from the constant under test.
 */

afterEach(cleanup)

/**
 * Wrapped in `<Provider>` since [42]: `/login` and `/register` are real forms now and call RTK Query
 * hooks, which throw without a store. A fresh store per render keeps cached responses from leaking
 * between cases.
 */
function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  return render(
    <Provider store={makeStore()}>
      <RouterProvider router={router} />
    </Provider>,
  )
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
  ['/pairing', 'Set up a household'],
] as const

describe('every screen is reachable', () => {
  it.each([...APP_SCREENS, ...BARE_SCREENS])('%s renders "%s"', (path, heading) => {
    renderAt(path)
    expect(screen.getByRole('heading', { level: 1, name: heading })).toBeInTheDocument()
  })

  it('all five wireframe screens plus the three onboarding screens exist', () => {
    // Pins the count, so deleting a route from the table fails here rather than silently reducing
    // what `it.each` covers.
    expect(APP_SCREENS).toHaveLength(5)
    expect(BARE_SCREENS).toHaveLength(3)
  })
})

describe('the navigation appears exactly where it should', () => {
  it.each(APP_SCREENS)('%s shows the primary nav', (path) => {
    renderAt(path)
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument()
  })

  // The other direction. "Nav renders" alone passes against a layout that renders it everywhere,
  // including on the login screen of a signed-out user.
  it.each([...BARE_SCREENS.map(([p]) => p), '/no-such-page'] as string[])('%s shows no nav', (path) => {
    renderAt(path)
    expect(screen.queryByRole('navigation', { name: 'Primary' })).not.toBeInTheDocument()
  })
})

describe('the active tab is marked, and only the active tab', () => {
  it.each(APP_SCREENS)('%s marks exactly one link as current', (path) => {
    renderAt(path)
    const nav = screen.getByRole('navigation', { name: 'Primary' })
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
  ])('%s marks the %s tab', (path, label) => {
    renderAt(path)
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(within(nav).getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page')
  })

  /**
   * The `end` prop on the dashboard link. Without it `/` matches every path as a prefix, so Home
   * stays highlighted on all five screens — and the "exactly one is current" test above is what
   * catches that, but only if this case is exercised from a non-root path.
   */
  it('does not leave Home marked while on another tab', () => {
    renderAt('/store')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
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
  ])('%s → %s', (label, href) => {
    renderAt('/')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(within(nav).getByRole('link', { name: label })).toHaveAttribute('href', href)
  })

  it('has five tabs and no more', () => {
    renderAt('/')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
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
  it('matches case-insensitively, so /LOG is the Log screen and not a 404', () => {
    renderAt('/LOG')
    expect(screen.getByRole('heading', { level: 1, name: 'Log a chore' })).toBeInTheDocument()
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
  it('puts a skip link first, ahead of the five nav tabs', () => {
    renderAt('/')
    const links = screen.getAllByRole('link')
    expect(links[0]).toHaveAccessibleName(/skip to content/i)
    expect(links[0]).toHaveAttribute('href', '#main')
  })

  it('has a main landmark for the skip link to reach', () => {
    renderAt('/')
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main')
  })

  it('gives bare screens a main landmark too', () => {
    renderAt('/login')
    expect(screen.getByRole('main')).toBeInTheDocument()
  })
})
