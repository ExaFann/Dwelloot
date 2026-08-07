// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { LandingPage } from './LandingPage'

/**
 * The landing page — task [82].
 *
 * The routing half (a signed-out `/` renders this, signed-in does not, deeper paths still redirect)
 * lives in `AuthGate.test.tsx`, where the decision lives. This file pins the page's own contract.
 */

function renderPage() {
  return render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('the landing page', () => {
  /**
   * **The page's one structural promise: it renders without a backend.** The production database
   * may be empty and the API asleep; the front door must not depend on either. A query creeping in
   * here would pass every visual check and fail only in front of the first real stranger.
   */
  it('makes no network request at all', () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    renderPage()

    expect(screen.getByText(/chores, but make it a duel/i)).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('says the headline and both doors in', () => {
    renderPage()

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      /chores, but make it a duel/i,
    )
    // Two of each — hero and footer — and every one goes to a real route.
    const starts = screen.getAllByRole('link', { name: /start a household/i })
    const logins = screen.getAllByRole('link', { name: /log in/i })
    expect(starts).toHaveLength(2)
    expect(logins).toHaveLength(2)
    for (const link of starts) expect(link).toHaveAttribute('href', '/register')
    for (const link of logins) expect(link).toHaveAttribute('href', '/login')
  })

  /** The two differentiators each hold a band — they are why this page says anything at all. */
  it('leads with approval and the two-currency rule', () => {
    renderPage()

    expect(
      screen.getByRole('heading', { name: /nobody grades their own homework/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /points keep score\. coins buy rewards\./i }),
    ).toBeInTheDocument()
    // The claim behind the second one, in the words the store empty-state also teaches.
    expect(screen.getByText(/never spent/i)).toBeInTheDocument()
  })

  it('walks the loop in four steps', () => {
    renderPage()

    const loop = screen.getByRole('heading', { name: /how a duel works/i }).closest('section')!
    const titles = [...loop.querySelectorAll('h3')].map((h) => h.textContent)
    expect(titles).toEqual(['Log it', 'Partner approves', 'Win the day', 'Spend the loot'])
  })

  /**
   * jsdom has no IntersectionObserver, which exercises `useRevealOnScroll`'s fallback: every band
   * must be visible immediately. A page that is blank where the observer is missing has failed at
   * its only job — this is the assertion that keeps the fallback honest.
   */
  it('shows every band when there is no IntersectionObserver', () => {
    renderPage()

    const bands = document.querySelectorAll('section.band')
    expect(bands.length).toBeGreaterThanOrEqual(5)
    for (const band of bands) expect(band.className).toContain('band-in')
  })
})
