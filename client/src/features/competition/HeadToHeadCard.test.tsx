// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
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
  periodStart?: string
  unopenedLootBox?: unknown
}

/**
 * Routed by **path and `periodType`**.
 *
 * The card now subscribes to three periods at once, and a stub that answered every `periodType` with
 * the same body would put identical numbers in all three panels — every `getByText('25')` would find
 * three nodes and the suite could not tell a working three-period card from one that rendered the
 * day three times. Same failure as the "one body for every path" stub that survived [46]–[48], one
 * level down in the query string.
 */
function stub({
  members = PAIRED,
  competition,
  weekly,
  monthly,
  competitionStatus = 200,
  myLogs = [],
  partnerLogs = [],
  deleteLog,
}: {
  members?: { id: number; name: string }[]
  competition?: Competition
  weekly?: Competition
  monthly?: Competition
  competitionStatus?: number
  myLogs?: unknown[]
  partnerLogs?: unknown[]
  /** The DELETE's answer. Routed explicitly ([78]) so a refusal is not the catch-all's 404. */
  deleteLog?: { status: number; body: unknown }
}) {
  const json = (body: unknown, status = 200) =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

  const period = (c: Competition | undefined, type: 'Daily' | 'Weekly' | 'Monthly') => ({
    periodType: c?.periodType ?? type,
    periodStart: c?.periodStart ?? '2026-08-02T12:00:00Z',
    periodEnd: '2026-08-03T12:00:00Z',
    myPoints: c?.myPoints ?? 0,
    partnerPoints: c?.partnerPoints ?? 0,
    settled: c?.settled ?? false,
    voided: c?.voided ?? false,
    unopenedLootBox: c?.unopenedLootBox ?? null,
  })

  vi.stubGlobal(
    'fetch',
    vi.fn((input: Request) => {
      const url = new URL(input.url)
      const path = url.pathname
      if (path === '/api/auth/me') {
        return json({ ...ME, lifetimePoints: 0, coins: 0, currentWinStreak: 0 })
      }
      if (path === '/api/households/42') {
        return json({ id: 42, name: 'Duel House', inviteCode: 'ABC123', members })
      }
      if (input.method === 'DELETE' && path.startsWith('/api/activity-logs/')) {
        return deleteLog ? json(deleteLog.body, deleteLog.status) : json(null, 204)
      }
      if (path === '/api/activity-logs/mine') return json({ items: myLogs, total: myLogs.length })
      if (path === '/api/activity-logs')
        return json({ items: partnerLogs, total: partnerLogs.length })
      if (path === '/api/households/42/competitions/current') {
        if (competitionStatus !== 200) {
          return json({ error: 'An unexpected error occurred.', errors: null }, competitionStatus)
        }
        const type = url.searchParams.get('periodType')
        if (type === 'Weekly') return json(period(weekly, 'Weekly'))
        if (type === 'Monthly') return json(period(monthly, 'Monthly'))
        return json(period(competition, 'Daily'))
      }
      return json({ error: 'That endpoint does not exist.', errors: null }, 404)
    }),
  )
}

/**
 * Scopes an assertion to one period's panel, since three are on screen at once and each carries its
 * own score and verdict. Uses the panel's `role="group"` label rather than walking up from the text,
 * which returned the header row and silently excluded the bar and the sentence below it.
 */
function panel(label: string): HTMLElement {
  return screen.getByRole('group', { name: label })
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
  /**
   * The card **keeps its shape** solo. It used to collapse to a single sentence, so a user who had
   * logged chores before their partner arrived saw no trace of them on the one screen whose job is
   * to show what they have done. The owner reported it; this is the assertion that it stays fixed.
   */
  it('still shows your own side — avatar and the chores you logged today', async () => {
    stub({
      members: SOLO,
      competition: { myPoints: 0, partnerPoints: 0 },
      myLogs: [
        {
          id: 1,
          activityTitle: 'Vacuum the lounge',
          pointsAwarded: 15,
          status: 'Approved',
          completedAt: '2026-08-02T20:00:00Z',
        },
      ],
    })
    renderCard()

    expect(await screen.findByText('You')).toBeInTheDocument()
    expect(screen.getByText('Vacuum the lounge')).toBeInTheDocument()
  })

  it('offers the invite code, because it is the only useful action left', async () => {
    stub({ members: SOLO, competition: { myPoints: 0, partnerPoints: 0 } })
    renderCard()

    expect(await screen.findByText('ABC123')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /copy code/i })).toBeInTheDocument()
  })

  /**
   * Both directions. The scoreboard must be **absent**, not merely zeroed — a card that rendered
   * three 0–0 panels beside the invite would pass any check that only looked for the invite.
   */
  it('renders no duel at all', async () => {
    stub({ members: SOLO, competition: { myPoints: 0, partnerPoints: 0 } })
    renderCard()

    await screen.findByText('You')
    expect(screen.queryByText(/ahead by/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/^today$/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/this week/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/this month/i)).not.toBeInTheDocument()
  })

  /** Green means "your opponent" everywhere else, so nothing on the empty seat may wear it. */
  it('does not dress the empty seat as a real partner', async () => {
    stub({ members: SOLO, competition: { myPoints: 0, partnerPoints: 0 } })
    renderCard()

    expect(await screen.findByText(/no partner yet/i)).toBeInTheDocument()
    expect(document.querySelector('.bg-success')).toBeNull()
  })
})

describe('a live period', () => {
  it('shows both scores and names the partner', async () => {
    stub({ competition: { myPoints: 25, partnerPoints: 10 } })
    renderCard()

    expect(await screen.findByText('Sam')).toBeInTheDocument()
    expect(screen.getByText('You')).toBeInTheDocument()
    expect(panel('Today')).toHaveTextContent('25')
    expect(panel('Today')).toHaveTextContent('10')
  })

  /**
   * The three periods are independent readings, not one number repeated. This is the assertion that
   * fails against a card that renders the day three times — which is what the old stub allowed.
   */
  it('shows the day, the week and the month with their own scores', async () => {
    stub({
      competition: { myPoints: 5, partnerPoints: 0 },
      weekly: { myPoints: 120, partnerPoints: 5 },
      monthly: { myPoints: 300, partnerPoints: 40 },
    })
    renderCard()

    await screen.findByText('Today')
    expect(panel('Today')).toHaveTextContent('5')
    expect(panel('This week')).toHaveTextContent('120')
    expect(panel('This month')).toHaveTextContent('300')
    // Both directions: the week's number must not be the day's repeated three times.
    expect(panel('Today')).not.toHaveTextContent('120')
  })

  it('says who is ahead', async () => {
    stub({ competition: { myPoints: 25, partnerPoints: 10 } })
    renderCard()
    expect(await screen.findAllByText(/you're ahead by 15/i)).not.toHaveLength(0)
  })

  it('names the partner when they are ahead', async () => {
    stub({ competition: { myPoints: 10, partnerPoints: 25 } })
    renderCard()
    await screen.findByText('Today')
    expect(within(panel('Today')).getByText(/sam is ahead by 15/i)).toBeInTheDocument()
  })

  it('labels the period from its type, not its dates', async () => {
    stub({ competition: { myPoints: 1, partnerPoints: 0 } })
    renderCard()
    // periodStart is 2026-08-02T12:00:00Z, which is 3 August in NZ — no date is rendered at all.
    expect(await screen.findByText('This month')).toBeInTheDocument()
    expect(screen.queryByText(/aug|august|2026/i)).not.toBeInTheDocument()
  })
})

describe('a voided period', () => {
  /** Must override the score entirely: there is no winner, so nobody is "ahead". */
  it('says the day does not count, and does not claim a lead', async () => {
    stub({ competition: { myPoints: 40, partnerPoints: 10, voided: true } })
    renderCard()

    await screen.findByText('Today')
    expect(within(panel('Today')).getByText(/does not count/i)).toBeInTheDocument()
    expect(within(panel('Today')).queryByText(/ahead by/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/you won/i)).not.toBeInTheDocument()
  })
})

describe('a settled period', () => {
  it('reports the result', async () => {
    stub({ competition: { myPoints: 30, partnerPoints: 5, settled: true } })
    renderCard()
    await screen.findByText('Today')
    expect(within(panel('Today')).getByText(/you won by 25/i)).toBeInTheDocument()
  })

  it('reports a draw without claiming a win-win', async () => {
    stub({ competition: { myPoints: 20, partnerPoints: 20, settled: true } })
    renderCard()

    await screen.findByText('Today')
    expect(within(panel('Today')).getByText(/finished level/i)).toBeInTheDocument()
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

    await screen.findByText('Today')
    expect(within(panel('Today')).getByText(/you won by 25/i)).toBeInTheDocument()
    expect(screen.queryByText(/loot|box|open/i)).not.toBeInTheDocument()
  })
})

/**
 * Task [71] — removing your own pending chore, asserted **at this level** rather than only on
 * `RecentChoresColumn`.
 *
 * This is where the bug was. The card renders that column in two places — a solo branch and a
 * paired one — and only the solo branch was given the `onRemove` callback. So the control appeared
 * exactly where nobody would ever look for it, and was missing from the ordinary case. The owner
 * found it by using the app.
 *
 * `RecentChoresColumn.test.tsx` could not have caught it: it renders the column directly and passes
 * the callback itself, so it tests what the column does **given** a callback and never that anybody
 * hands it one. An assertion positioned where the difference cannot appear — §7.1's catalogue, in a
 * new place.
 */
describe('removing your own pending chore', () => {
  const pendingMine = {
    id: 77,
    activityTitle: 'Dishes',
    pointsAwarded: 10,
    status: 'Pending',
    completedAt: '2026-08-02T20:00:00Z',
  }

  it('offers the control on your own column while paired', async () => {
    stub({ competition: { myPoints: 0, partnerPoints: 0 }, myLogs: [pendingMine] })
    renderCard()

    expect(await screen.findByRole('button', { name: /remove dishes/i })).toBeInTheDocument()
  })

  /** The other direction: your partner's pending chore is theirs — approve or reject, not delete. */
  it('offers none on the partner’s column', async () => {
    stub({
      competition: { myPoints: 0, partnerPoints: 0 },
      partnerLogs: [{ ...pendingMine, id: 88, activityTitle: 'Vacuum' }],
    })
    renderCard()

    await screen.findByText('Vacuum')
    expect(screen.queryByRole('button', { name: /remove vacuum/i })).not.toBeInTheDocument()
  })

  /** And in the solo layout, which is the branch that already worked. */
  it('offers the control while solo too', async () => {
    stub({ members: SOLO, competition: { myPoints: 0, partnerPoints: 0 }, myLogs: [pendingMine] })
    renderCard()

    expect(await screen.findByRole('button', { name: /remove dishes/i })).toBeInTheDocument()
  })

  /**
   * [78]. The delete used to be `void removeLog({ id })` — fire and forget — so a refusal left the
   * row sitting there with nothing said. That was survivable behind a one-tap ×; behind a confirm
   * it is a broken promise, because the confirm's whole claim is "press Delete and this goes". The
   * likeliest real refusal is the partner approving the chore a second earlier.
   */
  it('says why when the delete is refused', async () => {
    stub({
      competition: { myPoints: 0, partnerPoints: 0 },
      myLogs: [pendingMine],
      deleteLog: {
        status: 409,
        body: { error: 'That chore has already been approved.', errors: null },
      },
    })
    renderCard()

    fireEvent.click(await screen.findByRole('button', { name: /remove dishes/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete Dishes' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That chore has already been approved.',
    )
  })
})

describe('finding the other periods', () => {
  /**
   * [91b], owner's report. Below `lg` only Today is on screen and the three dots say *where you
   * are*, not *that you can move* — so a first-time user can reasonably conclude the app has no week
   * or month at all. The words are the affordance; the dots stay because they are the position.
   */
  it('says the other periods are a swipe away', async () => {
    stub({})
    renderCard()

    expect(await screen.findByText(/swipe for week & month/i)).toBeInTheDocument()
  })
})
