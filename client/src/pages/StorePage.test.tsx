// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router'
import { makeStore } from '../app/store'
import { signedIn } from '../features/auth/authSlice'
import { StorePage } from './StorePage'

/**
 * Real rows from the dev household, plus one that exists to break a shortcut.
 *
 * **"Duel truce" pauses the competition and its title says nothing about a day off.** Without it,
 * every assertion here passes against a component that matched `title.includes('day off')` instead
 * of reading `pausesCompetition` — which is what a mutation proved: the seeded pausing reward is
 * called "Full chore day off", so flag and title agree and the fixture could not tell them apart.
 * [29] makes the flag client-settable precisely so a household can create exactly this row.
 *
 * "Control the playlist for a day" is the other half of the pair: the word "day" without the flag.
 */
const REWARDS = [
  { id: 359, title: 'Control the playlist for a day', coinCost: 15, pausesCompetition: false },
  { id: 361, title: 'Foot massage', coinCost: 25, pausesCompetition: false },
  { id: 372, title: 'Duel truce', coinCost: 60, pausesCompetition: true },
  { id: 366, title: 'Full chore day off', coinCost: 80, pausesCompetition: true },
]

const me = (coins: number) => ({
  id: 80,
  name: 'Alex',
  email: 'a@b.c',
  householdId: 45,
  lifetimePoints: 120,
  coins,
  currentWinStreak: 1,
})

type Overrides = {
  coins?: number
  rewards?: unknown
  /** Keyed on a substring of the query string, so a test can answer one filter differently. */
  byQuery?: Record<string, unknown>
  listError?: { status: number; body: unknown }
  redeem?: { status: number; body: unknown }
}

function stub(o: Overrides = {}) {
  const calls: { path: string; search: string; method: string; body?: string }[] = []
  const json = (body: unknown, status = 200) =>
    Promise.resolve(
      new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
    )

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: Request) => {
      const url = new URL(input.url)
      const body = input.method === 'GET' ? undefined : await input.clone().text()
      calls.push({ path: url.pathname, search: url.search, method: input.method, body })

      if (url.pathname === '/api/auth/me') return json(me(o.coins ?? 0))

      if (url.pathname === '/api/rewards' && input.method === 'GET') {
        if (o.listError) return json(o.listError.body, o.listError.status)
        for (const [fragment, response] of Object.entries(o.byQuery ?? {})) {
          if (url.search.includes(fragment)) return json(response)
        }
        return json(o.rewards ?? { items: REWARDS, total: REWARDS.length })
      }

      if (url.pathname === '/api/redemptions' && input.method === 'POST') {
        const r = o.redeem ?? {
          status: 201,
          body: { id: 41, rewardId: 361, coinsSpent: 25, coinsRemaining: 7, redeemedAt: '2026-08-04T11:00:00Z' },
        }
        return json(r.body, r.status)
      }

      // Every other path answers a 404, not a convenient body. A stub that answers a path it was
      // never told about is a lie with a delayed fuse — the flake that survived [46]–[48].
      return json({ error: 'That endpoint does not exist.', errors: null }, 404)
    }),
  )
  return calls
}

function renderPage() {
  const store = makeStore()
  store.dispatch(signedIn({ token: 'jwt', user: { id: 80, name: 'Alex' } }))
  render(
    <Provider store={store}>
      <MemoryRouter>
        <StorePage />
      </MemoryRouter>
    </Provider>,
  )
}

/** The card for one reward — every action on this screen is scoped to a row. */
const card = (title: string) => screen.getByText(title).closest('li')!
const rewardCalls = (calls: ReturnType<typeof stub>) =>
  calls.filter((c) => c.path === '/api/rewards' && c.method === 'GET')

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

// ─── The catalogue ───────────────────────────────────────────────────────────

describe('the catalogue', () => {
  it('lists the rewards with what each costs in Coins', async () => {
    stub()
    renderPage()

    expect(await screen.findByText('Foot massage')).toBeInTheDocument()
    expect(card('Foot massage')).toHaveTextContent('25 Coins')
    expect(card('Full chore day off')).toHaveTextContent('80 Coins')
  })

  it('shows the balance from /api/auth/me', async () => {
    stub({ coins: 40 })
    renderPage()

    /*
     * Waits for the **number**, not for the "Your Coins" heading. The heading is static markup and
     * resolves immediately, while the balance renders as its `?? 0` default until `/api/auth/me`
     * lands — so an assertion gated on the heading races the query and passes or fails on timing.
     * This test failed that way on its first run. Same family as log `048`'s loading-state finding.
     */
    const value = await screen.findByText('40')
    expect(value.closest('section')).toHaveAccessibleName('Your Coins')
  })

  it('says where Coins come from when there are none', async () => {
    stub({ coins: 0 })
    renderPage()
    expect(await screen.findByText(/coins come from loot boxes/i)).toBeInTheDocument()
  })

  it('sorts cheapest first by default, which is a real request', async () => {
    const calls = stub()
    renderPage()
    await screen.findByText('Foot massage')

    expect(rewardCalls(calls)[0].search).toContain('sort=coinCost')
    expect(rewardCalls(calls)[0].search).not.toContain('descending')
  })

  it('reports a load failure rather than rendering an empty store', async () => {
    stub({ listError: { status: 500, body: { error: 'An unexpected error occurred.', errors: null } } })
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('An unexpected error occurred.')
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })

  it('has an empty state for a store with nothing in it', async () => {
    stub({ rewards: { items: [], total: 0 } })
    renderPage()
    expect(await screen.findByText(/no rewards in your household yet/i)).toBeInTheDocument()
  })
})

// ─── Redeeming ───────────────────────────────────────────────────────────────

describe('redeeming', () => {
  /** Both directions. A screen that disabled everything would pass a disabled-only check. */
  it('offers Redeem for what the balance covers and refuses what it does not', async () => {
    stub({ coins: 25 })
    renderPage()
    await screen.findByText('Foot massage')

    // 25 against a cost of 25 — inclusive, exactly as the server's `coins >= coinCost`.
    expect(within(card('Foot massage')).getByRole('button', { name: /^redeem$/i })).toBeEnabled()
    expect(within(card('Full chore day off')).getByRole('button', { name: /^redeem$/i })).toBeDisabled()
    expect(card('Full chore day off')).toHaveTextContent('55 more Coins to go.')
  })

  it('sends nothing until the confirmation is confirmed', async () => {
    const calls = stub({ coins: 40 })
    renderPage()
    await screen.findByText('Foot massage')

    await userEvent.setup().click(within(card('Foot massage')).getByRole('button', { name: /^redeem$/i }))

    expect(screen.getByText(/redeem foot massage for 25 coins\?/i)).toBeInTheDocument()
    expect(calls.filter((c) => c.path === '/api/redemptions')).toHaveLength(0)
  })

  it('posts only the reward id — there is no cost field to tamper with', async () => {
    const calls = stub({ coins: 40 })
    renderPage()
    const user = userEvent.setup()
    await screen.findByText('Foot massage')

    await user.click(within(card('Foot massage')).getByRole('button', { name: /^redeem$/i }))
    await user.click(screen.getByRole('button', { name: /yes, redeem/i }))

    await waitFor(() => {
      const post = calls.find((c) => c.path === '/api/redemptions')
      expect(JSON.parse(post!.body!)).toEqual({ rewardId: 361 })
    })
  })

  /**
   * The finding this screen is built around, and [48]'s lesson in a second place: the balance after
   * a purchase comes from the server's `coinsRemaining`. The stub answers 7 where `40 − 25` is 15,
   * so a UI doing its own arithmetic fails here and only here.
   */
  it('reports the balance the server returned, not the one it could have calculated', async () => {
    stub({ coins: 40 })
    renderPage()
    const user = userEvent.setup()
    await screen.findByText('Foot massage')

    await user.click(within(card('Foot massage')).getByRole('button', { name: /^redeem$/i }))
    await user.click(screen.getByRole('button', { name: /yes, redeem/i }))

    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent('Foot massage redeemed. 7 Coins left.')
    expect(status).not.toHaveTextContent('15')
  })

  it('can be backed out of', async () => {
    const calls = stub({ coins: 40 })
    renderPage()
    const user = userEvent.setup()
    await screen.findByText('Foot massage')

    await user.click(within(card('Foot massage')).getByRole('button', { name: /^redeem$/i }))
    await user.click(screen.getByRole('button', { name: /cancel/i }))

    expect(screen.queryByText(/redeem foot massage for 25 coins\?/i)).not.toBeInTheDocument()
    expect(calls.filter((c) => c.path === '/api/redemptions')).toHaveLength(0)
  })

  /** Captured from the running API at a balance of 0. */
  it('surfaces the server’s refusal in its own words', async () => {
    stub({
      coins: 40,
      redeem: { status: 400, body: { error: 'Not enough Coins.', errors: null, traceId: '00-a-b-00' } },
    })
    renderPage()
    const user = userEvent.setup()
    await screen.findByText('Foot massage')

    await user.click(within(card('Foot massage')).getByRole('button', { name: /^redeem$/i }))
    await user.click(screen.getByRole('button', { name: /yes, redeem/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Not enough Coins.')
  })
})

describe('the pausing disclosure', () => {
  /**
   * Derived from `pausesCompetition`, never from the title — which is why [28] put the flag on the
   * list response at all. Asserted in both directions: on the flagged reward and absent on the rest.
   */
  /**
   * Asserted on **"Duel truce"**, whose title gives nothing away, and denied on "Control the
   * playlist for a day", whose title does. Read off the seeded "Full chore day off" alone, this
   * test passes against a component matching on the title — which a mutation demonstrated.
   */
  it('marks a pausing reward the flag says pauses, whatever it is called', async () => {
    stub({ coins: 100 })
    renderPage()
    await screen.findByText('Foot massage')

    expect(card('Duel truce')).toHaveTextContent(/pauses the duel that day/i)
    expect(card('Full chore day off')).toHaveTextContent(/pauses the duel that day/i)
    expect(card('Control the playlist for a day')).not.toHaveTextContent(/pauses the duel/i)
    expect(card('Foot massage')).not.toHaveTextContent(/pauses the duel/i)
  })

  it('spells out the consequence at the point of redemption', async () => {
    stub({ coins: 100 })
    renderPage()
    const user = userEvent.setup()
    await screen.findByText('Foot massage')

    await user.click(within(card('Duel truce')).getByRole('button', { name: /^redeem$/i }))
    expect(screen.getByText(/nobody wins it, and neither of you gets a loot box/i)).toBeInTheDocument()
  })

  it('says nothing of the sort for an ordinary reward', async () => {
    stub({ coins: 100 })
    renderPage()
    const user = userEvent.setup()
    await screen.findByText('Foot massage')

    await user.click(within(card('Foot massage')).getByRole('button', { name: /^redeem$/i }))
    expect(screen.queryByText(/neither of you gets a loot box/i)).not.toBeInTheDocument()
  })
})

// ─── The four controls ───────────────────────────────────────────────────────

describe('search', () => {
  it('sends the typed term', async () => {
    const calls = stub({ byQuery: { 'search=massage': { items: [REWARDS[1]], total: 1 } } })
    renderPage()
    await screen.findByText('Foot massage')

    await userEvent.setup().type(screen.getByLabelText('Search'), 'massage')

    await waitFor(() => expect(rewardCalls(calls).some((c) => c.search.includes('search=massage'))).toBe(true))
  })

  it('never sends an empty search parameter', async () => {
    const calls = stub()
    renderPage()
    await screen.findByText('Foot massage')

    expect(rewardCalls(calls).every((c) => !c.search.includes('search='))).toBe(true)
  })

  it('says so when nothing matches', async () => {
    stub({ byQuery: { 'search=zzz': { items: [], total: 0 } } })
    renderPage()
    await screen.findByText('Foot massage')

    await userEvent.setup().type(screen.getByLabelText('Search'), 'zzz')
    expect(await screen.findByText(/no rewards match/i)).toBeInTheDocument()
  })
})

describe('sorting', () => {
  it('sends the field and direction the chosen option means', async () => {
    const calls = stub()
    renderPage()
    await screen.findByText('Foot massage')

    await userEvent.setup().selectOptions(screen.getByLabelText('Sort'), 'z-a')

    await waitFor(() =>
      expect(
        rewardCalls(calls).some((c) => c.search.includes('sort=title') && c.search.includes('descending=true')),
      ).toBe(true),
    )
  })
})

describe('the affordability filter', () => {
  it('asks for what the balance covers', async () => {
    const calls = stub({ coins: 25, byQuery: { 'affordable=true': { items: [REWARDS[0], REWARDS[1]], total: 2 } } })
    renderPage()
    await screen.findByText('Foot massage')

    await userEvent.setup().click(screen.getByRole('button', { name: 'Can afford' }))

    await waitFor(() => expect(rewardCalls(calls).some((c) => c.search.includes('affordable=true'))).toBe(true))
  })

  /** The complement branch log `028` built. A UI that could only send `true` fails here. */
  it('asks for the complement — what you are saving for', async () => {
    const calls = stub({ coins: 25, byQuery: { 'affordable=false': { items: [REWARDS[2]], total: 1 } } })
    renderPage()
    await screen.findByText('Foot massage')

    await userEvent.setup().click(screen.getByRole('button', { name: 'Saving for' }))

    await waitFor(() => expect(rewardCalls(calls).some((c) => c.search.includes('affordable=false'))).toBe(true))
  })

  it('omits the parameter for All', async () => {
    const calls = stub()
    renderPage()
    await screen.findByText('Foot massage')

    expect(rewardCalls(calls).every((c) => !c.search.includes('affordable='))).toBe(true)
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('has its own empty state when nothing is affordable', async () => {
    stub({ coins: 0, byQuery: { 'affordable=true': { items: [], total: 0 } } })
    renderPage()
    await screen.findByText('Foot massage')

    await userEvent.setup().click(screen.getByRole('button', { name: 'Can afford' }))
    expect(await screen.findByText(/nothing you can afford yet/i)).toBeInTheDocument()
  })
})

describe('pagination', () => {
  /** Position comes from `total`, the unpaginated count — the page holds three of eight. */
  it('reports the page count from the total, not from the page', async () => {
    stub({ rewards: { items: REWARDS, total: 8 } })
    renderPage()

    expect(await screen.findByText('Page 1 of 2')).toBeInTheDocument()
  })

  it('hides the control when everything fits on one page', async () => {
    stub({ rewards: { items: REWARDS, total: 3 } })
    renderPage()
    await screen.findByText('Foot massage')

    expect(screen.queryByRole('navigation', { name: /pages/i })).not.toBeInTheDocument()
  })

  it('asks for the next page and stops at the last', async () => {
    const calls = stub({ rewards: { items: REWARDS, total: 8 } })
    renderPage()
    const user = userEvent.setup()
    await screen.findByText('Foot massage')

    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: /next/i }))

    await waitFor(() => expect(rewardCalls(calls).some((c) => c.search.includes('page=2'))).toBe(true))
    expect(await screen.findByText('Page 2 of 2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled()
  })

  /**
   * Narrowing while on page 2 would otherwise show an empty page that reads as "no results" — the
   * list did not run out, the position did.
   */
  it('returns to the first page when the search changes', async () => {
    const calls = stub({ rewards: { items: REWARDS, total: 8 } })
    renderPage()
    const user = userEvent.setup()
    await screen.findByText('Foot massage')

    await user.click(screen.getByRole('button', { name: /next/i }))
    await waitFor(() => expect(rewardCalls(calls).some((c) => c.search.includes('page=2'))).toBe(true))

    await user.type(screen.getByLabelText('Search'), 'massage')

    await waitFor(() => {
      const last = rewardCalls(calls).at(-1)!
      expect(last.search).toContain('search=massage')
      expect(last.search).toContain('page=1')
    })
  })

  it('returns to the first page when the filter changes', async () => {
    const calls = stub({ rewards: { items: REWARDS, total: 8 } })
    renderPage()
    const user = userEvent.setup()
    await screen.findByText('Foot massage')

    await user.click(screen.getByRole('button', { name: /next/i }))
    await waitFor(() => expect(rewardCalls(calls).some((c) => c.search.includes('page=2'))).toBe(true))

    await user.click(screen.getByRole('button', { name: 'Can afford' }))

    await waitFor(() => {
      const last = rewardCalls(calls).at(-1)!
      expect(last.search).toContain('affordable=true')
      expect(last.search).toContain('page=1')
    })
  })
})

// ─── Managing the catalogue ──────────────────────────────────────────────────

describe('managing rewards', () => {
  it('opens an editor in create mode from under the list', async () => {
    stub()
    renderPage()
    await screen.findByText('Foot massage')

    await userEvent.setup().click(screen.getByRole('button', { name: /new reward/i }))

    expect(screen.getByRole('heading', { name: /new reward/i })).toBeInTheDocument()
    expect(screen.getByLabelText('Cost in Coins')).toHaveValue(null)
  })

  it('opens an editor pre-filled from a reward’s own Edit button', async () => {
    stub()
    renderPage()
    await screen.findByText('Foot massage')

    await userEvent.setup().click(screen.getByRole('button', { name: /edit foot massage/i }))

    expect(screen.getByLabelText('Reward')).toHaveValue('Foot massage')
    expect(screen.getByLabelText('Cost in Coins')).toHaveValue(25)
    expect(screen.getByRole('button', { name: /remove this reward/i })).toBeInTheDocument()
  })
})
