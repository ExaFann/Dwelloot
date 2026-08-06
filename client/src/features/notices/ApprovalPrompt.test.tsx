// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router'
import { makeStore } from '../../app/store'
import { signedIn } from '../auth/authSlice'
import { ApprovalPrompt } from './ApprovalPrompt'
import { BottomNav } from '../../components/BottomNav'

/**
 * The prompt and the nav badge **no longer read the same count**, and that separation is the subject
 * of most of this file.
 *
 * The badge answers "is there anything for me to do?" and sums chores *and* store changes. The
 * prompt is a yellow card at the top of the first screen after every sign-in, so it earns that space
 * only when something is genuinely stuck: a chore logged **before today**, whose period has already
 * closed and cannot settle until it is decided.
 *
 * Both owner-reported bugs came from the two sharing one number - the card appeared for every chore
 * the partner logged, and after [68] it appeared for a pending *store change* while calling it a
 * "chore".
 */

const PERIOD_START = '2026-08-06T12:00:00Z'

const pendingLog = (id: number, completedAt: string) => ({
  id,
  activityTitle: 'Vacuum',
  pointsAwarded: 15,
  loggedByUserId: 9,
  status: 'Pending',
  completedAt,
})

/**
 * @param overdue chores logged before the current period began - the ones that are stuck
 * @param today chores logged during it - ordinary, and not the prompt's business
 * @param yesterdayEvening overdue chores whose UTC date EQUALS the period start's - see below
 * @param storeChanges pending store changes; the badge counts them, the prompt must not
 */
function stub({
  overdue = 0,
  today = 0,
  yesterdayEvening = 0,
  storeChanges = 0,
}: { overdue?: number; today?: number; yesterdayEvening?: number; storeChanges?: number } = {}) {
  const items = [
    ...Array.from({ length: overdue }, (_, i) => pendingLog(100 + i, '2026-08-05T09:00:00Z')),
    ...Array.from({ length: today }, (_, i) => pendingLog(200 + i, '2026-08-06T20:00:00Z')),
    /*
     * 22:00 the previous evening in NZ — but the SAME UTC calendar date as PERIOD_START
     * (both 2026-08-06). Only an instant comparison classifies it correctly; any date-string
     * slicing calls it "today" and misses it. Mutation testing found the original fixtures never
     * exercised this: both had UTC dates that differed from the period start's, so slicing
     * accidentally agreed with the instant comparison everywhere the suite looked.
     */
    ...Array.from({ length: yesterdayEvening }, (_, i) =>
      pendingLog(300 + i, '2026-08-06T10:00:00Z'),
    ),
  ]

  vi.stubGlobal(
    'fetch',
    vi.fn((input: Request) => {
      const url = new URL(input.url)
      const p = url.pathname
      const json = (body: unknown, status = 200) =>
        Promise.resolve(
          new Response(JSON.stringify(body), {
            status,
            headers: { 'Content-Type': 'application/json' },
          }),
        )

      if (p === '/api/auth/me') {
        return json({
          id: 7,
          name: 'Alex',
          email: 'alex@example.com',
          householdId: 42,
          lifetimePoints: 0,
          coins: 0,
          currentWinStreak: 0,
          avatarKey: null,
        })
      }
      if (p === '/api/households/42/competitions/current') {
        return json({
          periodType: 'Daily',
          periodStart: PERIOD_START,
          periodEnd: '2026-08-07T12:00:00Z',
          myPoints: 0,
          partnerPoints: 0,
          settled: false,
          voided: false,
          unopenedLootBox: null,
        })
      }
      if (p === '/api/reward-changes') {
        return json(Array.from({ length: storeChanges }, (_, i) => ({ id: i + 1, kind: 'Update' })))
      }
      if (p === '/api/activity-logs' && url.searchParams.get('status') === 'pending') {
        return json({ items, total: items.length })
      }
      // Routed by path; anything unknown is a 404 rather than a convenient body.
      return json({ error: 'That endpoint does not exist.', errors: null }, 404)
    }),
  )
}

function renderWith(node: React.ReactNode) {
  const store = makeStore()
  store.dispatch(signedIn({ token: 'jwt', user: { id: 7, name: 'Alex' } }))
  render(
    <Provider store={store}>
      <MemoryRouter>{node}</MemoryRouter>
    </Provider>,
  )
}

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('the dashboard prompt', () => {
  it('says how many are overdue, and why it matters', async () => {
    stub({ overdue: 3 })
    renderWith(<ApprovalPrompt />)

    expect(
      await screen.findByText(/3 chores from before today are still waiting/i),
    ).toBeInTheDocument()
    // The consequence, not a nag - and one that has already happened, not one that might.
    expect(screen.getByText(/can’t be settled until you decide/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /review them/i })).toHaveAttribute('href', '/notices')
  })

  it('uses the singular for one', async () => {
    stub({ overdue: 1 })
    renderWith(<ApprovalPrompt />)
    expect(
      await screen.findByText(/1 chore from before today is still waiting/i),
    ).toBeInTheDocument()
  })

  /**
   * The first owner-reported bug. A chore logged today is ordinary: the nav badge and the Notices
   * tab already say it is there, and approving it before midnight costs nothing. A card that appears
   * every time the partner logs anything is a card people learn to look past.
   */
  it('stays silent for chores logged today, however many', async () => {
    stub({ today: 5 })
    renderWith(<ApprovalPrompt />)

    await vi.waitFor(() =>
      expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument(),
    )
  })

  /**
   * The second owner-reported bug, and the more absurd one: re-pricing a reward announced itself as
   * "1 chore is waiting on you", because the prompt read the badge's summed count.
   */
  it('stays silent for a pending store change', async () => {
    stub({ storeChanges: 2 })
    renderWith(<ApprovalPrompt />)

    await vi.waitFor(() =>
      expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument(),
    )
    expect(screen.queryByText(/chore/i)).not.toBeInTheDocument()
  })

  /**
   * The NZ boundary case, and the one a date-string comparison gets wrong.
   *
   * `periodStart` is a UTC instant at *local* midnight, so a chore logged yesterday evening NZ time
   * shares a UTC calendar date with today's period start. `slice(0, 10)` comparison — the trap
   * handover §5 and log `045` both record — files it under "today" and stays silent about a chore
   * that is genuinely holding a settled day open. This fixture is what kills that mutation.
   */
  it('counts a chore from yesterday evening even when its UTC date matches today’s', async () => {
    stub({ yesterdayEvening: 1 })
    renderWith(<ApprovalPrompt />)

    expect(
      await screen.findByText(/1 chore from before today is still waiting/i),
    ).toBeInTheDocument()
  })

  /** All three at once: only the overdue one is counted, so the number cannot silently include the rest. */
  it('counts only the overdue chores when all three are present', async () => {
    stub({ overdue: 1, today: 4, storeChanges: 3 })
    renderWith(<ApprovalPrompt />)

    expect(
      await screen.findByText(/1 chore from before today is still waiting/i),
    ).toBeInTheDocument()
  })

  /**
   * The other direction, and the one that matters most: an empty queue must render **nothing**, not
   * an empty card. A prompt that is always present is a prompt nobody reads.
   */
  it('renders nothing at all when the queue is empty', async () => {
    stub()
    const { container } = (() => {
      const store = makeStore()
      store.dispatch(signedIn({ token: 'jwt', user: { id: 7, name: 'Alex' } }))
      return render(
        <Provider store={store}>
          <MemoryRouter>
            <ApprovalPrompt />
          </MemoryRouter>
        </Provider>,
      )
    })()

    // Wait for the query to settle, then assert the absence rather than racing it.
    await vi.waitFor(() => expect(container.querySelector('section')).toBeNull())
    expect(screen.queryByText(/waiting on you/i)).not.toBeInTheDocument()
  })
})

describe('the nav badge', () => {
  it('marks the Notices tab with the count', async () => {
    stub({ today: 2 })
    renderWith(<BottomNav />)

    /*
     * Waits for the **badge**, not for the tab. The link is static markup and resolves immediately,
     * so asserting on it first races the pending query — the "waiting for something that was never
     * going to be late" trap from log `048`, which this test hit on its first run.
     */
    const badge = await screen.findByText('2')
    const notices = screen.getByRole('link', { name: /notices/i })
    expect(notices).toContainElement(badge)
    // The count reaches a screen reader as words, not just as a coloured chip.
    expect(notices).toHaveAccessibleName(/2 waiting on you/i)
  })

  it('caps a long queue rather than breaking the tab', async () => {
    stub({ today: 14 })
    renderWith(<BottomNav />)
    expect(await screen.findByText('9+')).toBeInTheDocument()
  })

  /** Both directions: no badge when there is nothing to do. */
  it('shows no badge on an empty queue', async () => {
    stub()
    renderWith(<BottomNav />)

    const notices = await screen.findByRole('link', { name: /notices/i })
    await vi.waitFor(() => expect(notices).not.toHaveTextContent(/\d/))
    expect(notices).toHaveAccessibleName('Notices')
  })

  it('leaves the other four tabs unmarked', async () => {
    stub({ today: 5 })
    renderWith(<BottomNav />)
    await screen.findByText('5')

    for (const label of ['Home', 'Log', 'Store', 'Me']) {
      expect(screen.getByRole('link', { name: label })).not.toHaveTextContent(/\d/)
    }
  })
})
