// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { makeStore } from '../../app/store'
import { signedIn } from '../auth/authSlice'
import { RewardEditor } from './RewardEditor'

const EXISTING = { id: 366, title: 'Full chore day off', coinCost: 80, pausesCompetition: true }

type Recorded = { path: string; method: string; body?: string }

function stub(response?: { status: number; body: unknown }) {
  const calls: Recorded[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: Request) => {
      const url = new URL(input.url)
      const body = input.method === 'GET' ? undefined : await input.clone().text()
      calls.push({ path: url.pathname, method: input.method, body })

      if (url.pathname.startsWith('/api/rewards') && input.method !== 'GET') {
        const r = response ?? {
          status: 200,
          body: { id: 366, title: 'Renamed', coinCost: 12, pausesCompetition: false },
        }
        return new Response(r.status === 204 ? null : JSON.stringify(r.body), {
          status: r.status,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      // Routed by path deliberately: a stub that answers a path it was never told about is a lie
      // with a delayed fuse — the flake that survived [46]–[48].
      return new Response(JSON.stringify({ items: [], total: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }),
  )
  return calls
}

function renderEditor(props: Partial<Parameters<typeof RewardEditor>[0]> = {}) {
  const onDone = vi.fn()
  const onCancel = vi.fn()
  const store = makeStore()
  store.dispatch(signedIn({ token: 'jwt', user: { id: 7, name: 'Alex' } }))
  render(
    <Provider store={store}>
      <RewardEditor onDone={onDone} onCancel={onCancel} {...props} />
    </Provider>,
  )
  return { onDone, onCancel }
}

const sent = (calls: Recorded[], method: string) => calls.filter((c) => c.method === method)

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

// ─── The payloads that must never leave the client ────────────────────────────

describe('client-side validation stops the unpresentable payloads', () => {
  /**
   * `coinCost: null` fails JSON deserialisation and comes back naming
   * `API.Dtos.Rewards.CreateRewardRequest`. Showing an error is not enough — **no request may go
   * out at all**, which is why this asserts on the fetch spy rather than on the screen alone.
   */
  it('sends nothing when the cost is empty', async () => {
    const calls = stub()
    renderEditor()
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Reward'), 'Breakfast in bed')
    await user.click(screen.getByRole('button', { name: /add reward/i }))

    expect(await screen.findByText(/say what it costs in coins/i)).toBeInTheDocument()
    expect(sent(calls, 'POST')).toHaveLength(0)
  })

  /**
   * Above `int.MaxValue`. Found by probing the running API: the value overflows a .NET `int` during
   * JSON deserialisation, so the reply names the DTO type — the identical leak [47] removed from
   * the `coinCost: null` path, reached through the other end of `[Range(1, int.MaxValue)]`. The
   * assertion that matters is the request count, not the message.
   */
  it('sends nothing when the cost is beyond int range', async () => {
    const calls = stub()
    renderEditor()
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Reward'), 'Breakfast in bed')
    await user.type(screen.getByLabelText('Cost in Coins'), '99999999999')
    await user.click(screen.getByRole('button', { name: /add reward/i }))

    expect(await screen.findByText(/more coins than/i)).toBeInTheDocument()
    expect(sent(calls, 'POST')).toHaveLength(0)
  })

  it('sends nothing when the title is blank', async () => {
    const calls = stub()
    renderEditor()
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Cost in Coins'), '30')
    await user.click(screen.getByRole('button', { name: /add reward/i }))

    expect(await screen.findByText(/give the reward a name/i)).toBeInTheDocument()
    expect(sent(calls, 'POST')).toHaveLength(0)
  })

  it('sends nothing for a zero cost, which the server’s Range would reject anyway', async () => {
    const calls = stub()
    renderEditor()
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Reward'), 'Breakfast in bed')
    await user.type(screen.getByLabelText('Cost in Coins'), '0')
    await user.click(screen.getByRole('button', { name: /add reward/i }))

    expect(await screen.findByText(/at least 1 coin/i)).toBeInTheDocument()
    expect(sent(calls, 'POST')).toHaveLength(0)
  })

  it('marks the field so it is announced, not only coloured', async () => {
    stub()
    renderEditor()
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Reward'), 'Breakfast in bed')
    await user.click(screen.getByRole('button', { name: /add reward/i }))

    await waitFor(() =>
      expect(screen.getByLabelText('Cost in Coins')).toHaveAttribute('aria-invalid', 'true'),
    )
  })
})

// ─── Creating ────────────────────────────────────────────────────────────────

describe('creating', () => {
  it('posts the trimmed title and a numeric cost', async () => {
    const calls = stub({
      status: 201,
      body: { id: 400, title: 'Breakfast in bed', coinCost: 30, pausesCompetition: false },
    })
    renderEditor()
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Reward'), '  Breakfast in bed  ')
    await user.type(screen.getByLabelText('Cost in Coins'), '30')
    await user.click(screen.getByRole('button', { name: /add reward/i }))

    await waitFor(() => {
      const post = sent(calls, 'POST')[0]
      expect(post.path).toBe('/api/rewards')
      expect(JSON.parse(post.body!)).toEqual({
        title: 'Breakfast in bed',
        coinCost: 30,
        pausesCompetition: false,
      })
    })
  })

  it('carries the pausing flag when it is ticked', async () => {
    const calls = stub({
      status: 201,
      body: { id: 400, title: 'Day off', coinCost: 80, pausesCompetition: true },
    })
    renderEditor()
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Reward'), 'Day off')
    await user.type(screen.getByLabelText('Cost in Coins'), '80')
    await user.click(screen.getByRole('checkbox', { name: /pauses the duel/i }))
    await user.click(screen.getByRole('button', { name: /add reward/i }))

    await waitFor(() =>
      expect(JSON.parse(sent(calls, 'POST')[0].body!).pausesCompetition).toBe(true),
    )
  })

  it('reports success and clears for the next one', async () => {
    stub({
      status: 201,
      body: { id: 400, title: 'Breakfast in bed', coinCost: 30, pausesCompetition: false },
    })
    const { onDone } = renderEditor()
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Reward'), 'Breakfast in bed')
    await user.type(screen.getByLabelText('Cost in Coins'), '30')
    await user.click(screen.getByRole('button', { name: /add reward/i }))

    await waitFor(() => expect(onDone).toHaveBeenCalledWith('Breakfast in bed added to the store.'))
    expect(screen.getByLabelText('Reward')).toHaveValue('')
  })

  it('shows the server’s own field error when it rejects something', async () => {
    // Captured from the running API: POST with coinCost 0.
    stub({
      status: 400,
      body: {
        error: 'One or more fields are invalid.',
        errors: { CoinCost: ['The field CoinCost must be between 1 and 2147483647.'] },
        traceId: '00-abc-def-00',
      },
    })
    renderEditor()
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Reward'), 'Breakfast in bed')
    await user.type(screen.getByLabelText('Cost in Coins'), '30')
    await user.click(screen.getByRole('button', { name: /add reward/i }))

    // PascalCase key against a camelCase field — `fieldError` matches case-insensitively.
    expect(await screen.findByText(/must be between 1 and 2147483647/i)).toBeInTheDocument()
  })
})

// ─── Editing ─────────────────────────────────────────────────────────────────

describe('editing', () => {
  it('opens pre-filled, flag included', () => {
    stub()
    renderEditor({ reward: EXISTING })

    expect(screen.getByLabelText('Reward')).toHaveValue('Full chore day off')
    expect(screen.getByLabelText('Cost in Coins')).toHaveValue(80)
    expect(screen.getByRole('checkbox', { name: /pauses the duel/i })).toBeChecked()
  })

  it('patches every field, because it always has every field', async () => {
    const calls = stub()
    renderEditor({ reward: EXISTING })
    const user = userEvent.setup()

    await user.clear(screen.getByLabelText('Cost in Coins'))
    await user.type(screen.getByLabelText('Cost in Coins'), '65')
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => {
      const patch = sent(calls, 'PATCH')[0]
      expect(patch.path).toBe('/api/rewards/366')
      expect(JSON.parse(patch.body!)).toEqual({
        title: 'Full chore day off',
        coinCost: 65,
        pausesCompetition: true,
      })
    })
  })

  /** Both directions: a flag that could only ever be set would pass a set-only test. */
  it('can clear the pausing flag', async () => {
    const calls = stub()
    renderEditor({ reward: EXISTING })
    const user = userEvent.setup()

    await user.click(screen.getByRole('checkbox', { name: /pauses the duel/i }))
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() =>
      expect(JSON.parse(sent(calls, 'PATCH')[0].body!).pausesCompetition).toBe(false),
    )
  })
})

// ─── Removing ────────────────────────────────────────────────────────────────

describe('removing', () => {
  it('asks first, and sends nothing until it is confirmed', async () => {
    const calls = stub()
    renderEditor({ reward: EXISTING })
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /remove this reward/i }))

    expect(screen.getByText(/remove full chore day off\?/i)).toBeInTheDocument()
    expect(sent(calls, 'DELETE')).toHaveLength(0)
  })

  /** The user cannot see archiving; they can see that their history survived. Say only that. */
  it('promises what actually survives', async () => {
    stub()
    renderEditor({ reward: EXISTING })

    await userEvent.setup().click(screen.getByRole('button', { name: /remove this reward/i }))

    expect(screen.getByText(/already redeemed stays in your history/i)).toBeInTheDocument()
    expect(screen.queryByText(/archiv/i)).not.toBeInTheDocument()
  })

  it('deletes once confirmed', async () => {
    const calls = stub({ status: 204, body: null })
    const { onDone } = renderEditor({ reward: EXISTING })
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /remove this reward/i }))
    await user.click(screen.getByRole('button', { name: /^remove$/i }))

    await waitFor(() => {
      expect(sent(calls, 'DELETE')[0].path).toBe('/api/rewards/366')
      expect(onDone).toHaveBeenCalledWith('Full chore day off removed.')
    })
  })

  it('can be backed out of', async () => {
    const calls = stub()
    renderEditor({ reward: EXISTING })
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /remove this reward/i }))
    await user.click(screen.getByRole('button', { name: /keep/i }))

    expect(screen.queryByText(/remove full chore day off\?/i)).not.toBeInTheDocument()
    expect(sent(calls, 'DELETE')).toHaveLength(0)
  })
})
