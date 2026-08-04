// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { makeStore } from '../../app/store'
import { signedIn } from '../auth/authSlice'
import { ChoreEditor } from './ChoreEditor'

const EXISTING = { id: 544, title: 'Change the bed sheets', points: 10 }

type Recorded = { path: string; method: string; body?: string }

function stub(response?: { status: number; body: unknown }) {
  const calls: Recorded[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: Request) => {
      const url = new URL(input.url)
      const body = input.method === 'GET' ? undefined : await input.clone().text()
      calls.push({ path: url.pathname, method: input.method, body })

      if (url.pathname.startsWith('/api/activities') && input.method !== 'GET') {
        const r = response ?? { status: 200, body: { id: 544, title: 'Renamed', points: 12 } }
        return new Response(r.status === 204 ? null : JSON.stringify(r.body), {
          status: r.status,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ items: [], total: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }),
  )
  return calls
}

function renderEditor(props: Partial<Parameters<typeof ChoreEditor>[0]> = {}) {
  const onDone = vi.fn()
  const onCancel = vi.fn()
  const store = makeStore()
  store.dispatch(signedIn({ token: 'jwt', user: { id: 7, name: 'Alex' } }))
  render(
    <Provider store={store}>
      <ChoreEditor onDone={onDone} onCancel={onCancel} {...props} />
    </Provider>,
  )
  return { onDone, onCancel }
}

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

// ─── The bug this component was rebuilt around ────────────────────────────────

describe('client-side validation stops the unpresentable payloads', () => {
  /**
   * The defect: an empty points box went to the server as `points: null`, which fails JSON
   * deserialisation and comes back naming the .NET request type. **No request may be sent at all.**
   */
  it('sends nothing when points are empty', async () => {
    const calls = stub()
    renderEditor()

    await userEvent.setup().type(screen.getByLabelText('Chore'), 'Water the plants')
    await userEvent.setup().click(screen.getByRole('button', { name: /add chore/i }))

    expect(await screen.findByText(/give the chore a point value/i)).toBeInTheDocument()
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0)
  })

  it('sends nothing when the title is blank', async () => {
    const calls = stub()
    renderEditor()

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Chore'), '   ')
    await user.type(screen.getByLabelText('Points'), '5')
    await user.click(screen.getByRole('button', { name: /add chore/i }))

    expect(await screen.findByText(/give the chore a name/i)).toBeInTheDocument()
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0)
  })

  /**
   * Only values a number input will actually hold. Typing "abc" into `type="number"` leaves the
   * value empty, so it surfaces as the missing-value error instead — the non-numeric branch of
   * `validateChore` is covered in `choreValidation.test.ts`, where it can be exercised directly.
   */
  it.each([
    ['0', /at least 1/i],
    ['-3', /at least 1/i],
    ['2.5', /whole number/i],
  ])('sends nothing for points %o', async (points, expected) => {
    const calls = stub()
    renderEditor()

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Chore'), 'Valid title')
    await user.type(screen.getByLabelText('Points'), points)
    await user.click(screen.getByRole('button', { name: /add chore/i }))

    expect(await screen.findByText(expected)).toBeInTheDocument()
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0)
  })

  it('marks the offending field for assistive technology', async () => {
    stub()
    renderEditor()

    await userEvent.setup().click(screen.getByRole('button', { name: /add chore/i }))

    await waitFor(() => expect(screen.getByLabelText('Chore')).toHaveAttribute('aria-invalid', 'true'))
    expect(screen.getByLabelText('Points')).toHaveAttribute('aria-invalid', 'true')
  })

  // Both directions: a form that blocked everything would pass every case above.
  it('does send a valid draft', async () => {
    const calls = stub({ status: 201, body: { id: 900, title: 'Water the plants', points: 8 } })
    renderEditor()

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Chore'), 'Water the plants')
    await user.type(screen.getByLabelText('Points'), '8')
    await user.click(screen.getByRole('button', { name: /add chore/i }))

    await waitFor(() => expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1))
    expect(JSON.parse(calls.find((c) => c.method === 'POST')!.body!)).toEqual({
      title: 'Water the plants',
      points: 8,
      category: 'Chore',
    })
  })

  it('trims before sending, so the stored title is clean', async () => {
    const calls = stub({ status: 201, body: { id: 900, title: 'Water the plants', points: 8 } })
    renderEditor()

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Chore'), '  Water the plants  ')
    await user.type(screen.getByLabelText('Points'), ' 8 ')
    await user.click(screen.getByRole('button', { name: /add chore/i }))

    await waitFor(() => expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1))
    const sent = JSON.parse(calls.find((c) => c.method === 'POST')!.body!) as { title: string }
    expect(sent.title).toBe('Water the plants')
  })
})

// ─── Creating ─────────────────────────────────────────────────────────────────

describe('creating', () => {
  it('starts empty and focused', async () => {
    stub()
    renderEditor()

    expect(screen.getByLabelText('Chore')).toHaveValue('')
    await waitFor(() => expect(screen.getByLabelText('Chore')).toHaveFocus())
  })

  it('reports the new chore by name and clears for the next', async () => {
    stub({ status: 201, body: { id: 900, title: 'Water the plants', points: 8 } })
    const { onDone } = renderEditor()

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Chore'), 'Water the plants')
    await user.type(screen.getByLabelText('Points'), '8')
    await user.click(screen.getByRole('button', { name: /add chore/i }))

    await waitFor(() => expect(onDone).toHaveBeenCalledWith('Water the plants added to your chores.'))
    expect(screen.getByLabelText('Chore')).toHaveValue('')
  })

  it('offers no way to delete something that does not exist yet', () => {
    stub()
    renderEditor()
    expect(screen.queryByRole('button', { name: /remove this chore/i })).not.toBeInTheDocument()
  })
})

// ─── Editing ──────────────────────────────────────────────────────────────────

describe('editing', () => {
  it('opens pre-filled with the current values', () => {
    stub()
    renderEditor({ activity: EXISTING })

    expect(screen.getByLabelText('Chore')).toHaveValue('Change the bed sheets')
    expect(screen.getByLabelText('Points')).toHaveValue(10)
  })

  it('PATCHes the id with both fields', async () => {
    const calls = stub({ status: 200, body: { id: 544, title: 'Strip the bed', points: 12 } })
    renderEditor({ activity: EXISTING })

    const user = userEvent.setup()
    await user.clear(screen.getByLabelText('Chore'))
    await user.type(screen.getByLabelText('Chore'), 'Strip the bed')
    await user.clear(screen.getByLabelText('Points'))
    await user.type(screen.getByLabelText('Points'), '12')
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => {
      const patch = calls.find((c) => c.method === 'PATCH')
      expect(patch?.path).toBe('/api/activities/544')
      expect(JSON.parse(patch!.body!)).toEqual({ title: 'Strip the bed', points: 12 })
    })
  })

  it('confirms by name', async () => {
    stub({ status: 200, body: { id: 544, title: 'Strip the bed', points: 12 } })
    const { onDone } = renderEditor({ activity: EXISTING })

    const user = userEvent.setup()
    await user.clear(screen.getByLabelText('Chore'))
    await user.type(screen.getByLabelText('Chore'), 'Strip the bed')
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(onDone).toHaveBeenCalledWith('Strip the bed updated.'))
  })

  it('validates an edit as strictly as a creation', async () => {
    const calls = stub()
    renderEditor({ activity: EXISTING })

    const user = userEvent.setup()
    await user.clear(screen.getByLabelText('Points'))
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    expect(await screen.findByText(/give the chore a point value/i)).toBeInTheDocument()
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(0)
  })

  it('cancels without sending anything', async () => {
    const calls = stub()
    const { onCancel } = renderEditor({ activity: EXISTING })

    await userEvent.setup().click(screen.getByRole('button', { name: /cancel/i }))

    expect(onCancel).toHaveBeenCalled()
    expect(calls.filter((c) => c.method !== 'GET')).toHaveLength(0)
  })
})

// ─── Deleting ─────────────────────────────────────────────────────────────────

describe('removing a chore', () => {
  /** Destructive and one tap away, so it asks first. */
  it('asks before removing, and sends nothing until confirmed', async () => {
    const calls = stub()
    renderEditor({ activity: EXISTING })

    await userEvent.setup().click(screen.getByRole('button', { name: /remove this chore/i }))

    expect(screen.getByText(/remove change the bed sheets\?/i)).toBeInTheDocument()
    expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(0)
  })

  /**
   * The server archives rather than deletes (§4.2) so approved logs keep their points. Without
   * saying so, a user has to guess whether removing a chore costs them what they already earned.
   */
  it('promises that logged points survive', async () => {
    stub()
    renderEditor({ activity: EXISTING })

    await userEvent.setup().click(screen.getByRole('button', { name: /remove this chore/i }))

    expect(screen.getByText(/already logged keep their points/i)).toBeInTheDocument()
  })

  it('can be backed out of', async () => {
    const calls = stub()
    renderEditor({ activity: EXISTING })

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /remove this chore/i }))
    await user.click(screen.getByRole('button', { name: /keep/i }))

    expect(screen.queryByText(/remove change the bed sheets\?/i)).not.toBeInTheDocument()
    expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(0)
  })

  it('DELETEs the id once confirmed', async () => {
    const calls = stub({ status: 204, body: null })
    const { onDone } = renderEditor({ activity: EXISTING })

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /remove this chore/i }))
    await user.click(screen.getByRole('button', { name: /^remove$/i }))

    await waitFor(() => {
      const del = calls.find((c) => c.method === 'DELETE')
      expect(del?.path).toBe('/api/activities/544')
    })
    expect(onDone).toHaveBeenCalledWith('Change the bed sheets removed.')
  })

  it('reports a failed removal instead of claiming success', async () => {
    stub({ status: 404, body: { error: 'Chore not found.', errors: null } })
    const { onDone } = renderEditor({ activity: EXISTING })

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /remove this chore/i }))
    await user.click(screen.getByRole('button', { name: /^remove$/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Chore not found.')
    expect(onDone).not.toHaveBeenCalled()
  })
})

// ─── The server still gets the last word ──────────────────────────────────────

describe('server-side rejections', () => {
  it('renders a field error the client did not anticipate', async () => {
    stub({
      status: 400,
      body: {
        error: 'One or more fields are invalid.',
        errors: { Title: ['Title must contain at least one visible character…'] },
      },
    })
    renderEditor()

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Chore'), 'Something the server dislikes')
    await user.type(screen.getByLabelText('Points'), '5')
    await user.click(screen.getByRole('button', { name: /add chore/i }))

    // PascalCase key, camelCase field — resolved through `fieldError`.
    expect(
      await screen.findByText(/must contain at least one visible character/i),
    ).toBeInTheDocument()
  })

  it('keeps what was typed so nothing has to be re-entered', async () => {
    stub({ status: 500, body: { error: 'An unexpected error occurred.', errors: null } })
    renderEditor()

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Chore'), 'Kept text')
    await user.type(screen.getByLabelText('Points'), '5')
    await user.click(screen.getByRole('button', { name: /add chore/i }))

    await screen.findByRole('alert')
    expect(screen.getByLabelText('Chore')).toHaveValue('Kept text')
  })
})
