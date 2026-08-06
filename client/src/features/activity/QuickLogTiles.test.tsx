// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router'
import { makeStore } from '../../app/store'
import { signedIn } from '../auth/authSlice'
import { QuickLogTiles } from './QuickLogTiles'

/**
 * The dashboard's one-tap logging — [46]'s tile wall, and the **undo window** that stands in for a
 * delete endpoint that does not exist.
 *
 * It was the largest untested surface in the client at 33% when [59] measured: the component that
 * owns the only protection against an irreversible write had no test of its own.
 */

const CHORES = [
  { id: 1, title: 'Wash dishes', points: 10 },
  { id: 2, title: 'Change the bed sheets', points: 25 },
  { id: 3, title: 'Vacuum', points: 15 },
]

type Recorded = { path: string; search: string; method: string; body?: string }

function stub({ chores = CHORES, status = 200 }: { chores?: unknown[]; status?: number } = {}) {
  const calls: Recorded[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: Request) => {
      const url = new URL(input.url)
      const body = input.method === 'GET' ? undefined : await input.clone().text()
      calls.push({ path: url.pathname, search: url.search, method: input.method, body })

      const json = (b: unknown, s = 200) =>
        new Response(JSON.stringify(b), {
          status: s,
          headers: { 'Content-Type': 'application/json' },
        })

      if (url.pathname === '/api/activities') {
        if (status !== 200)
          return json({ error: 'An unexpected error occurred.', errors: null }, status)
        return json({ items: chores, total: chores.length })
      }
      if (url.pathname === '/api/activity-logs' && input.method === 'POST') {
        return json(
          { id: 99, activityId: 1, status: 'Pending', completedAt: '2026-08-06T00:00:00Z' },
          201,
        )
      }
      // Routed by path; anything unknown is a 404 rather than a convenient body.
      return json({ error: 'That endpoint does not exist.', errors: null }, 404)
    }),
  )
  return calls
}

function renderTiles() {
  const store = makeStore()
  store.dispatch(signedIn({ token: 'jwt', user: { id: 7, name: 'Alex' } }))
  render(
    <Provider store={store}>
      <MemoryRouter>
        <QuickLogTiles />
      </MemoryRouter>
    </Provider>,
  )
}

const tile = (name: RegExp) => screen.getByRole('button', { name })
const posts = (calls: Recorded[]) =>
  calls.filter((c) => c.path === '/api/activity-logs' && c.method === 'POST')

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('the wall', () => {
  it('shows a tile per chore', async () => {
    stub()
    renderTiles()

    expect(await screen.findByRole('button', { name: /wash dishes/i })).toBeInTheDocument()
    expect(tile(/change the bed sheets/i)).toBeInTheDocument()
    expect(tile(/^vacuum$/i)).toBeInTheDocument()
  })

  /**
   * [46]'s decision, and it is easy to undo by accident: points on every tile turn a wall of names
   * into a price list and cost a line of width each. They live on the Log tab instead.
   */
  it('shows no point values', async () => {
    stub()
    renderTiles()
    await screen.findByRole('button', { name: /wash dishes/i })

    expect(screen.queryByText(/10 pts/i)).not.toBeInTheDocument()
    expect(screen.queryByText('25')).not.toBeInTheDocument()
  })

  it('offers a route to the full list', async () => {
    stub()
    renderTiles()
    expect(await screen.findByRole('link', { name: /all chores/i })).toHaveAttribute('href', '/log')
  })

  it('says so when the household has no chores', async () => {
    stub({ chores: [] })
    renderTiles()
    expect(await screen.findByText(/no chores in your household yet/i)).toBeInTheDocument()
  })

  it('reports a load failure with a retry rather than an empty wall', async () => {
    stub({ status: 500 })
    renderTiles()

    expect(await screen.findByRole('alert')).toHaveTextContent('An unexpected error occurred.')
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })
})

describe('the undo window', () => {
  /**
   * **Fake timers are switched on after the tiles have loaded, not before.**
   *
   * Starting a test with them installed stalls RTK Query — the initial `/api/activities` request
   * never settles, and all six of these timed out at 5s each on the first run. The component has to
   * reach its loaded state on real timers first; only the 5-second window needs faking.
   *
   * Clicks go through `fireEvent` rather than `userEvent` for the same reason: `userEvent` binds to
   * a timer implementation when it is set up, so it has to be configured before the switch it is
   * about to invalidate.
   */
  async function loaded() {
    const calls = stub()
    renderTiles()
    await screen.findByRole('button', { name: /wash dishes/i })
    vi.useFakeTimers()
    return calls
  }

  /**
   * The rule the whole component exists for: **a tap sends nothing yet.** There is no
   * `DELETE /api/activity-logs/{id}`, so the only moment an accidental tap can be taken back is
   * before the request goes out. Asserted on the fetch spy — "shows an Undo button" and "has not
   * sent anything" are different claims.
   */
  it('queues without sending, and keeps not sending', async () => {
    const calls = await loaded()

    fireEvent.click(tile(/wash dishes/i))

    expect(screen.getByRole('status')).toHaveTextContent(/wash dishes logged/i)
    expect(screen.getByRole('button', { name: /undo/i })).toBeInTheDocument()
    expect(posts(calls)).toHaveLength(0)

    /*
     * A full second later, still nothing. Asserting only immediately after the tap was too weak:
     * `setTimeout(fn, 0)` also defers past a synchronous check, so the original version passed
     * against a **zero-length** window — caught by mutating `UNDO_WINDOW_MS` to 0 and seeing this
     * test survive. The claim is "there is a window", so the test has to sit inside one.
     */
    await vi.advanceTimersByTimeAsync(1000)
    expect(posts(calls)).toHaveLength(0)
    expect(screen.getByRole('button', { name: /undo/i })).toBeInTheDocument()
  })

  it('sends once the window closes', async () => {
    const calls = await loaded()

    fireEvent.click(tile(/wash dishes/i))

    // One tick short of the window: still nothing sent. Both sides of the threshold.
    await vi.advanceTimersByTimeAsync(4999)
    expect(posts(calls)).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(1)
    expect(posts(calls)).toHaveLength(1)
    expect(JSON.parse(posts(calls)[0].body!)).toEqual({ activityId: 1 })
  })

  it('undo cancels it, and nothing ever reaches the server', async () => {
    const calls = await loaded()

    fireEvent.click(tile(/wash dishes/i))
    fireEvent.click(screen.getByRole('button', { name: /undo/i }))

    await vi.advanceTimersByTimeAsync(10_000)
    expect(posts(calls)).toHaveLength(0)
    expect(screen.queryByText(/wash dishes logged/i)).not.toBeInTheDocument()
  })

  /**
   * The second thing the queue buys, and the reason [46] chose this design over a confirmation: a
   * double tap cannot produce two logs, because the chore is already queued when the second tap
   * lands.
   */
  it('a double tap logs once', async () => {
    const calls = await loaded()

    fireEvent.click(tile(/wash dishes/i))
    fireEvent.click(tile(/wash dishes/i))

    await vi.advanceTimersByTimeAsync(6000)
    expect(posts(calls)).toHaveLength(1)
  })

  it('queues two different chores independently', async () => {
    const calls = await loaded()

    fireEvent.click(tile(/wash dishes/i))
    fireEvent.click(tile(/^vacuum$/i))

    await vi.advanceTimersByTimeAsync(6000)
    expect(posts(calls)).toHaveLength(2)
    expect(
      posts(calls)
        .map((c) => JSON.parse(c.body!).activityId)
        .sort(),
    ).toEqual([1, 3])
  })

  /** A queued tile is marked, so the state is not carried by the notice alone. */
  it('marks a queued tile as pressed', async () => {
    await loaded()

    expect(tile(/wash dishes/i)).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(tile(/wash dishes/i))
    expect(tile(/wash dishes/i)).toHaveAttribute('aria-pressed', 'true')
  })
})

/**
 * Task [73] — the wall is a shortlist now.
 *
 * It used to ask for the whole catalogue and render whatever came back, capped only by the server's
 * default page size, so a household with thirty chores got thirty tiles and no way to thin them.
 * The filter is the entire fix, and it is invisible on screen — the tiles look identical whether or
 * not it was sent — so only an assertion on the **request** can hold it.
 */
describe('the wall asks for the shortlist', () => {
  it('sends isQuick=true', async () => {
    const calls = stub()
    renderTiles()

    await screen.findByRole('button', { name: /dishes/i })

    const list = calls.find((c) => c.path === '/api/activities')
    expect(list).toBeDefined()
    expect(new URLSearchParams(list!.search).get('isQuick')).toBe('true')
  })

  /** Still chores, still sorted — the new filter must not have displaced the old parameters. */
  it('keeps the category and sort it already sent', async () => {
    const calls = stub()
    renderTiles()

    await screen.findByRole('button', { name: /dishes/i })

    const params = new URLSearchParams(calls.find((c) => c.path === '/api/activities')!.search)
    expect(params.get('category')).toBe('Chore')
    expect(params.get('sort')).toBe('title')
  })
})

/**
 * Task [73], second pass — curating the wall **from the wall**.
 *
 * The flag shipped with only one way in: select a chore on the Log tab, open its editor, untick.
 * The owner's objection was that nothing on the dashboard suggested the wall was editable at all,
 * so you would have to already know the setting existed in order to go looking for it on another
 * screen. Discoverability is the feature here, so the assertions are about what is *visible*.
 */
describe('choosing what is on the wall', () => {
  const chooser = () => screen.getByRole('button', { name: /choose/i })

  it('offers a control beside the wall', async () => {
    stub()
    renderTiles()
    await screen.findByRole('button', { name: /dishes/i })

    expect(chooser()).toBeInTheDocument()
    expect(chooser()).toHaveAttribute('aria-expanded', 'false')
  })

  /**
   * The manager lists the **whole** catalogue, not just what is already on the wall — a manager that
   * showed only the current members could remove but never add, which is half a control.
   */
  it('lists every chore, including ones already off the wall', async () => {
    const calls = stub()
    renderTiles()
    await screen.findByRole('button', { name: /dishes/i })

    fireEvent.click(chooser())

    await waitFor(() => {
      const unfiltered = calls.filter(
        (c) => c.path === '/api/activities' && !new URLSearchParams(c.search).has('isQuick'),
      )
      expect(unfiltered.length).toBeGreaterThan(0)
    })
  })

  it('closes again', async () => {
    stub()
    renderTiles()
    await screen.findByRole('button', { name: /dishes/i })

    fireEvent.click(chooser())
    expect(chooser()).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(chooser())
    expect(chooser()).toHaveAttribute('aria-expanded', 'false')
  })

  /** The change is household-wide, and the heading has to say so — it is not a personal setting. */
  it('says the choice is shared', async () => {
    stub()
    renderTiles()
    await screen.findByRole('button', { name: /dishes/i })

    fireEvent.click(chooser())

    expect(await screen.findByText(/for both of you/i)).toBeInTheDocument()
  })
})
