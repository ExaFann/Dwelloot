// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { makeStore } from '../../app/store'
import { signedIn } from '../auth/authSlice'
import { LootBoxReveal } from './LootBoxReveal'

const ME = {
  id: 80,
  name: 'Alex',
  email: 'a@b.c',
  householdId: 45,
  lifetimePoints: 120,
  coins: 0,
  currentWinStreak: 2,
}

/** A body captured from the running API in [51]. */
const BOX = { competitionId: 453, periodType: 'Daily', won: true, isWinWin: false }

const competition = (unopenedLootBox: unknown) => ({
  periodType: 'Daily',
  periodStart: '2026-08-04T12:00:00Z',
  periodEnd: '2026-08-05T12:00:00Z',
  myPoints: 0,
  partnerPoints: 0,
  settled: false,
  voided: false,
  unopenedLootBox,
})

type Overrides = {
  /** Answered in order, so a test can show the queue shortening after an open. */
  boxes?: unknown[]
  open?: { status: number; body: unknown }
}

function stub(o: Overrides = {}) {
  const calls: { path: string; method: string }[] = []
  const boxes = o.boxes ?? [BOX]
  let current = 0

  const json = (body: unknown, status = 200) =>
    Promise.resolve(
      new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
    )

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: Request) => {
      const url = new URL(input.url)
      calls.push({ path: url.pathname, method: input.method })

      if (url.pathname === '/api/auth/me') return json(ME)

      if (url.pathname.endsWith('/competitions/current')) {
        return json(competition(boxes[Math.min(current, boxes.length - 1)] ?? null))
      }

      if (url.pathname.endsWith('/open-box')) {
        // The server hands boxes back oldest-first, so opening one moves the queue along.
        current += 1
        const r = o.open ?? {
          status: 200,
          body: { competitionId: 453, result: 'coins', coinsAwarded: 22, reward: null },
        }
        return json(r.body, r.status)
      }

      // Routed by path: a stub that answers a path it was never told about is a lie with a delayed
      // fuse — the flake that survived [46]–[48].
      return json({ error: 'That endpoint does not exist.', errors: null }, 404)
    }),
  )
  return calls
}

function renderReveal() {
  const store = makeStore()
  store.dispatch(signedIn({ token: 'jwt', user: { id: 80, name: 'Alex' } }))
  render(
    <Provider store={store}>
      <LootBoxReveal />
    </Provider>,
  )
}

const openIt = () => screen.getByRole('button', { name: /open it/i })

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('when there is nothing to open', () => {
  /**
   * The other direction is the test below. A component that always rendered its heading would pass
   * a "shows the box" check on its own — and the dashboard would carry a dead card every day of the
   * week that nobody won anything.
   */
  it('renders nothing at all', async () => {
    const calls = stub({ boxes: [null] })
    renderReveal()

    await waitFor(() => expect(calls.some((c) => c.path.endsWith('/competitions/current'))).toBe(true))
    expect(screen.queryByRole('heading', { name: /loot box/i })).not.toBeInTheDocument()
  })

  /** A loss is indistinguishable from a quiet day here, deliberately: losers are given no box. */
  it('has no losing state to render', async () => {
    stub({ boxes: [null] })
    renderReveal()
    expect(screen.queryByText(/lost|better luck/i)).not.toBeInTheDocument()
  })
})

describe('when a box is waiting', () => {
  it('announces the win by period, without claiming a date', async () => {
    stub()
    renderReveal()

    expect(await screen.findByText(/you won the daily duel/i)).toBeInTheDocument()
    expect(screen.queryByText(/yesterday|today/i)).not.toBeInTheDocument()
  })

  it('says both of you won a win-win', async () => {
    stub({ boxes: [{ ...BOX, isWinWin: true }] })
    renderReveal()

    expect(await screen.findByText(/you both took the daily duel/i)).toBeInTheDocument()
  })

  it('sends nothing until it is opened', async () => {
    const calls = stub()
    renderReveal()
    await screen.findByRole('button', { name: /open it/i })

    expect(calls.filter((c) => c.path.endsWith('/open-box'))).toHaveLength(0)
  })

  it('posts to the competition the payload named', async () => {
    const calls = stub()
    renderReveal()
    await userEvent.setup().click(await screen.findByRole('button', { name: /open it/i }))

    await waitFor(() =>
      expect(
        calls.some((c) => c.path === '/api/households/45/competitions/453/open-box' && c.method === 'POST'),
      ).toBe(true),
    )
  })
})

describe('the reveal', () => {
  it('opens centre-screen with the chest before the prize — [53a]/[53b]', async () => {
    stub()
    renderReveal()
    await userEvent.setup().click(await screen.findByRole('button', { name: /open it/i }))

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveFocus()
    // The chest stage is decorative theatre beside the announced prize, so hidden — and its lid
    // is a separate layer carrying the swing hook, which is what makes it an *opening*.
    const chest = dialog.querySelector('.chest-open')
    expect(chest).not.toBeNull()
    expect(chest).toHaveAttribute('aria-hidden', 'true')
    expect(chest!.querySelector('.lid-pop')).not.toBeNull()
    // The prize is the live region, exactly as before the redesign.
    expect(dialog.querySelector('[role="status"]')).not.toBeNull()
  })

  it('a Coins prize fountains the eight coins; the slab says it with the mark — [53b]', async () => {
    stub()
    renderReveal()
    await userEvent.setup().click(await screen.findByRole('button', { name: /open it/i }))

    const dialog = await screen.findByRole('dialog')
    expect(dialog.querySelectorAll('.coin-fly')).toHaveLength(8)
    // "+22" plus the coin mark plus a sr-only unit — textContent stays exactly "+22 Coins".
    const prize = dialog.querySelector('[role="status"]')!
    expect(prize).toHaveTextContent('+22 Coins')
    expect(prize.querySelector('svg')).not.toBeNull()
  })

  it('a bonus reward gets the gift glyph and no coin fountain', async () => {
    stub({
      open: {
        status: 200,
        body: {
          competitionId: 453,
          result: 'bonusReward',
          coinsAwarded: null,
          reward: { id: 7, title: 'Foot massage' },
        },
      },
    })
    renderReveal()
    await userEvent.setup().click(await screen.findByRole('button', { name: /open it/i }))

    const dialog = await screen.findByRole('dialog')
    expect(dialog.querySelectorAll('.coin-fly')).toHaveLength(0)
    const prize = dialog.querySelector('[role="status"]')!
    expect(prize).toHaveTextContent('Foot massage')
    expect(prize.querySelector('svg')).not.toBeNull()
  })

  /**
   * [79]. The bonus drop is the rare one (10%), so it gets the loud reaction — and only it. Two
   * full-screen effects on the common outcome would make the rare one feel ordinary, which is the
   * assertion in the second half here rather than an unstated intention.
   */
  it('showers confetti for a bonus reward, and none for Coins', async () => {
    stub({
      open: {
        status: 200,
        body: {
          competitionId: 453,
          result: 'bonusReward',
          coinsAwarded: null,
          reward: { id: 7, title: 'Foot massage' },
        },
      },
    })
    renderReveal()
    await userEvent.setup().click(await screen.findByRole('button', { name: /open it/i }))

    const dialog = await screen.findByRole('dialog')
    expect(dialog.querySelectorAll('.confetti-piece').length).toBeGreaterThan(20)
    // Decorative, and it must not eat the click that dismisses the dialog.
    const layer = dialog.querySelector('.confetti-piece')!.parentElement!
    expect(layer).toHaveAttribute('aria-hidden', 'true')
    expect(layer.className).toContain('pointer-events-none')
  })

  it('does not shower confetti on a Coins prize', async () => {
    stub()
    renderReveal()
    await userEvent.setup().click(await screen.findByRole('button', { name: /open it/i }))

    const dialog = await screen.findByRole('dialog')
    expect(dialog.querySelectorAll('.confetti-piece')).toHaveLength(0)
  })

  it('dismisses on a click anywhere', async () => {
    stub({ boxes: [BOX, null] })
    renderReveal()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /open it/i }))
    await user.click(await screen.findByRole('dialog'))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('dismisses on Escape', async () => {
    stub({ boxes: [BOX, null] })
    renderReveal()

    await userEvent.setup().click(await screen.findByRole('button', { name: /open it/i }))
    fireEvent.keyDown(await screen.findByRole('dialog'), { key: 'Escape' })

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('shows the Coin amount the server rolled', async () => {
    stub()
    renderReveal()
    await userEvent.setup().click(await screen.findByRole('button', { name: /open it/i }))

    const prize = await screen.findByRole('status')
    expect(prize).toHaveTextContent('+22 Coins')
  })

  it('shows a bonus reward by name, and that it is already claimed', async () => {
    stub({
      open: {
        status: 200,
        body: {
          competitionId: 453,
          result: 'bonusReward',
          coinsAwarded: null,
          reward: { id: 7, title: 'Foot massage' },
        },
      },
    })
    renderReveal()
    await userEvent.setup().click(await screen.findByRole('button', { name: /open it/i }))

    const prize = await screen.findByRole('status')
    expect(prize).toHaveTextContent('Foot massage')
    expect(screen.getByText(/no coins needed/i)).toBeInTheDocument()
  })

  /**
   * The balance changed, so the Store's affordability and the Me screen must not go stale.
   *
   * The `before` count is taken **after the card has rendered**, not immediately after `render`.
   * Taken too early it is 0, the component's own first `/me` request pushes it to 1, and the
   * assertion passes whether or not opening invalidates anything — which is exactly what a mutation
   * dropping `Me` from `invalidatesTags` proved: this test survived it.
   */
  it('refetches the caller after opening', async () => {
    const calls = stub()
    renderReveal()
    await screen.findByRole('button', { name: /open it/i })
    await waitFor(() => expect(calls.filter((c) => c.path === '/api/auth/me').length).toBe(1))
    const before = calls.filter((c) => c.path === '/api/auth/me').length

    await userEvent.setup().click(openIt())

    await waitFor(() =>
      expect(calls.filter((c) => c.path === '/api/auth/me').length).toBeGreaterThan(before),
    )
  })

  /**
   * The returning-partner case. `UnopenedLootBoxAsync` orders oldest-first so a backlog is worked
   * through in order — this is the assertion that the card actually surfaces the next one instead
   * of disappearing after the first.
   */
  it('reveals the next queued box once the first is dismissed', async () => {
    stub({ boxes: [BOX, { ...BOX, competitionId: 454, periodType: 'Weekly' }, null] })
    renderReveal()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /open it/i }))
    await screen.findByRole('status')
    await user.click(screen.getByRole('button', { name: /nice/i }))

    expect(await screen.findByText(/you won the week/i)).toBeInTheDocument()
  })

  it('disappears when the last box is dismissed', async () => {
    stub({ boxes: [BOX, null] })
    renderReveal()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /open it/i }))
    await screen.findByRole('status')
    await user.click(screen.getByRole('button', { name: /nice/i }))

    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: /loot box/i })).not.toBeInTheDocument(),
    )
  })

  it('surfaces a refusal in the server’s own words', async () => {
    stub({
      open: {
        status: 403,
        body: { error: 'You did not win that period.', errors: null, traceId: '00-a-b-00' },
      },
    })
    renderReveal()
    await userEvent.setup().click(await screen.findByRole('button', { name: /open it/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('You did not win that period.')
    // Still offered, because the refusal may be a stale cache rather than a permanent no.
    expect(openIt()).toBeInTheDocument()
  })
})
