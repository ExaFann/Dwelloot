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
  it('leads with approval and the two-currency rule, in the [83] voice', () => {
    renderPage()

    expect(
      screen.getByRole('heading', { name: /tap it\. they okay it\. it counts\./i }),
    ).toBeInTheDocument()
    // The owner's own line, verbatim — the brief was "simple, positive, easy to want".
    expect(screen.getByText(/once they approve, you.re good to go/i)).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /points keep score\. coins buy rewards\./i }),
    ).toBeInTheDocument()
  })

  /**
   * The problem band — [83]. The page must name the pain before the pitch, or the product is an
   * app asking to be admired. Three chips, and the pivot line that turns them into the sell.
   */
  it('opens the pitch with the problem', () => {
    renderPage()

    expect(screen.getByRole('heading', { name: /the dishes\. again\./i })).toBeInTheDocument()
    expect(screen.getByText(/i did it last time/i)).toBeInTheDocument()
    expect(screen.getByText(/swaps them for a scoreboard/i)).toBeInTheDocument()
  })

  /**
   * The poster must show the **current** product — [84]. It did not: the hero card kept the
   * pre-[83] chore notation and a centre tick on its tug bar, so a stranger's first sight of
   * Dwelloot was its previous design. Both are now drawn by the real components, and this is the
   * assertion that would have caught it.
   */
  it('draws the hero card with the app’s own chore notation', () => {
    renderPage()

    const approved = screen.getByText('Cooked dinner').closest('li')!
    expect(approved).toHaveTextContent('20')
    expect(approved).not.toHaveTextContent('+20')

    // A pending chore carries no figure at all — the rule, on the front door.
    const pending = screen.getByText('Fed the cat').closest('li')!
    expect(pending).not.toHaveTextContent('5')
    expect(pending).not.toHaveTextContent('(5)')
  })

  it('names the two players Alex and Blake', () => {
    renderPage()
    expect(screen.getByText('Alex')).toBeInTheDocument()
    expect(screen.getByText('Blake')).toBeInTheDocument()
  })

  /** [83]: dark mode is not advertised — nothing to sell there yet, owner's call. */
  it('does not advertise dark mode', () => {
    renderPage()
    expect(screen.queryByText(/dark mode/i)).not.toBeInTheDocument()
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
    expect(bands.length).toBeGreaterThanOrEqual(6)
    for (const band of bands) expect(band.className).toContain('band-in')
  })
})
