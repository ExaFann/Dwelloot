// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router'
import { makeStore } from '../app/store'
import { signedIn } from '../features/auth/authSlice'
import { badgeWallGeometry } from '../features/progression/badgeWallGeometry'
import { MePage } from './MePage'

const ME = {
  id: 80,
  name: 'Alex',
  email: 'alex@example.com',
  householdId: 45,
  lifetimePoints: 120,
  coins: 13,
  currentWinStreak: 2,
}

/** Captured from the running API in [54]. Three of the six are unlocked for this account. */
const BADGES = [
  {
    id: 1,
    name: 'First chore',
    criteria: 'Get your first logged chore approved.',
    unlocked: true,
    unlockedAt: '2026-08-05T09:00:00Z',
  },
  {
    id: 2,
    name: '3-day win streak',
    criteria: 'Win the daily duel three days in a row.',
    unlocked: false,
    unlockedAt: null,
  },
  {
    id: 3,
    name: 'First redemption',
    criteria: 'Spend Coins in the Store for the first time.',
    unlocked: true,
    unlockedAt: '2026-08-05T10:00:00Z',
  },
  {
    id: 4,
    name: '7-day win streak',
    criteria: 'Win the daily duel seven days in a row.',
    unlocked: false,
    unlockedAt: null,
  },
  {
    id: 5,
    name: 'Century',
    criteria: 'Earn 100 lifetime Points.',
    unlocked: true,
    unlockedAt: '2026-08-05T11:00:00Z',
  },
  {
    id: 6,
    name: 'Big spender',
    criteria: 'Redeem five rewards.',
    unlocked: false,
    unlockedAt: null,
  },
]

/**
 * Members carry their totals since [79], and the two are **deliberately different from each other
 * and from `ME`** — three ints projected side by side is where a copy-paste puts one person's
 * Coins under the other's name, and equal fixtures would agree with it.
 */
const MEMBER_ME = {
  id: 80,
  name: 'Alex',
  avatarKey: 'fox',
  lifetimePoints: 120,
  coins: 13,
  currentWinStreak: 2,
}
const MEMBER_PARTNER = {
  id: 81,
  name: 'Sam',
  avatarKey: 'star',
  lifetimePoints: 64,
  coins: 7,
  currentWinStreak: 5,
}

const HOUSEHOLD = {
  id: 45,
  name: 'Duel House',
  inviteCode: 'BNC4NN',
  members: [MEMBER_ME, MEMBER_PARTNER],
}

type Overrides = {
  me?: unknown
  badges?: unknown
  household?: unknown
  rename?: { status: number; body: unknown }
  leave?: { status: number; body: unknown }
  join?: { status: number; body: unknown }
}

function stub(o: Overrides = {}) {
  const calls: { path: string; method: string; body?: string }[] = []
  const json = (body: unknown, status = 200) =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: Request) => {
      const url = new URL(input.url)
      const body = input.method === 'GET' ? undefined : await input.clone().text()
      calls.push({ path: url.pathname, method: input.method, body })

      if (url.pathname === '/api/auth/me') return json(o.me ?? ME)
      if (url.pathname === '/api/badges') return json(o.badges ?? { items: BADGES })

      if (url.pathname === '/api/households/join') {
        const r = o.join ?? { status: 200, body: { id: 46, isFull: true } }
        return json(r.body, r.status)
      }
      if (url.pathname === '/api/households/45/leave') {
        const r = o.leave ?? { status: 200, body: { left: true } }
        return json(r.body, r.status)
      }
      if (url.pathname === '/api/households/45') {
        if (input.method === 'PATCH') {
          const r = o.rename ?? { status: 200, body: { id: 45, name: 'The Nest' } }
          return json(r.body, r.status)
        }
        return json(o.household ?? HOUSEHOLD)
      }

      // Routed by path — a stub that answers a path it was never told about is a lie with a delayed
      // fuse, the flake that survived [46]–[48].
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
        <MePage />
      </MemoryRouter>
    </Provider>,
  )
}

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

// ─── Profile ─────────────────────────────────────────────────────────────────

describe('the profile', () => {
  it('shows the three stats from /api/auth/me', async () => {
    stub()
    renderPage()

    // Waits for a value, not for the static heading: the numbers arrive with the query, and an
    // assertion gated on markup that was never going to be late proves nothing (logs `048`, `051`).
    const coins = await screen.findByText('13')
    expect(coins.closest('div')).toHaveTextContent('Coins')
    expect(screen.getByText('120').closest('div')).toHaveTextContent('Lifetime pts')
    expect(screen.getByText('2').closest('div')).toHaveTextContent('Streak')
  })

  /**
   * [78] hides the stat labels below 640px, and *how* is the whole point: `sr-only sm:not-sr-only`,
   * never `hidden sm:inline`. `hidden` would drop the label from the accessibility tree and from
   * `textContent`, so a screen reader would hear a bare "13" and the three assertions above would
   * fail. jsdom does no media matching, so the base class is also exactly what they see — which
   * makes those three the mutation test for this, and this the statement of why.
   */
  it('keeps the stat labels readable to screen readers at every width', async () => {
    stub()
    renderPage()

    const label = await screen.findByText('Coins')
    expect(label).toHaveClass('sr-only')
    expect(label).toHaveClass('sm:not-sr-only')
  })

  it('names the signed-in user', async () => {
    stub()
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Alex' })).toBeInTheDocument()
    expect(screen.getByText('alex@example.com')).toBeInTheDocument()
  })

  it('offers a way out of the session', async () => {
    stub()
    renderPage()
    expect(await screen.findByRole('button', { name: /sign out/i })).toBeInTheDocument()
  })
})

// ─── Badges ──────────────────────────────────────────────────────────────────

describe('the badge wall', () => {
  it('shows every badge as an openable cell, locked ones included', async () => {
    stub()
    renderPage()

    await screen.findByRole('button', { name: 'First chore, unlocked' })
    for (const badge of BADGES) {
      expect(
        screen.getByRole('button', {
          name: `${badge.name}, ${badge.unlocked ? 'unlocked' : 'locked'}`,
        }),
      ).toBeInTheDocument()
    }
  })

  /**
   * The reason `criteria` is in the payload at all ([27]). Since [76b] a locked badge's sentence
   * surfaces through the **tip**, not the overlay — this is where the no-local-copy obligation is
   * now visible: a client-side copy of these strings would be free to drift from the thresholds
   * log `026` pins against this same seeded text.
   */
  it('serves the server’s criteria through a locked badge’s tip', async () => {
    stub()
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: '3-day win streak, locked' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    // Scoped to the Badges region: the page carries other live regions (settings notices).
    const wall = screen.getByRole('region', { name: 'Badges' })
    expect(within(wall).getByRole('status')).toHaveTextContent(
      'Win the daily duel three days in a row.',
    )
  })

  it('distinguishes unlocked from locked in words, not only colour', async () => {
    stub()
    renderPage()

    // The state is a word in the accessible name; the unlocked overlay repeats it visibly.
    fireEvent.click(await screen.findByRole('button', { name: 'First chore, unlocked' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Unlocked')
  })

  it('counts the progress from the list', async () => {
    stub()
    renderPage()
    // Exactly once since [76a]: the wall is the only badge surface at every width.
    expect(await screen.findAllByText('3 of 6 unlocked')).toHaveLength(1)
  })

  /**
   * **Placement is by id, not by response order.** [27] sorts by id and chose that over
   * unlocked-first because a wall that reshuffles when you unlock something is a worse wall; the
   * honeycomb hard-codes each id's cell, so an out-of-order response must land identically.
   */
  it('places badges by id whatever order the server sent', async () => {
    stub({ badges: { items: [BADGES[5], BADGES[0], BADGES[3]] } })
    renderPage()

    const first = await screen.findByRole('button', { name: 'First chore, unlocked' })
    const geometry = badgeWallGeometry(130)
    // CELL_ORDER puts id 1 at row 0, column 0.
    expect(first.style.left).toBe(`${geometry.cellAt(0, 0).left}px`)
    expect(first.style.top).toBe(`${geometry.cellAt(0, 0).top}px`)
  })
})

// ─── Household settings ──────────────────────────────────────────────────────

describe('household settings', () => {
  it('shows the name and both members', async () => {
    stub()
    renderPage()

    expect(await screen.findByText('Duel House')).toBeInTheDocument()
    const household = screen.getByText('Duel House').closest('section')!
    expect(within(household).getByRole('button', { name: /sam/i })).toBeInTheDocument()
    expect(within(household).getByRole('button', { name: /alex/i })).toBeInTheDocument()
  })

  /**
   * [90] — the label above the two people is "You two", not "Members".
   *
   * Nothing pinned the old string, which is how a user-facing word gets changed by accident. The
   * assertion is deliberately on the **label only**: `HouseholdMember` and `data.members` are
   * untouched, and a test that reached for those would be pinning the rename this task did not do.
   */
  it('calls the two people "You two"', async () => {
    stub()
    renderPage()

    const household = (await screen.findByText('Duel House')).closest('section')!
    expect(within(household).getByText('You two')).toBeInTheDocument()
    expect(within(household).queryByText('Members')).not.toBeInTheDocument()
  })

  /**
   * [79]. A household holds exactly two people, so once the second has joined the code invites
   * nobody — it was the biggest thing on the card and the least useful. Hidden behind a disclosure
   * rather than deleted, because a partner leaving makes it live again.
   */
  it('tucks the invite code away once the household is full', async () => {
    stub()
    renderPage()

    await screen.findByText('Duel House')
    expect(screen.queryByText('BNC4NN')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /show invite code/i }))
    expect(screen.getByText('BNC4NN')).toBeInTheDocument()
  })

  /** The other direction: alone, inviting someone is the whole point of the screen. */
  it('shows the invite code outright while you are alone', async () => {
    stub({ household: { id: 42, name: 'Duel House', inviteCode: 'BNC4NN', members: [MEMBER_ME] } })
    renderPage()

    expect(await screen.findByText('BNC4NN')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /show invite code/i })).not.toBeInTheDocument()
  })

  /**
   * The owner's ask: the members become the substantial thing on the card, and opening one shows
   * what they have to their name — the same three totals your own card carries at the top.
   */
  it('opens a member to reveal their standing totals', async () => {
    stub()
    renderPage()

    const partner = await screen.findByRole('button', { name: /sam/i })
    expect(partner).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(partner)

    expect(partner).toHaveAttribute('aria-expanded', 'true')
    const totals = partner.parentElement!
    expect(totals).toHaveTextContent('64')
    expect(totals).toHaveTextContent('Lifetime pts')
    expect(totals).toHaveTextContent('Coins')
    expect(totals).toHaveTextContent('Streak')
  })

  it('renames with the trimmed name', async () => {
    const calls = stub()
    renderPage()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /rename/i }))
    const input = screen.getByLabelText('Household name')
    await user.clear(input)
    await user.type(input, '  The Nest  ')
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => {
      const patch = calls.find((c) => c.method === 'PATCH')
      expect(patch?.path).toBe('/api/households/45')
      expect(JSON.parse(patch!.body!)).toEqual({ name: 'The Nest' })
    })
  })

  /** The cap is 60 here, and the client knows it — no round trip for a name that cannot be saved. */
  it('sends nothing for a blank or over-long name', async () => {
    const calls = stub()
    renderPage()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /rename/i }))
    const input = screen.getByLabelText('Household name')
    await user.clear(input)
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    expect(await screen.findByText(/give your household a name/i)).toBeInTheDocument()
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(0)

    /*
     * **Pasted, not typed.** `user.type` sends 61 separate key events, each with a React re-render;
     * under v8 coverage instrumentation that was slow enough to blow the test timeout, so this
     * failed only in `npm run coverage` and passed everywhere else. A test that is correct but too
     * slow is still a flake, and pasting is a real user action that exercises the same handler.
     */
    await user.click(input)
    await user.paste('a'.repeat(61))
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    expect(await screen.findByText(/60 characters or fewer/i)).toBeInTheDocument()
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(0)
  })

  it('surfaces the server’s own rejection', async () => {
    stub({
      rename: {
        status: 404,
        body: { error: 'Household not found.', errors: null, traceId: '00-a-b-00' },
      },
    })
    renderPage()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /rename/i }))
    await user.clear(screen.getByLabelText('Household name'))
    await user.type(screen.getByLabelText('Household name'), 'The Nest')
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Household not found.')
  })
})

describe('leaving', () => {
  it('asks first, and sends nothing until confirmed', async () => {
    const calls = stub()
    renderPage()

    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: /leave this household/i }))

    expect(screen.getByText(/leave duel house\?/i)).toBeInTheDocument()
    expect(calls.filter((c) => c.path.endsWith('/leave'))).toHaveLength(0)
  })

  /**
   * The server has two branches and the caller cannot choose (log `015`). With a partner the
   * household survives; alone it is **deleted with everything in it**, and nothing else in the app
   * says so. Asserted in both directions, because a warning that always said "deleted" would be
   * wrong half the time and just as untrustworthy.
   */
  it('names the partner who stays when there are two of you', async () => {
    stub()
    renderPage()

    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: /leave this household/i }))

    expect(screen.getByText(/sam stays/i)).toBeInTheDocument()
    expect(screen.queryByText(/is deleted/i)).not.toBeInTheDocument()
  })

  it('warns that everything is deleted when you are the last member', async () => {
    stub({ household: { ...HOUSEHOLD, members: [{ id: 80, name: 'Alex' }] } })
    renderPage()

    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: /leave this household/i }))

    expect(screen.getByText(/chores, rewards and history — is deleted/i)).toBeInTheDocument()
    expect(screen.queryByText(/stays/i)).not.toBeInTheDocument()
  })

  it('posts to the leave endpoint once confirmed', async () => {
    const calls = stub()
    renderPage()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /leave this household/i }))
    await user.click(screen.getByRole('button', { name: /^leave$/i }))

    await waitFor(() =>
      expect(calls.some((c) => c.path === '/api/households/45/leave' && c.method === 'POST')).toBe(
        true,
      ),
    )
  })

  /**
   * `AuthGate` owns identity-driven routing: leaving invalidates `Me`, `householdId` goes null and
   * the gate redirects. A `navigate()` here would be a second mechanism racing it — the defect
   * `LoginPage` shipped in [42]. The observable is the **refetch of `/api/auth/me`**.
   */
  it('refetches the caller rather than navigating itself', async () => {
    const calls = stub()
    renderPage()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /leave this household/i }))
    await waitFor(() => expect(calls.filter((c) => c.path === '/api/auth/me').length).toBe(1))
    const before = calls.filter((c) => c.path === '/api/auth/me').length

    await user.click(screen.getByRole('button', { name: /^leave$/i }))

    await waitFor(() =>
      expect(calls.filter((c) => c.path === '/api/auth/me').length).toBeGreaterThan(before),
    )
  })

  it('can be backed out of', async () => {
    const calls = stub()
    renderPage()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /leave this household/i }))
    await user.click(screen.getByRole('button', { name: /^stay$/i }))

    expect(screen.queryByText(/leave duel house\?/i)).not.toBeInTheDocument()
    expect(calls.filter((c) => c.path.endsWith('/leave'))).toHaveLength(0)
  })

  it('surfaces a refusal instead of pretending it worked', async () => {
    stub({
      leave: {
        status: 404,
        body: { error: 'Household not found.', errors: null, traceId: '00-a-b-00' },
      },
    })
    renderPage()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /leave this household/i }))
    await user.click(screen.getByRole('button', { name: /^leave$/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Household not found.')
  })
})

/**
 * The dead end this closes: `/pairing` is the only other place an invite code can be typed, and
 * `AuthGate` makes that screen reachable only while you have **no** household. Two people who each
 * created one could never reach each other. Owner's report, 2026-08-07.
 */
describe('joining a partner after you already made a household', () => {
  it('is offered while you are the only member', async () => {
    stub({ household: { ...HOUSEHOLD, members: [{ id: 80, name: 'Alex' }] } })
    renderPage()

    expect(
      await screen.findByRole('button', { name: /join your partner instead/i }),
    ).toBeInTheDocument()
  })

  /**
   * The other direction, and the one that matters: a paired household is not yours alone to
   * abandon. A test that only checked the solo case would pass against a component that offered
   * this to everyone.
   */
  it('is not offered once there are two of you', async () => {
    stub()
    renderPage()

    await screen.findByText('Duel House')
    expect(
      screen.queryByRole('button', { name: /join your partner instead/i }),
    ).not.toBeInTheDocument()
  })

  it('names what is destroyed before asking for the code', async () => {
    stub({ household: { ...HOUSEHOLD, members: [{ id: 80, name: 'Alex' }] } })
    renderPage()

    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: /join your partner instead/i }))

    expect(screen.getByText(/is deleted/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/their invite code/i)).toBeInTheDocument()
  })

  /**
   * Asserted on the request list, not on the error text. A short code that still reached the server
   * would be answered with the `[StringLength(6, MinimumLength = 6)]` sentence — the .NET wording
   * `validateInviteCode` exists to keep off the screen.
   */
  it('sends nothing when the code is the wrong length', async () => {
    const calls = stub({ household: { ...HOUSEHOLD, members: [{ id: 80, name: 'Alex' }] } })
    renderPage()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /join your partner instead/i }))
    await user.type(screen.getByLabelText(/their invite code/i), 'ABC')
    await user.click(screen.getByRole('button', { name: /join and delete this one/i }))

    expect(calls.some((c) => c.path === '/api/households/join')).toBe(false)
    expect(screen.getByText(/6 characters/i)).toBeInTheDocument()
  })

  it('posts a well-formed code, uppercased', async () => {
    const calls = stub({ household: { ...HOUSEHOLD, members: [{ id: 80, name: 'Alex' }] } })
    renderPage()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /join your partner instead/i }))
    await user.type(screen.getByLabelText(/their invite code/i), 'abc234')
    await user.click(screen.getByRole('button', { name: /join and delete this one/i }))

    const join = await waitFor(() => {
      const found = calls.find((c) => c.path === '/api/households/join')
      expect(found).toBeDefined()
      return found!
    })
    expect(JSON.parse(join.body!)).toEqual({ inviteCode: 'ABC234' })
  })

  it('shows the server’s message when the code is unknown, and stays put', async () => {
    stub({
      household: { ...HOUSEHOLD, members: [{ id: 80, name: 'Alex' }] },
      join: {
        status: 404,
        body: { error: 'No household found with that invite code.', errors: null },
      },
    })
    renderPage()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /join your partner instead/i }))
    await user.type(screen.getByLabelText(/their invite code/i), 'ZZZ999')
    await user.click(screen.getByRole('button', { name: /join and delete this one/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No household found with that invite code.',
    )
    // Still on the form, so the code can be corrected rather than retyped from scratch.
    expect(screen.getByLabelText(/their invite code/i)).toHaveValue('ZZZ999')
  })
})
