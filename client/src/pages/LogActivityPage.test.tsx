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
      const body = input.method === 'GET' ? undefined : await input.clone().text()
      calls.push({ path: url.pathname, search: url.search, method: input.method, body })

      if (url.pathname === '/api/activities' && input.method === 'GET') {
        const term = url.searchParams.get('search')
        if (term && overrides.bySearch && term in overrides.bySearch) {
          return json(overrides.bySearch[term])
        }
        const r = overrides.list ?? { status: 200, body: { items: CHORES, total: CHORES.length } }
        return json(r.body, r.status)
      }
      if (url.pathname === '/api/activity-logs' && input.method === 'POST') {
        return json({ id: 9, activityId: 1, status: 'Pending', completedAt: '' }, 201)
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

const chore = (name: RegExp) => screen.getByRole('button', { name })

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('the chore list', () => {
  it('renders every chore with what it is worth', async () => {
    stub()
    renderPage()

    expect(await screen.findByRole('button', { name: /^change the bed sheets/i })).toBeInTheDocument()
    expect(chore(/^clean the bathroom/i)).toHaveTextContent('25 pts')
  })

  it('asks the server for chores sorted by title', async () => {
    const calls = stub()
    renderPage()
    await screen.findByRole('button', { name: /^change the bed sheets/i })

    const request = calls.find((c) => c.path === '/api/activities')
    expect(request?.search).toContain('category=Chore')
    expect(request?.search).toContain('sort=title')
    /*
     * And ascending. Since [78] added a sort control, `sort=title` alone no longer pins the order:
     * `Name Z–A` sends the same field. Without this line, making Z–A the default would leave the
     * list reversed on load and this test still green.
     */
    expect(request?.search).not.toContain('descending')
  })

  it('reports a load failure instead of an empty list', async () => {
    stub({ list: { status: 500, body: { error: 'An unexpected error occurred.', errors: null } } })
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('An unexpected error occurred.')
  })
})

describe('selection', () => {
  it('starts with nothing selected and the log button disabled', async () => {
    stub()
    renderPage()
    await screen.findByRole('button', { name: /^change the bed sheets/i })

    expect(chore(/^wash dishes/i)).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: /log this chore/i })).toBeDisabled()
  })

  it('selects on tap and enables logging', async () => {
    stub()
    renderPage()

    await userEvent.setup().click(await screen.findByRole('button', { name: /^wash dishes/i }))

    expect(chore(/^wash dishes/i)).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /log this chore/i })).toBeEnabled()
  })

  it('deselects on a second tap', async () => {
    stub()
    renderPage()
    const user = userEvent.setup()

    const target = await screen.findByRole('button', { name: /^wash dishes/i })
    await user.click(target)
    await user.click(target)

    expect(chore(/^wash dishes/i)).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: /log this chore/i })).toBeDisabled()
  })

  /** Multi-select is the point — logging a morning's worth of chores should be one action. */
  it('keeps several selected at once and counts them', async () => {
    stub()
    renderPage()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /^wash dishes/i }))
    await user.click(chore(/^clean the bathroom/i))

    expect(chore(/^wash dishes/i)).toHaveAttribute('aria-pressed', 'true')
    expect(chore(/^clean the bathroom/i)).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /log 2 chores/i })).toBeEnabled()
  })
})

describe('logging a selection', () => {
  it('queues every selected chore', async () => {
    stub()
    renderPage()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /^wash dishes/i }))
    await user.click(chore(/^clean the bathroom/i))
    await user.click(screen.getByRole('button', { name: /log 2 chores/i }))

    expect(await screen.findByText(/wash dishes logged/i)).toBeInTheDocument()
    expect(screen.getByText(/clean the bathroom logged/i)).toBeInTheDocument()
  })

  /**
   * Nothing is sent during the undo window — there is no endpoint to delete a log, so this is the
   * only moment an accidental tap can be taken back.
   */
  it('sends nothing straight away, and offers undo', async () => {
    const calls = stub()
    renderPage()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /^wash dishes/i }))
    await user.click(screen.getByRole('button', { name: /log this chore/i }))

    await screen.findByText(/wash dishes logged/i)
    expect(calls.filter((c) => c.path === '/api/activity-logs')).toHaveLength(0)
    expect(screen.getByRole('button', { name: /undo/i })).toBeInTheDocument()
  })

  it('clears the selection so the same chores cannot be logged twice by mistake', async () => {
    stub()
    renderPage()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /^wash dishes/i }))
    await user.click(screen.getByRole('button', { name: /log this chore/i }))

    await screen.findByText(/wash dishes logged/i)
    expect(chore(/^wash dishes/i)).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: /log this chore/i })).toBeDisabled()
  })

  it('undo removes the pending row', async () => {
    stub()
    renderPage()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /^wash dishes/i }))
    await user.click(screen.getByRole('button', { name: /log this chore/i }))
    await screen.findByText(/wash dishes logged/i)

    await user.click(screen.getByRole('button', { name: /undo/i }))

    await waitFor(() => expect(screen.queryByText(/wash dishes logged/i)).not.toBeInTheDocument())
  })
})

describe('reaching edit without a hidden gesture', () => {
  /**
   * The discoverability answer: Edit appears as a consequence of selecting one chore, so there is
   * nothing to know in advance. Long-press is a shortcut on top, not the only route.
   */
  it('offers Edit once exactly one chore is selected', async () => {
    stub()
    renderPage()

    await userEvent.setup().click(await screen.findByRole('button', { name: /^wash dishes/i }))

    expect(screen.getByRole('button', { name: /edit wash dishes/i })).toBeInTheDocument()
  })

  // Both directions — "edit" has no single subject when several are selected.
  it('hides Edit when nothing, or more than one, is selected', async () => {
    stub()
    renderPage()
    const user = userEvent.setup()
    await screen.findByRole('button', { name: /^wash dishes/i })

    expect(screen.queryByRole('button', { name: /^edit /i })).not.toBeInTheDocument()

    await user.click(chore(/^wash dishes/i))
    await user.click(chore(/^clean the bathroom/i))

    expect(screen.queryByRole('button', { name: /^edit /i })).not.toBeInTheDocument()
  })

  it('opens the editor from the action bar', async () => {
    stub()
    renderPage()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /^wash dishes/i }))
    await user.click(screen.getByRole('button', { name: /edit wash dishes/i }))

    expect(screen.getByLabelText('Chore')).toHaveValue('Wash dishes')
    expect(screen.getByRole('button', { name: /remove this chore/i })).toBeInTheDocument()
  })
})

describe('sorting — [78]', () => {
  it('sends the field and direction the chosen option means', async () => {
    const calls = stub()
    renderPage()
    await screen.findByRole('button', { name: /^wash dishes/i })

    await userEvent.setup().selectOptions(screen.getByLabelText('Sort'), 'z-a')

    await waitFor(() =>
      expect(
        calls.some(
          (c) =>
            c.path === '/api/activities' &&
            c.search.includes('sort=title') &&
            c.search.includes('descending=true'),
        ),
      ).toBe(true),
    )
  })

  /**
   * The other field, and the reason the owner asked: a control that could only ever re-order by
   * title would pass the test above. `points` is the second of the two the API accepts.
   */
  it('can sort by what a chore is worth', async () => {
    const calls = stub()
    renderPage()
    await screen.findByRole('button', { name: /^wash dishes/i })

    await userEvent.setup().selectOptions(screen.getByLabelText('Sort'), 'most')

    await waitFor(() =>
      expect(
        calls.some((c) => c.search.includes('sort=points') && c.search.includes('descending=true')),
      ).toBe(true),
    )
  })

  it('sends ascending without a descending flag at all', async () => {
    const calls = stub()
    renderPage()
    await screen.findByRole('button', { name: /^wash dishes/i })

    await userEvent.setup().selectOptions(screen.getByLabelText('Sort'), 'fewest')

    await waitFor(() =>
      expect(calls.some((c) => c.search.includes('sort=points'))).toBe(true),
    )
    // `descending=false` is the server's default and says nothing; sending it is noise.
    expect(calls.every((c) => !c.search.includes('descending'))).toBe(true)
  })
})

describe('search', () => {
  it('sends the typed term to the server', async () => {
    const calls = stub({ bySearch: { clean: { items: [CHORES[1]], total: 1 } } })
    renderPage()
    await screen.findByRole('button', { name: /^wash dishes/i })

    await userEvent.setup().type(screen.getByLabelText('Search'), 'clean')

    await waitFor(() =>
      expect(calls.some((c) => c.path === '/api/activities' && c.search.includes('search=clean'))).toBe(
        true,
      ),
    )
  })

  it('says so when nothing matches', async () => {
    stub({ bySearch: { zzz: { items: [], total: 0 } } })
    renderPage()
    await screen.findByRole('button', { name: /^wash dishes/i })

    await userEvent.setup().type(screen.getByLabelText('Search'), 'zzz')

    expect(await screen.findByText(/no chores match/i)).toBeInTheDocument()
  })

  it('does not send an empty search parameter', async () => {
    const calls = stub()
    renderPage()
    await screen.findByRole('button', { name: /^wash dishes/i })

    // `search=` would be a filter for the empty string rather than no filter at all.
    expect(calls.every((c) => !c.search.includes('search='))).toBe(true)
  })
})

describe('adding a chore', () => {
  it('opens the editor in create mode', async () => {
    stub()
    renderPage()

    await userEvent.setup().click(await screen.findByRole('button', { name: /new custom chore/i }))

    expect(screen.getByLabelText('Chore')).toHaveValue('')
    // Nothing to remove yet.
    expect(screen.queryByRole('button', { name: /remove this chore/i })).not.toBeInTheDocument()
  })
})
