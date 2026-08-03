// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { makeStore } from '../../app/store'
import { signedIn } from '../auth/authSlice'
import { HeadToHeadCard } from './HeadToHeadCard'

/**
 * The widget, rendered through the real store so the two queries it depends on actually run.
 *
 * `fetch` is routed by path rather than by call order — the component fires `/me`, the household and
 * the competition concurrently, and an order-indexed stub would make these tests depend on React's
 * scheduling.
 */

const ME = { id: 7, name: 'Alex Kirk', email: 'alex@example.com', householdId: 42 }
const SOLO = [{ id: 7, name: 'Alex Kirk' }]
const PAIRED = [
  { id: 7, name: 'Alex Kirk' },
  { id: 9, name: 'Sam' },
]

type Competition = {
  myPoints: number
  partnerPoints: number
  settled?: boolean
  voided?: boolean
  periodType?: 'Daily' | 'Weekly' | 'Monthly'
  unopenedLootBox?: unknown
}

function stub({
  members = PAIRED,
  competition,
  competitionStatus = 200,
}: {
  members?: { id: number; name: string }[]
  competition?: Competition
  competitionStatus?: number
}) {
  const json = (body: unknown, status = 200) =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

  vi.stubGlobal(
    'fetch',
    vi.fn((input: Request) => {
      const path = new URL(input.url).pathname
      if (path === '/api/auth/me') {
        return json({ ...ME, lifetimePoints: 0, coins: 0, currentWinStreak: 0 })
      }
      if (path === '/api/households/42') {
        return json({ id: 42, name: 'Duel House', inviteCode: 'ABC123', members })
      }
      if (path === '/api/households/42/competitions/current') {
        if (competitionStatus !== 200) {
          return json({ error: 'An unexpected error occurred.', errors: null }, competitionStatus)
        }
        return json({
          periodType: competition?.periodType ?? 'Daily',
          periodStart: '2026-08-02T12:00:00Z',
          periodEnd: '2026-08-03T12:00:00Z',
          myPoints: competition?.myPoints ?? 0,
          partnerPoints: competition?.partnerPoints ?? 0,
          settled: competition?.settled ?? false,
          voided: competition?.voided ?? false,
          unopenedLootBox: competition?.unopenedLootBox ?? null,
        })
      }
      return json({ error: 'That endpoint does not exist.', errors: null }, 404)
    }),
  )
}

function renderCard() {
  const store = makeStore()
  store.dispatch(signedIn({ token: 'jwt', user: { id: 7, name: 'Alex Kirk' } }))
  render(
    <Provider store={store}>
      <HeadToHeadCard />
    </Provider>,
  )
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('while loading', () => {
  it('says so instead of showing a 0–0 duel', async () => {
    stub({ competition: { myPoints: 10, partnerPoints: 0 } })
    renderCard()
    // The scores must not appear before they are known.
    expect(await screen.findByRole('status')).toHaveTextContent(/loading/i)
  })
})

describe('when the competition cannot be loaded', () => {
  it('shows the message and a retry, not an empty scoreboard', async () => {
    stub({ competitionStatus: 500 })
    renderCard()

    expect(await screen.findByRole('alert')).toHaveTextContent('An unexpected error occurred.')
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
    expect(screen.queryByText('pts')).not.toBeInTheDocument()
  })
})

describe('a household of one', () => {
  /**
   * The reason this component fetches the household at all: a solo household's competition payload
   * is an ordinary 0–0 with no field distinguishing it from a quiet two-person day.
   */
  it('invites a partner rather than showing a duel against nobody', async () => {
    stub({ members: SOLO, competition: { myPoints: 0, partnerPoints: 0 } })
    renderCard()

    expect(await screen.findByText(/no one to duel yet/i)).toBeInTheDocument()
    // Both directions: the scoreboard must be absent, not merely zeroed.
    expect(screen.queryByText(/ahead by/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/nothing logged yet/i)).not.toBeInTheDocument()
  })
})

describe('a live period', () => {
  it('shows both scores and names the partner', async () => {
    stub({ competition: { myPoints: 25, partnerPoints: 10 } })
    renderCard()

    expect(await screen.findByText('Sam')).toBeInTheDocument()
    expect(screen.getByText('You')).toBeInTheDocument()
    expect(screen.getByText('25')).toBeInTheDocument()
    expect(screen.getByText('10')).toBeInTheDocument()
  })

  it('says who is ahead', async () => {
    stub({ competition: { myPoints: 25, partnerPoints: 10 } })
    renderCard()
    expect(await screen.findByText(/you're ahead by 15/i)).toBeInTheDocument()
  })

  it('names the partner when they are ahead', async () => {
    stub({ competition: { myPoints: 10, partnerPoints: 25 } })
    renderCard()
    expect(await screen.findByText(/sam is ahead by 15/i)).toBeInTheDocument()
  })

  it('labels the period from its type, not its dates', async () => {
    stub({ competition: { myPoints: 1, partnerPoints: 0, periodType: 'Monthly' } })
    renderCard()
    // periodStart is 2026-08-02T12:00:00Z, which is 3 August in NZ — no date is rendered at all.
    expect(await screen.findByText('This month')).toBeInTheDocument()
  })
})

describe('a voided period', () => {
  /** Must override the score entirely: there is no winner, so nobody is "ahead". */
  it('says the day does not count, and does not claim a lead', async () => {
    stub({ competition: { myPoints: 40, partnerPoints: 10, voided: true } })
    renderCard()

    expect(await screen.findByText(/does not count/i)).toBeInTheDocument()
    expect(screen.queryByText(/ahead by/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/you won/i)).not.toBeInTheDocument()
  })
})

describe('a settled period', () => {
  it('reports the result', async () => {
    stub({ competition: { myPoints: 30, partnerPoints: 5, settled: true } })
    renderCard()
    expect(await screen.findByText(/you won by 25/i)).toBeInTheDocument()
  })

  it('reports a draw without claiming a win-win', async () => {
    stub({ competition: { myPoints: 20, partnerPoints: 20, settled: true } })
    renderCard()

    expect(await screen.findByText(/finished level/i)).toBeInTheDocument()
    expect(screen.queryByText(/win-win/i)).not.toBeInTheDocument()
  })
})

describe('an unopened loot box', () => {
  /** [53] owns the reveal. [45] must neither render it nor break when it is present. */
  it('renders the standing and says nothing about a box', async () => {
    stub({
      competition: {
        myPoints: 30,
        partnerPoints: 5,
        settled: true,
        unopenedLootBox: { competitionId: 55, periodType: 'Daily', won: true, isWinWin: false },
      },
    })
    renderCard()

    expect(await screen.findByText(/you won by 25/i)).toBeInTheDocument()
    expect(screen.queryByText(/loot|box|open/i)).not.toBeInTheDocument()
  })
})
