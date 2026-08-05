// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { RouteError } from './RouteError'

/**
 * The router's `errorElement`, at 0% coverage when [59] measured — the one component whose whole job
 * is to appear when everything else has failed, and nothing had ever rendered it.
 *
 * Driven through a **real router that really throws**, not by rendering `<RouteError />` directly.
 * Rendering it on its own would exercise the markup while proving nothing about whether the router
 * actually reaches it — and "the app shows a blank white page on a render error" is precisely the
 * failure this exists to prevent.
 */

function renderThrowingRoute() {
  const Boom = () => {
    throw new Error('activities.items is not iterable')
  }
  const router = createMemoryRouter(
    [{ path: '/', element: <Boom />, errorElement: <RouteError /> }],
    { initialEntries: ['/'] },
  )
  render(<RouterProvider router={router} />)
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('when a route throws', () => {
  /**
   * React logs the caught error to `console.error`; silenced so a passing run is not full of red
   * that looks like a failure. Restored by `restoreAllMocks` above.
   */
  function quietly(run: () => void) {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    run()
  }

  it('shows a human sentence instead of a blank page', () => {
    quietly(renderThrowingRoute)

    expect(screen.getByRole('heading', { name: /something went wrong/i })).toBeInTheDocument()
    expect(screen.getByText(/reloading usually fixes it/i)).toBeInTheDocument()
  })

  it('offers a way back to a working screen', () => {
    quietly(renderThrowingRoute)
    expect(screen.getByRole('link', { name: /back to home/i })).toHaveAttribute('href', '/')
  })

  /**
   * The disclosure rule from [33], applied on the client: detail is for developers.
   *
   * Vitest runs with `import.meta.env.DEV` true, so this asserts the **development** half — the
   * message is on screen where it is useful. The production half (that it is absent in a build) is
   * the branch this cannot reach; see the note in `059`.
   */
  it('shows the error text in development, where it helps', () => {
    quietly(renderThrowingRoute)
    expect(screen.getByText(/activities\.items is not iterable/i)).toBeInTheDocument()
  })

  /** A thrown string, a thrown Response, a thrown anything — none of it may crash the fallback. */
  it('survives a thrown value that is not an Error', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const Boom = () => {
      throw 'just a string'
    }
    const router = createMemoryRouter(
      [{ path: '/', element: <Boom />, errorElement: <RouteError /> }],
      { initialEntries: ['/'] },
    )
    render(<RouterProvider router={router} />)

    expect(screen.getByRole('heading', { name: /something went wrong/i })).toBeInTheDocument()
    expect(screen.getByText(/just a string/i)).toBeInTheDocument()
  })
})
