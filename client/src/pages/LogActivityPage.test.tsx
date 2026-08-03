// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router'
import { makeStore } from '../app/store'
import { signedIn } from '../features/auth/authSlice'
import { LogActivityPage } from './LogActivityPage'

const CHORES = [
  { id: 544, title: 'Change the bed sheets', points: 10 },
  { id: 550, title: 'Clean the bathroom', points: 25 },
  { id: 540, title: 'Wash dishes', points: 10 },
]

type Overrides = {
  list?: { status: number; body: unknown }
  create?: { status: number; body: unknown }
  /** Keyed by the `search` term, so a filtered request can return a different list. */
  bySearch?: Record<string, unknown>
}

function stub(overrides: Overrides = {}) {
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
      const body = input.method === 'POST' ? await input.clone().text() : undefined
      calls.push({ path: url.pathname, search: url.search, method: input.method, body })

      if (url.pathname === '/api/activities') {
        const term = url.searchParams.get('search')
        if (term && overrides.bySearch && term in overrides.bySearch) {
          return json(overrides.bySearch[term])
        }
        const r = overrides.list ?? { status: 200, body: { items: CHORES, total: CHORES.length } }
        return json(r.body, r.status)
      }
      if (url.pathname === '/api/activity-logs' && input.method === 'POST') {
        const r = overrides.create ?? {
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

function renderPage() {
  const store = makeStore()
  store.dispatch(signedIn({ token: 'jwt', user: { id: 7, name: 'Alex' } }))
  render(
    <Provider store={store}>
      <MemoryRouter>
        <LogActivityPage />
      </MemoryRouter>
    </Provider>,
  )
}

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('the chore list', () => {
  it('renders every chore with what it is worth', async () => {
    stub()
    renderPage()

    expect(await screen.findByRole('radio', { name: /change the bed sheets/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /clean the bathroom/i })).toBeInTheDocument()
    expect(screen.getByText('25 pts')).toBeInTheDocument()
  })

  /**
   * Asserted through the radio role, which fails if the semantics were faked with divs — that is
   * the whole reason for using a native control here.
   */
  it('is a single-selection radio group', async () => {
    stub()
    renderPage()

    const radios = await screen.findAllByRole('radio')
    expect(radios).toHaveLength(3)
    expect(radios.every((r) => r.getAttribute('name') === 'activityId')).toBe(true)
  })

  it('asks the server for chores, sorted by title', async () => {
    const calls = stub()
    renderPage()
    await screen.findAllByRole('radio')

    const request = calls.find((c) => c.path === '/api/activities')
    expect(request?.search).toContain('category=Chore')
    expect(request?.search).toContain('sort=title')
  })

  it('reports a load failure instead of an empty list', async () => {
    stub({ list: { status: 500, body: { error: 'An unexpected error occurred.', errors: null } } })
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('An unexpected error occurred.')
    expect(screen.queryAllByRole('radio')).toHaveLength(0)
  })
})

describe('selection', () => {
  it('starts with nothing selected and submit disabled', async () => {
    stub()
    renderPage()
    await screen.findAllByRole('radio')

    expect(screen.getAllByRole('radio').every((r) => !(r as HTMLInputElement).checked)).toBe(true)
    expect(screen.getByRole('button', { name: /log this chore/i })).toBeDisabled()
  })

  // The other direction — a form that enabled submit unconditionally would pass "it submits".
  it('enables submit once a chore is chosen', async () => {
    stub()
    renderPage()

    await userEvent.setup().click(await screen.findByRole('radio', { name: /wash dishes/i }))

    expect(screen.getByRole('button', { name: /log this chore/i })).toBeEnabled()
  })

  it('keeps only one chore selected', async () => {
    stub()
    renderPage()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('radio', { name: /wash dishes/i }))
    await user.click(screen.getByRole('radio', { name: /clean the bathroom/i }))

    expect((screen.getByRole('radio', { name: /clean the bathroom/i }) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByRole('radio', { name: /wash dishes/i }) as HTMLInputElement).checked).toBe(false)
  })
})

describe('submitting', () => {
  it('posts the chore that was chosen, not the first in the list', async () => {
    const calls = stub()
    renderPage()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('radio', { name: /wash dishes/i }))
    await user.click(screen.getByRole('button', { name: /log this chore/i }))

    await waitFor(() => {
      const post = calls.find((c) => c.path === '/api/activity-logs' && c.method === 'POST')
      // 540 is Wash dishes; 544 is the first row. The distinction is the point.
      expect(post?.body).toBe(JSON.stringify({ activityId: 540 }))
    })
  })

  it('confirms by name and clears the selection', async () => {
    stub()
    renderPage()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('radio', { name: /clean the bathroom/i }))
    await user.click(screen.getByRole('button', { name: /log this chore/i }))

    expect(await screen.findByRole('status')).toHaveTextContent(/clean the bathroom logged/i)
    // Cleared, so a stray second tap cannot double-log.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /log this chore/i })).toBeDisabled(),
    )
  })

  it('shows the server message on failure and does not confirm', async () => {
    stub({ create: { status: 409, body: { error: 'You are not in a household yet.', errors: null } } })
    renderPage()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('radio', { name: /wash dishes/i }))
    await user.click(screen.getByRole('button', { name: /log this chore/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('You are not in a household yet.')
    expect(screen.queryByText(/logged — waiting/i)).not.toBeInTheDocument()
  })
})

describe('search', () => {
  it('sends the typed term to the server', async () => {
    const calls = stub({ bySearch: { clean: { items: [CHORES[1]], total: 1 } } })
    renderPage()
    await screen.findAllByRole('radio')

    await userEvent.setup().type(screen.getByLabelText('Search'), 'clean')

    await waitFor(() =>
      expect(calls.some((c) => c.path === '/api/activities' && c.search.includes('search=clean'))).toBe(
        true,
      ),
    )
  })

  it('narrows the list to what came back', async () => {
    stub({ bySearch: { clean: { items: [CHORES[1]], total: 1 } } })
    renderPage()
    await screen.findAllByRole('radio')

    await userEvent.setup().type(screen.getByLabelText('Search'), 'clean')

    await waitFor(() => expect(screen.getAllByRole('radio')).toHaveLength(1))
    expect(screen.getByRole('radio', { name: /clean the bathroom/i })).toBeInTheDocument()
  })

  it('says so when nothing matches, rather than showing a bare list', async () => {
    stub({ bySearch: { zzz: { items: [], total: 0 } } })
    renderPage()
    await screen.findAllByRole('radio')

    await userEvent.setup().type(screen.getByLabelText('Search'), 'zzz')

    expect(await screen.findByText(/no chores match/i)).toBeInTheDocument()
  })

  it('does not send an empty search parameter', async () => {
    const calls = stub()
    renderPage()
    await screen.findAllByRole('radio')

    // `search=` would be a filter for the empty string rather than no filter at all.
    expect(calls.every((c) => !c.search.includes('search='))).toBe(true)
  })
})
