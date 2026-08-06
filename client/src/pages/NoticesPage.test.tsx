// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router'
import { makeStore } from '../app/store'
import { signedIn } from '../features/auth/authSlice'
import { NoticesPage } from './NoticesPage'

const ME = {
  id: 7,
  name: 'Alex',
  email: 'a@b.c',
  householdId: 42,
  lifetimePoints: 0,
  coins: 0,
  currentWinStreak: 0,
}

const PENDING = [
  {
    id: 39,
    activityTitle: 'Vacuum',
    pointsAwarded: 15,
    loggedByUserId: 9,
    status: 'Pending',
    completedAt: new Date().toISOString(),
  },
  {
    id: 32,
    activityTitle: 'Mow the lawn',
    pointsAwarded: 25,
    loggedByUserId: 9,
    status: 'Pending',
    completedAt: new Date().toISOString(),
  },
]

type Overrides = {
  rewardChanges?: unknown
  prizes?: unknown
  pending?: unknown
  bulk?: { status: number; body: unknown }
  reject?: { status: number; body: unknown }
  redemptions?: unknown
  partnerLogs?: unknown
  myLogs?: unknown
  myRedemptions?: unknown
}

function stub(o: Overrides = {}) {
  const calls: { path: string; search: string; method: string; body?: string }[] = []
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
      calls.push({ path: url.pathname, search: url.search, method: input.method, body })
      const p = url.pathname

      if (p === '/api/auth/me') return json(ME)
      if (p === '/api/households/42') {
        return json({
          id: 42,
          name: 'House',
          inviteCode: 'X',
          members: [
            { id: 7, name: 'Alex' },
            { id: 9, name: 'Sam' },
          ],
        })
      }
      if (p === '/api/activity-logs' && input.method === 'GET') {
        // The queue and the partner feed share this path; `status` distinguishes them.
        if (url.searchParams.get('status') === 'pending') {
          return json(o.pending ?? { items: PENDING, total: PENDING.length })
        }
        return json(o.partnerLogs ?? { items: [], total: 0 })
      }
      if (p === '/api/activity-logs/mine') return json(o.myLogs ?? { items: [], total: 0 })

      /*
       * Task [68] gave this screen a fourth section, so the page now requests this path too. Left
       * unstubbed it fell through to the catch-all 404 and rendered a *second* `role="alert"`,
       * breaking a bulk-approve test that had nothing to do with store changes.
       *
       * The same signature as the flake that survived [46]–[48], from the other side: there, a
       * stub answered a path it was never told about; here, a new query arrived at a stub that
       * correctly refuses unknown paths. Adding a query to a shared screen is how both happen.
       */
      if (p === '/api/reward-changes') return json(o.rewardChanges ?? [])

      /*
       * Task [36a] gave the Prizes section a third source. **Third time this exact thing has
       * happened**: a new query on a shared screen falls through the catch-all 404 and breaks
       * unrelated tests on the same page. The catch-all is right to refuse unknown paths — the
       * lesson is that adding a query to a shared screen is a change to that screen's stub.
       */
      if (p === '/api/households/42/competitions/history') {
        return json(o.prizes ?? { items: [], total: 0 })
      }
      if (p === '/api/redemptions/mine') return json(o.myRedemptions ?? { items: [], total: 0 })
      if (p === '/api/redemptions') return json(o.redemptions ?? { items: [], total: 0 })
      if (p === '/api/activity-logs/bulk-approve') {
        const r = o.bulk ?? {
          status: 200,
          body: { approved: PENDING.map((x) => x.id), skipped: [] },
        }
        return json(r.body, r.status)
      }
      if (p.endsWith('/reject')) {
        const r = o.reject ?? {
          status: 200,
          body: { id: 39, status: 'Rejected', approvedAt: null },
        }
        return json(r.body, r.status)
      }
      return json({ error: 'That endpoint does not exist.', errors: null }, 404)
    }),
  )
  return calls
}

function renderPage() {
  const store = makeStore()
  store.dispatch(signedIn({ token: 'jwt', user: { id: 7, name: 'Alex' } }))
  render(
    <Provider store={store}>
      <MemoryRouter>
        <NoticesPage />
      </MemoryRouter>
    </Provider>,
  )
}

const row = (name: RegExp) => screen.getByRole('button', { name })

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

// ─── Section 1: the queue ─────────────────────────────────────────────────────

describe('the approval queue', () => {
  it('lists the partner’s pending chores with what each is worth', async () => {
    stub()
    renderPage()

    expect(await screen.findByRole('button', { name: /^vacuum/i })).toHaveTextContent('15 pts')
    expect(row(/^mow the lawn/i)).toHaveTextContent('25 pts')
  })

  it('asks for pending only', async () => {
    const calls = stub()
    renderPage()
    await screen.findByRole('button', { name: /^vacuum/i })

    expect(
      calls.some((c) => c.path === '/api/activity-logs' && c.search.includes('status=pending')),
    ).toBe(true)
  })

  it('celebrates an empty queue rather than showing a bare heading', async () => {
    stub({ pending: { items: [], total: 0 } })
    renderPage()

    expect(await screen.findByText(/nothing waiting on you/i)).toBeInTheDocument()
    // No action bar when there is nothing to act on.
    expect(screen.queryByRole('button', { name: /^approve/i })).not.toBeInTheDocument()
  })
})

describe('selection', () => {
  it('starts empty with Approve disabled', async () => {
    stub()
    renderPage()
    await screen.findByRole('button', { name: /^vacuum/i })

    expect(row(/^vacuum/i)).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: /^approve$/i })).toBeDisabled()
  })

  it('counts a multi-selection', async () => {
    stub()
    renderPage()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /^vacuum/i }))
    await user.click(row(/^mow the lawn/i))

    expect(screen.getByRole('button', { name: /approve 2/i })).toBeEnabled()
  })

  /** Reject needs one subject and a reason typed against it. */
  it('offers Reject for one selection and not for two', async () => {
    stub()
    renderPage()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /^vacuum/i }))
    expect(screen.getByRole('button', { name: /^reject$/i })).toBeInTheDocument()

    await user.click(row(/^mow the lawn/i))
    expect(screen.queryByRole('button', { name: /^reject$/i })).not.toBeInTheDocument()
  })
})

describe('bulk approve', () => {
  it('sends the chosen ids', async () => {
    const calls = stub()
    renderPage()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /^mow the lawn/i }))
    await user.click(screen.getByRole('button', { name: /^approve$/i }))

    await waitFor(() => {
      const post = calls.find((c) => c.path === '/api/activity-logs/bulk-approve')
      // 32 is Mow the lawn; 39 is the first row. Sending the first would also "work".
      expect(JSON.parse(post!.body!)).toEqual({ ids: [32] })
    })
  })

  /**
   * The finding: the endpoint returns 200 with a `skipped` array, so the count must come from the
   * response. This is the assertion that fails against a UI counting its own request.
   */
  it('reports what the server did, not what was asked', async () => {
    stub({
      bulk: {
        status: 200,
        body: { approved: [39], skipped: [{ id: 32, reason: 'NotPending' }] },
      },
    })
    renderPage()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /^vacuum/i }))
    await user.click(row(/^mow the lawn/i))
    await user.click(screen.getByRole('button', { name: /approve 2/i }))

    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent('Approved 1 chore.')
    expect(status).toHaveTextContent(/already been dealt with/i)
    expect(status).not.toHaveTextContent(/approved 2/i)
  })

  it('surfaces a real failure', async () => {
    stub({
      bulk: { status: 409, body: { error: 'You are not in a household yet.', errors: null } },
    })
    renderPage()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /^vacuum/i }))
    await user.click(screen.getByRole('button', { name: /^approve$/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('You are not in a household yet.')
  })
})

describe('rejecting', () => {
  it('asks for a reason before sending anything', async () => {
    const calls = stub()
    renderPage()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /^vacuum/i }))
    await user.click(screen.getByRole('button', { name: /^reject$/i }))

    expect(screen.getByLabelText('Reason')).toBeInTheDocument()
    expect(calls.filter((c) => c.path.endsWith('/reject'))).toHaveLength(0)
  })

  /** The server requires a visible character; checking here saves a round trip. */
  it('refuses a blank reason without calling the server', async () => {
    const calls = stub()
    renderPage()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /^vacuum/i }))
    await user.click(screen.getByRole('button', { name: /^reject$/i }))
    await user.type(screen.getByLabelText('Reason'), '   ')
    await user.click(screen.getByRole('button', { name: /^reject$/i }))

    expect(await screen.findByText(/say why/i)).toBeInTheDocument()
    expect(calls.filter((c) => c.path.endsWith('/reject'))).toHaveLength(0)
  })

  it('sends the trimmed reason with the right id', async () => {
    const calls = stub()
    renderPage()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /^vacuum/i }))
    await user.click(screen.getByRole('button', { name: /^reject$/i }))
    await user.type(screen.getByLabelText('Reason'), '  bins are still full  ')
    await user.click(screen.getByRole('button', { name: /^reject$/i }))

    await waitFor(() => {
      const patch = calls.find((c) => c.path.endsWith('/reject'))
      expect(patch?.path).toBe('/api/activity-logs/39/reject')
      expect(JSON.parse(patch!.body!)).toEqual({ reason: 'bins are still full' })
    })
  })

  it('can be cancelled', async () => {
    const calls = stub()
    renderPage()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /^vacuum/i }))
    await user.click(screen.getByRole('button', { name: /^reject$/i }))
    await user.click(screen.getByRole('button', { name: /cancel/i }))

    expect(screen.queryByLabelText('Reason')).not.toBeInTheDocument()
    expect(calls.filter((c) => c.path.endsWith('/reject'))).toHaveLength(0)
  })
})

describe('approving refreshes the standing', () => {
  /**
   * Approving turns a pending log into points, so unlike creating one it *does* move the score. The
   * observable is a refetch of the queue after the mutation invalidates `ActivityLog`.
   */
  it('refetches the queue after a bulk approve', async () => {
    const calls = stub()
    renderPage()
    const user = userEvent.setup()
    await screen.findByRole('button', { name: /^vacuum/i })

    const before = calls.filter((c) => c.search.includes('status=pending')).length
    await user.click(row(/^vacuum/i))
    await user.click(screen.getByRole('button', { name: /^approve$/i }))

    await waitFor(() =>
      expect(calls.filter((c) => c.search.includes('status=pending')).length).toBeGreaterThan(
        before,
      ),
    )
  })
})

// ─── Sections 2 and 3 ─────────────────────────────────────────────────────────

describe('the prize & redeem feed', () => {
  const MY_REDEMPTION = {
    id: 40,
    rewardId: 3,
    rewardTitle: 'Takeaway night',
    coinsSpent: 80,
    redeemedAt: '2026-08-04T10:00:00Z',
  }
  const THEIR_REDEMPTION = {
    id: 41,
    userId: 9,
    rewardId: 4,
    rewardTitle: 'Saturday lie-in',
    coinsSpent: 60,
    redeemedAt: '2026-08-04T11:00:00Z',
  }

  /** The owner's point: a two-person app whose feed shows one person tells half the story. */
  it('shows both partners, newest first', async () => {
    stub({
      myRedemptions: { items: [MY_REDEMPTION], total: 1 },
      redemptions: { items: [THEIR_REDEMPTION], total: 1 },
    })
    renderPage()

    const section = (await screen.findByText(/redeemed saturday lie-in/i)).closest('section')!
    const rows = [...section.querySelectorAll('li')].map((li) => li.textContent ?? '')
    // Theirs is an hour later, so it leads.
    expect(rows[0]).toMatch(/saturday lie-in/i)
    expect(rows[1]).toMatch(/takeaway night/i)
  })

  it('says who, and shows what was actually paid', async () => {
    stub({
      myRedemptions: { items: [MY_REDEMPTION], total: 1 },
      redemptions: { items: [THEIR_REDEMPTION], total: 1 },
    })
    renderPage()

    expect(await screen.findByText(/you redeemed takeaway night/i)).toBeInTheDocument()
    // The partner's name arrives from a separate household request; before it lands the row reads
    // "Your partner redeemed …", so this has to wait rather than assert against the placeholder.
    expect(await screen.findByText(/sam redeemed saturday lie-in/i)).toBeInTheDocument()
    // `coinsSpent` verbatim — a snapshot, never the reward's current price.
    expect(screen.getByText('−80')).toBeInTheDocument()
    expect(screen.getByText('−60')).toBeInTheDocument()
  })

  it('asks both endpoints, which partition the household', async () => {
    const calls = stub()
    renderPage()
    await screen.findByRole('heading', { name: /prizes & rewards/i })

    await waitFor(() => {
      expect(calls.some((c) => c.path === '/api/redemptions/mine')).toBe(true)
      expect(
        calls.some((c) => c.path === '/api/redemptions' && c.search.includes('excludeMine=true')),
      ).toBe(true)
    })
  })

  it('has an empty state that explains how prizes happen', async () => {
    stub()
    renderPage()
    // Copy widened in [36a]: the section now shows prizes *won* as well as Coins spent, so
    // "nothing claimed" was describing only half of what can appear here.
    expect(await screen.findByText(/win a period, open the box/i)).toBeInTheDocument()
  })

  /**
   * Task [36a] — the section is called "Prizes & rewards" and until now every row read
   * "<someone> redeemed <something>" with a **−N** figure. A section named for prizes showed only
   * Coins *leaving*.
   */
  it('shows a won Coin prize with a plus, beside spending with a minus', async () => {
    stub({
      myRedemptions: {
        items: [
          {
            id: 1,
            userId: 7,
            rewardId: 5,
            rewardTitle: 'Takeaway night',
            coinsSpent: 30,
            redeemedAt: '2026-08-06T10:00:00Z',
          },
        ],
        total: 1,
      },
      prizes: {
        items: [
          {
            competitionId: 9,
            userId: 7, // the signed-in user, so the row reads "You won …"
            periodType: 'Daily',
            result: 'coins',
            coinsAwarded: 25,
            reward: null,
            openedAt: '2026-08-06T11:00:00Z',
          },
        ],
        total: 1,
      },
    })
    renderPage()

    expect(await screen.findByText(/you won/i)).toBeInTheDocument()
    expect(screen.getByText('+25')).toBeInTheDocument()
    expect(screen.getByText('−30')).toBeInTheDocument()
  })

  /**
   * **The owner's actual requirement, pinned in one render:** anything a person *obtains* shows up
   * here, however they got it. There are exactly four ways, and all four are on screen at once.
   *
   * Worth one test rather than four, because the risk is not that a row type renders — each is
   * covered elsewhere — it is that the three sources stop *merging*. They are three separate
   * queries concatenated and re-sorted, so a mistake there drops a whole category silently while
   * every individual row type still passes its own test.
   */
  it('shows everything either partner obtained, however they got it', async () => {
    stub({
      myRedemptions: {
        items: [
          {
            id: 1,
            userId: 7,
            rewardId: 5,
            rewardTitle: 'Takeaway night',
            coinsSpent: 30,
            redeemedAt: '2026-08-06T09:00:00Z',
          },
        ],
        total: 1,
      },
      redemptions: {
        items: [
          {
            id: 2,
            userId: 39,
            rewardId: 6,
            rewardTitle: 'Foot massage',
            coinsSpent: 40,
            redeemedAt: '2026-08-06T10:00:00Z',
          },
        ],
        total: 1,
      },
      prizes: {
        items: [
          {
            competitionId: 9,
            userId: 7,
            periodType: 'Daily',
            result: 'coins',
            coinsAwarded: 25,
            reward: null,
            openedAt: '2026-08-06T11:00:00Z',
          },
          {
            competitionId: 10,
            userId: 39,
            periodType: 'Weekly',
            result: 'bonusReward',
            coinsAwarded: null,
            reward: { id: 7, title: 'Breakfast in bed' },
            openedAt: '2026-08-06T12:00:00Z',
          },
        ],
        total: 2,
      },
    })
    renderPage()

    // 1. bought by me   2. bought by the partner
    expect(await screen.findByText(/you redeemed takeaway night/i)).toBeInTheDocument()
    expect(screen.getByText(/sam redeemed foot massage/i)).toBeInTheDocument()
    // 3. Coins won from a box   4. a reward won from a box
    expect(screen.getByText(/you won/i)).toBeInTheDocument()
    expect(screen.getByText(/sam won breakfast in bed/i)).toBeInTheDocument()

    // And the direction is legible at a glance, which is the point of the section.
    expect(screen.getByText('−30')).toBeInTheDocument()
    expect(screen.getByText('−40')).toBeInTheDocument()
    expect(screen.getByText('+25')).toBeInTheDocument()
  })

  /**
   * A won reward carries **no number at all**. A prize has no price — the reward's identity is what
   * was won — and inventing a figure would imply one.
   */
  it('shows a won reward by name, with no Coin figure', async () => {
    stub({
      prizes: {
        items: [
          {
            competitionId: 9,
            userId: 39, // the partner
            periodType: 'Weekly',
            result: 'bonusReward',
            coinsAwarded: null,
            reward: { id: 7, title: 'Breakfast in bed' },
            openedAt: '2026-08-06T11:00:00Z',
          },
        ],
        total: 1,
      },
    })
    renderPage()

    expect(await screen.findByText(/won breakfast in bed/i)).toBeInTheDocument()
    expect(screen.queryByText(/^[+−]\d/)).not.toBeInTheDocument()
  })
})

describe('the chores feed', () => {
  const MY_LOG = {
    id: 85,
    activityTitle: 'Wash dishes',
    pointsAwarded: 10,
    status: 'Approved',
    completedAt: '2026-08-04T08:00:00Z',
    approvedAt: '2026-08-04T09:00:00Z',
    rejectReason: null,
  }
  const THEIR_LOG = {
    id: 90,
    activityTitle: 'Mop the floors',
    pointsAwarded: 15,
    loggedByUserId: 9,
    status: 'Pending',
    completedAt: '2026-08-04T09:30:00Z',
  }

  it('shows both partners, newest first', async () => {
    stub({ myLogs: { items: [MY_LOG], total: 1 }, partnerLogs: { items: [THEIR_LOG], total: 1 } })
    renderPage()

    const section = (await screen.findByText('Mop the floors')).closest('section')!
    const rows = [...section.querySelectorAll('li')].map((li) => li.textContent ?? '')
    expect(rows[0]).toMatch(/mop the floors/i)
    expect(rows[1]).toMatch(/wash dishes/i)
  })

  /** The marker the section exists for, and it is a word rather than only a colour. */
  it('marks whether each one counted', async () => {
    stub({ myLogs: { items: [MY_LOG], total: 1 }, partnerLogs: { items: [THEIR_LOG], total: 1 } })
    renderPage()

    const mine = (await screen.findByText('Wash dishes')).closest('li')!
    expect(mine).toHaveTextContent('Approved')
    expect(mine).toHaveTextContent('+10')

    const theirs = screen.getByText('Mop the floors').closest('li')!
    expect(theirs).toHaveTextContent('Waiting')
    // Pending points are not earned, so never a plus.
    expect(theirs).toHaveTextContent('(15)')
    expect(theirs).not.toHaveTextContent('+15')
  })

  it('names who logged each one', async () => {
    stub({ myLogs: { items: [MY_LOG], total: 1 }, partnerLogs: { items: [THEIR_LOG], total: 1 } })
    renderPage()

    // The partner's name arrives from a separate household request, so wait for it rather than
    // asserting against the "Partner" placeholder that renders first.
    await waitFor(() =>
      expect(screen.getByText('Mop the floors').closest('li')).toHaveTextContent('Sam'),
    )
    expect(screen.getByText('Wash dishes').closest('li')).toHaveTextContent('You')
  })

  it('has nothing to press — it is a record, not a decision', async () => {
    stub({ myLogs: { items: [MY_LOG], total: 1 } })
    renderPage()

    const section = (await screen.findByText('Wash dishes')).closest('section')!
    expect(section.querySelectorAll('button')).toHaveLength(0)
  })

  it('has its own empty state', async () => {
    stub()
    renderPage()
    expect(await screen.findByText(/nothing logged by either of you yet/i)).toBeInTheDocument()
  })
})
