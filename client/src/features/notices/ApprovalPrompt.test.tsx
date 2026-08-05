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
 * The prompt and the nav badge read the same count through `usePendingCount`, so they are tested
 * together: the failure worth catching is the two disagreeing.
 */

const pendingLog = (id: number) => ({
  id,
  activityTitle: 'Vacuum',
  pointsAwarded: 15,
  loggedByUserId: 9,
  status: 'Pending',
  completedAt: '2026-08-05T09:00:00Z',
})

function stub(pending: number) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: Request) => {
      const url = new URL(input.url)
      const body =
        url.pathname === '/api/activity-logs' && url.searchParams.get('status') === 'pending'
          ? { items: Array.from({ length: pending }, (_, i) => pendingLog(i + 1)), total: pending }
          : { error: 'That endpoint does not exist.', errors: null }
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status: url.pathname === '/api/activity-logs' ? 200 : 404,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
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
  it('says how many are waiting, and why it matters', async () => {
    stub(3)
    renderWith(<ApprovalPrompt />)

    expect(await screen.findByText(/3 chores are waiting on you/i)).toBeInTheDocument()
    // The consequence, not a nag: this is what makes it worth acting on.
    expect(screen.getByText(/can’t be settled/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /review them/i })).toHaveAttribute('href', '/notices')
  })

  it('uses the singular for one', async () => {
    stub(1)
    renderWith(<ApprovalPrompt />)
    expect(await screen.findByText(/1 chore is waiting on you/i)).toBeInTheDocument()
  })

  /**
   * The other direction, and the one that matters most: an empty queue must render **nothing**, not
   * an empty card. A prompt that is always present is a prompt nobody reads.
   */
  it('renders nothing at all when the queue is empty', async () => {
    stub(0)
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
    stub(2)
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
    stub(14)
    renderWith(<BottomNav />)
    expect(await screen.findByText('9+')).toBeInTheDocument()
  })

  /** Both directions: no badge when there is nothing to do. */
  it('shows no badge on an empty queue', async () => {
    stub(0)
    renderWith(<BottomNav />)

    const notices = await screen.findByRole('link', { name: /notices/i })
    await vi.waitFor(() => expect(notices).not.toHaveTextContent(/\d/))
    expect(notices).toHaveAccessibleName('Notices')
  })

  it('leaves the other four tabs unmarked', async () => {
    stub(5)
    renderWith(<BottomNav />)
    await screen.findByText('5')

    for (const label of ['Home', 'Log', 'Store', 'Me']) {
      expect(screen.getByRole('link', { name: label })).not.toHaveTextContent(/\d/)
    }
  })
})
