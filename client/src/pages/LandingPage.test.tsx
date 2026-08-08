// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { LandingPage } from './LandingPage'
import { tugShares } from '../features/competition/standing'

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

/**
 * The hero card is `aria-hidden`, so `getByRole` cannot reach anything inside it — every query into
 * the poster has to start from its text.
 */
const heroCard = () => screen.getByText('Head-to-head').closest('.rounded-base') as HTMLElement

/** The status dot's fill, in row order — `choreStatusDisplay`'s map is the source of these. */
const statuses = (list: Element) =>
  [...list.querySelectorAll('li')].map(
    (row) =>
      ['bg-warning', 'bg-success', 'bg-danger'].find((fill) =>
        row.querySelector('span[aria-hidden="true"]')?.className.includes(fill),
      ) ?? 'none',
  )

const titles = (list: Element) =>
  [...list.querySelectorAll('li')].map((row) => row.querySelector('span:nth-child(2)')?.textContent)

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
    const starts = screen.getAllByRole('link', { name: /start a duel/i })
    const logins = screen.getAllByRole('link', { name: /log in/i })
    expect(starts).toHaveLength(2)
    expect(logins).toHaveLength(2)
    for (const link of starts) expect(link).toHaveAttribute('href', '/register')
    for (const link of logins) expect(link).toHaveAttribute('href', '/login')
  })

  /**
   * [90] — the CTA is a *button label*, not a rename.
   *
   * The obvious way to get this task wrong is a find-and-replace across the file: the word
   * *household* is still the name of the thing you create, and it survives in the footer CTA's own
   * sentence, directly under the changed button. Nothing else on the page would catch that.
   */
  it('renames the button without renaming the household', () => {
    renderPage()

    expect(screen.queryByText(/start a household/i)).not.toBeInTheDocument()
    expect(screen.getByText(/one of you makes the household/i)).toBeInTheDocument()
  })

  /**
   * The rewritten sentences, each pinned **both ways**. Three of these are partial rewrites that
   * leave most of the old words in place, so a present-only assertion would pass against the
   * version they replaced.
   */
  it('carries the [90] copy, and not what it replaced', () => {
    renderPage()

    const gone = [
      /the other of you signs off/i,
      /most points when the day ends takes a loot box/i,
      /rewards you two invented/i,
      /every flat has the same/i,
      /points in the bank/i,
      /most points when the day ends wins/i,
    ]
    for (const old of gone) expect(screen.queryByText(old)).not.toBeInTheDocument()

    const now = [
      /points land only when your partner signs off/i,
      /whoever has more points when the day ends takes the box/i,
      /rewards you two made up/i,
      /every home has the same three arguments/i,
      /points on the board/i,
      /whoever has more when the day ends wins/i,
    ]
    for (const line of now) expect(screen.getByText(line)).toBeInTheDocument()

    // Explicitly untouched by the brief.
    expect(screen.getByText(/one box in ten hides a bonus reward/i)).toBeInTheDocument()
    expect(screen.getByText('Head-to-head')).toBeInTheDocument()
  })

  /**
   * The economy band is three steps in a fixed order — Points, the win, Coins. Order *is* the
   * change: two cards side by side implied the currencies convert, and the middle step is the whole
   * correction, so document order is what gets asserted rather than mere presence.
   */
  it('puts the win between Points and Coins, with drawn arrows', () => {
    renderPage()

    const band = screen.getByRole('heading', { name: /points keep score/i }).closest('section')!
    const row = band.querySelector('h3')!.closest('div')!.parentElement!

    // Each grid cell by its own heading — the arrows are bare `<svg>` and have none.
    const labels = [...row.children].map(
      (el) => (el.querySelector('h3') ?? el.querySelector('p'))?.textContent?.trim() ?? '',
    )
    expect(labels).toEqual(['Points', '', 'Win the day', '', 'Coins'])

    // Drawn, not typed. Text arrows are what this replaces.
    expect(row.querySelectorAll('svg[aria-hidden="true"]').length).toBeGreaterThanOrEqual(4)
    expect(band.textContent).not.toMatch(/[→⟶➔➜▶►]|-&gt;|->/)
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

  /**
   * [89] — the card shows **one** rung, not the ladder.
   *
   * The absence is the change, so the absence is what is asserted. A test that only checked "Today
   * is present" would pass unchanged against the three-rung version it replaced, which makes it a
   * check that cannot fail for the thing it was written for.
   */
  it('shows only the Today rung, carrying the verdict', () => {
    renderPage()

    expect(screen.getByText('Today')).toBeInTheDocument()
    expect(screen.queryByText(/this week/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/this month/i)).not.toBeInTheDocument()

    // The verdict moved onto Today, and its arithmetic has to match the score above it.
    expect(screen.getByText('Alex is ahead by 10.')).toBeInTheDocument()
    expect(heroCard()).toHaveTextContent('25 — 15')
  })

  /**
   * The caption is prose, and must stay prose. The card is `aria-hidden` and nothing inside it is
   * clickable, so a scroller or a chevron would promise a gesture the poster cannot honour.
   */
  it('describes the other periods in words, without pretending to be a control', () => {
    renderPage()

    expect(screen.getByText(/week and month too — swipe on your phone\./i)).toBeInTheDocument()

    const card = heroCard()
    // The attribute sits on the wrapper, so what matters is that the card is inside that subtree.
    expect(card.closest('[aria-hidden="true"]')).not.toBeNull()
    expect(card.querySelector('button')).toBeNull()
    expect(card.querySelector('[role="button"]')).toBeNull()
    expect(card.querySelector('[tabindex]')).toBeNull()
  })

  /**
   * Three chores against four, and the statuses in a fixed order. The dot classes come from
   * `choreStatusDisplay`'s map, so this also pins the poster to the shared module rather than to a
   * colour the page could re-decide locally.
   */
  it('runs three chores down one column and four down the other', () => {
    renderPage()

    const [left, right] = [...heroCard().querySelectorAll('ul')]

    expect(statuses(left)).toEqual(['bg-warning', 'bg-success', 'bg-success'])
    expect(statuses(right)).toEqual(['bg-warning', 'bg-success', 'bg-danger', 'bg-success'])

    expect(titles(left)).toEqual(['Fed the cat', 'Cooked dinner', 'Bins out'])
    expect(titles(right)).toEqual(['Watered plants', 'Vacuumed', 'Made the bed', 'Washed up'])
  })

  /**
   * The rejected row is new to this page, and it is the one that can silently go wrong:
   * `pointsAwarded` is populated on all three statuses, so a figure printed here would tell a
   * stranger that a chore their partner turned down still paid out.
   */
  it('strikes the rejected chore through and pays it nothing', () => {
    renderPage()

    const rejected = screen.getByText('Made the bed')
    expect(rejected.className).toContain('line-through')
    expect(rejected.closest('li')).not.toHaveTextContent('5')
  })

  /**
   * The rope's position comes from the real `tugShares`, not from a number typed into the poster.
   *
   * All three original rungs carried hand-written shares and all three were wrong — 25–15 was drawn
   * at 58 where the function returns 62. Nothing failed, because a literal cannot disagree with
   * anything. The grip is measured from the *lead* rather than share-of-total, which is exactly the
   * kind of rule nobody re-derives by eye.
   */
  it('positions the rope with the real tugShares', () => {
    renderPage()

    const filled = [...heroCard().querySelectorAll('div')].find((el) => el.style.width.endsWith('%'))
    expect(filled?.style.width).toBe(`${tugShares(25, 15).mine}%`)
  })

  /**
   * [91] — the Questions band sits between "What you're playing for" and the closing CTA. Position is
   * part of the brief, so position is what is asserted; presence alone would pass with the band
   * anywhere on the page.
   */
  it('puts Questions between the box and the closing CTA', () => {
    renderPage()

    const headings = [...document.querySelectorAll('h2')].map((h) => h.textContent?.trim() ?? '')
    const box = headings.findIndex((h) => /what you.re playing for/i.test(h))
    const questions = headings.indexOf('Questions')
    const cta = headings.findIndex((h) => /ready to settle it/i.test(h))

    expect(box).toBeGreaterThanOrEqual(0)
    expect(questions).toBe(box + 1)
    expect(cta).toBe(questions + 1)
  })

  it('asks the five questions, in the owner’s order', () => {
    renderPage()

    const band = screen.getByRole('heading', { name: 'Questions' }).closest('section')!
    expect([...band.querySelectorAll('summary')].map((s) => s.textContent?.trim())).toEqual([
      'Can we play with three? Or on my own?',
      'Do we both need an account?',
      'Who decides what a chore is worth?',
      'What stops us from logging things we didn’t do?',
      'What if we tie?',
    ])
  })

  /**
   * The platform's disclosure, with nothing taken away from it. `tabindex` and `role` on a
   * `<summary>` are both ways of overriding behaviour the element already has correct, so their
   * **absence** is the assertion.
   */
  it('uses <details> and leaves <summary> alone', () => {
    renderPage()

    const band = screen.getByRole('heading', { name: 'Questions' }).closest('section')!
    const summaries = [...band.querySelectorAll('summary')]
    expect(summaries).toHaveLength(5)

    for (const summary of summaries) {
      expect(summary.parentElement?.tagName).toBe('DETAILS')
      expect(summary).not.toHaveAttribute('tabindex')
      expect(summary).not.toHaveAttribute('role')
      // The browser's own triangle is replaced, not left beside the drawn one.
      expect(summary.className).toContain('list-none')
      expect(summary.querySelector('svg')).not.toBeNull()
    }
  })

  /**
   * Two answers describe the **backend** rather than the pitch, and both were checked against the
   * services. Pinned by their wording so a later copy edit cannot quietly make the page promise
   * something the API does not do.
   */
  it('answers the two mechanism questions in the words the code supports', () => {
    renderPage()

    expect(
      screen.getByText(/you cannot approve your own chore — the app refuses it/i),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/a tie settles as a win-win and you each open a box/i),
    ).toBeInTheDocument()
  })

  it('closes with the project line and a link to the source', () => {
    renderPage()

    expect(screen.getByText(/an MSA 2026 Phase 2 project/i)).toBeInTheDocument()

    const repo = screen.getByRole('link', { name: /source on github/i })
    expect(repo).toHaveAttribute('href', 'https://github.com/ExaFann/Dwelloot')
    expect(repo).toHaveAttribute('rel', 'noreferrer')

    // No contact page and no form — owner's call, and there is nowhere for a message to go.
    expect(document.querySelector('form')).toBeNull()
    expect(document.querySelector('a[href^="mailto:"]')).toBeNull()
  })

  /** No nav bar, no in-page anchors, no sticky header — the page is one scroll, top to bottom. */
  it('has no navigation of its own', () => {
    renderPage()

    expect(document.querySelector('nav')).toBeNull()
    expect(document.querySelector('a[href^="#"]')).toBeNull()

    const header = document.querySelector('header')!
    expect(header.className).not.toMatch(/\bsticky\b|\bfixed\b/)
  })

  /**
   * [92] — the rewards card wears the full-colour `RewardMark`, and the mono `RewardIcon` is off
   * this page entirely. Asserted by looking for a literal fill: the mono glyph has none, so it
   * inherits `currentColor`, and that difference is the whole reason both exist.
   */
  it('shows the rewards card in full colour', () => {
    renderPage()

    const card = screen.getByRole('heading', { name: /rewards you invent/i }).closest('li')!
    const fills = [...card.querySelectorAll('svg *')].map((el) => el.getAttribute('fill'))

    expect(fills.filter(Boolean).length).toBeGreaterThanOrEqual(7)
    expect(fills).toContain('#7C4DFF')
    expect(fills).toContain('#FFE14A')
  })

  /** [83]: dark mode is not advertised — nothing to sell there yet, owner's call. */
  it('does not advertise dark mode', () => {
    renderPage()
    expect(screen.queryByText(/dark mode/i)).not.toBeInTheDocument()
  })

  /**
   * [91a] — the win streak reaches the front door.
   *
   * Two assertions, and the second is the one with teeth. The streak's rule is that a tie, a voided
   * day and a day nobody won are **skipped**, not counted as a break — only the other person winning
   * ends the run. "Miss a day and it resets" is the copy anyone would write from the word *streak*
   * alone, and it is false, so the absence of that claim is pinned as well as the presence of the
   * true one.
   */
  it('says what a win streak is, in the words the code supports', () => {
    renderPage()

    const line = screen.getByText(/win days back to back and your win streak climbs/i)
    expect(line).toBeInTheDocument()
    expect(line.closest('p')?.querySelector('svg')).not.toBeNull()

    expect(screen.getByText(/only losing one will/i)).toBeInTheDocument()
    expect(screen.queryByText(/miss a day|resets|starts over|back to zero/i)).not.toBeInTheDocument()

    // It is a *win* streak everywhere it is named — the ambiguity [91a] closed.
    expect(screen.queryByText(/\bstreak\b/i)?.textContent ?? '').toMatch(/win streak/i)
  })

  /**
   * jsdom cannot evaluate a media query, so the breakpoint itself is measured in the browser. What
   * is pinned here is the intent: the row is `md`, not `lg`. Stacking until 1024 put a full-width
   * Points and a full-width Coins on every tablet, which is what the owner rejected.
   */
  it('turns the economy band into a row at tablet width, not desktop', () => {
    renderPage()

    const band = screen.getByRole('heading', { name: /points keep score/i }).closest('section')!
    const row = band.querySelector('h3')!.closest('div')!.parentElement!

    expect(row.className).toMatch(/\bmd:grid-cols-/)
    expect(row.className).not.toMatch(/\blg:grid-cols-/)
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
