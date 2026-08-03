// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router'
import { makeStore } from '../../app/store'
import { signedIn } from '../auth/authSlice'
import { QuickAddRow } from './QuickAddRow'
import { RecentActivityFeed } from './RecentActivityFeed'
import type { MyActivityLog } from './activityApi'

/** `fetch` routed by path — the components issue their queries concurrently. */
type Routes = {
  activities?: { status: number; body: unknown }
  mine?: { status: number; body: unknown }
  create?: { status: number; body: unknown }
}

const ACTIVITIES = {
  items: [
    { id: 544, title: 'Change the bed sheets', points: 10 },
    { id: 550, title: 'Clean the bathroom', points: 25 },
  ],
  total: 12,
}

const log = (over: Partial<MyActivityLog>): MyActivityLog => ({
  id: 1,
  activityTitle: 'Change the bed sheets',
  pointsAwarded: 10,
  status: 'Approved',
  completedAt: new Date().toISOString(),
  approvedAt: new Date().toISOString(),
  rejectReason: null,
  ...over,
})

function stub(routes: Routes) {
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
      const path = new URL(input.url).pathname
      const search = new URL(input.url).search
      calls.push({ path: path + search, method: input.method })

      if (path === '/api/activities') {
        const r = routes.activities ?? { status: 200, body: ACTIVITIES }
        return json(r.body, r.status)
      }
      if (path === '/api/activity-logs/mine') {
        const r = routes.mine ?? { status: 200, body: { items: [], total: 0 } }
        return json(r.body, r.status)
      }
      if (path === '/api/activity-logs' && input.method === 'POST') {
        const r = routes.create ?? {
          status: 201,
          body: { id: 9, activityId: 1, status: 'Pending', completedAt: new Date().toISOString() },
        }
        return json(r.body, r.status)
      }
      return json({ error: 'That endpoint does not exist.', errors: null }, 404)
    }),
  )
  return calls
}

function renderIt(ui: React.ReactNode) {
  const store = makeStore()
  store.dispatch(signedIn({ token: 'jwt', user: { id: 7, name: 'Alex' } }))
  render(
    <Provider store={store}>
      <MemoryRouter>{ui}</MemoryRouter>
    </Provider>,
  )
  return store
}

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('quick add', () => {
  it('lists the chores with what they are worth', async () => {
    stub({})
    renderIt(<QuickAddRow />)

    expect(await screen.findByRole('button', { name: /change the bed sheets/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /clean the bathroom/i })).toHaveTextContent('25 pts')
  })

  it('asks the server for the five it was told to', async () => {
    const calls = stub({})
    renderIt(<QuickAddRow />)
    await screen.findByRole('button', { name: /change the bed sheets/i })

    const request = calls.find((c) => c.path.startsWith('/api/activities'))
    expect(request?.path).toContain('pageSize=5')
    expect(request?.path).toContain('sort=title')
  })

  it('posts the chore that was tapped, not the first one', async () => {
    const calls = stub({})
    renderIt(<QuickAddRow />)

    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: /clean the bathroom/i }))

    await waitFor(() =>
      expect(calls.some((c) => c.path === '/api/activity-logs' && c.method === 'POST')).toBe(true),
    )
    // Distinguishes "posted something" from "posted the right thing".
    expect(await screen.findByText(/clean the bathroom logged/i)).toBeInTheDocument()
  })

  it('names the chore in its own confirmation', async () => {
    stub({})
    renderIt(<QuickAddRow />)

    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: /change the bed sheets/i }))

    // Per-button, because "Logged." on its own would not say which of five.
    expect(await screen.findByText(/change the bed sheets logged/i)).toBeInTheDocument()
  })

  it('shows the server message on failure and does not claim success', async () => {
    stub({ create: { status: 409, body: { error: 'You are not in a household yet.', errors: null } } })
    renderIt(<QuickAddRow />)

    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: /clean the bathroom/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('You are not in a household yet.')
    expect(screen.queryByText(/logged/i)).not.toBeInTheDocument()
  })

  it('reports an error loading the chores rather than showing an empty row', async () => {
    stub({ activities: { status: 500, body: { error: 'An unexpected error occurred.', errors: null } } })
    renderIt(<QuickAddRow />)

    expect(await screen.findByRole('alert')).toHaveTextContent('An unexpected error occurred.')
    expect(screen.queryByRole('button', { name: /change the bed sheets/i })).not.toBeInTheDocument()
  })

  it('links to the full chore list', async () => {
    stub({})
    renderIt(<QuickAddRow />)
    expect(await screen.findByRole('link', { name: /all chores/i })).toHaveAttribute('href', '/log')
  })
})

describe('the recent feed', () => {
  it('invites a first chore when there is nothing yet', async () => {
    stub({ mine: { status: 200, body: { items: [], total: 0 } } })
    renderIt(<RecentActivityFeed />)
    expect(await screen.findByText(/nothing logged yet/i)).toBeInTheDocument()
  })

  it('credits an approved log', async () => {
    stub({ mine: { status: 200, body: { items: [log({ status: 'Approved', pointsAwarded: 10 })], total: 1 } } })
    renderIt(<RecentActivityFeed />)

    expect(await screen.findByText('+10 pts')).toBeInTheDocument()
    expect(screen.getByText('Approved')).toBeInTheDocument()
  })

  /**
   * Finding 1 in the UI: `pointsAwarded` is populated on pending and rejected rows, where nothing
   * has been or will be credited. Neither may render as a credit.
   */
  it('does not credit a pending log', async () => {
    stub({
      mine: {
        status: 200,
        body: { items: [log({ id: 2, status: 'Pending', pointsAwarded: 25, approvedAt: null })], total: 1 },
      },
    })
    renderIt(<RecentActivityFeed />)

    expect(await screen.findByText(/25 pts if approved/i)).toBeInTheDocument()
    expect(screen.queryByText('+25 pts')).not.toBeInTheDocument()
  })

  it('shows no figure for a rejected log, and gives the reason', async () => {
    stub({
      mine: {
        status: 200,
        body: {
          items: [
            log({
              id: 3,
              status: 'Rejected',
              pointsAwarded: 5,
              approvedAt: null,
              rejectReason: 'You did not actually do this one',
            }),
          ],
          total: 1,
        },
      },
    })
    renderIt(<RecentActivityFeed />)

    expect(await screen.findByText(/no points/i)).toBeInTheDocument()
    expect(screen.getByText(/you did not actually do this one/i)).toBeInTheDocument()
    // The worth must not appear anywhere as a credit.
    expect(screen.queryByText('+5 pts')).not.toBeInTheDocument()
  })
})

describe('what logging invalidates', () => {
  it('refetches the feed', async () => {
    const calls = stub({})
    renderIt(
      <>
        <QuickAddRow />
        <RecentActivityFeed />
      </>,
    )
    await screen.findByRole('button', { name: /clean the bathroom/i })
    const before = calls.filter((c) => c.path.startsWith('/api/activity-logs/mine')).length

    await userEvent.setup().click(screen.getByRole('button', { name: /clean the bathroom/i }))

    await waitFor(() =>
      expect(
        calls.filter((c) => c.path.startsWith('/api/activity-logs/mine')).length,
      ).toBeGreaterThan(before),
    )
  })

  /**
   * Finding 2, as an absence. A new log is `Pending` and the standing counts only approved logs —
   * measured directly, a pending 25-point log left `myPoints` at 10. Invalidating `Competition`
   * would refetch a standing that cannot have changed, and that endpoint runs lazy settlement on
   * every call (§4.7), so it is real server work for a guaranteed no-op.
   */
  it('does not refetch the competition', async () => {
    const calls = stub({})
    renderIt(<QuickAddRow />)
    await screen.findByRole('button', { name: /clean the bathroom/i })

    await userEvent.setup().click(screen.getByRole('button', { name: /clean the bathroom/i }))
    // The announcement, not the badge — "Logged" now appears in both.
    await screen.findByText(/clean the bathroom logged/i)

    expect(calls.some((c) => c.path.includes('/competitions/current'))).toBe(false)
  })
})
