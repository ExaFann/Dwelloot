// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { makeStore } from '../app/store'
import { routes } from '../app/routes'
import { signedIn } from '../features/auth/authSlice'

/**
 * The pairing screen, rendered through the real router so `AuthGate` participates — the redirect
 * after pairing is the actual outcome under test, not a mocked callback.
 */

const UNPAIRED = {
  id: 7,
  name: 'Alex',
  email: 'alex@example.com',
  householdId: null as number | null,
  lifetimePoints: 0,
  coins: 0,
  currentWinStreak: 0,
}

type Handler = (request: Request) => { status: number; body: unknown }

/** Routes stubbed responses by path so the two forms can fail independently in one render. */
function stubRoutes(handler: Handler) {
  const requests: Request[] = []
  const spy = vi.fn((input: Request) => {
    requests.push(input)
    const { status, body } = handler(input)
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  })
  vi.stubGlobal('fetch', spy)
  return { spy, requests }
}

/** `/me` reports no household until `paired` flips — which is how the redirect is observed. */
function scenario(overrides: Partial<Record<string, { status: number; body: unknown }>> = {}) {
  const state = { paired: false }
  const { requests } = stubRoutes((request) => {
    const path = new URL(request.url).pathname
    if (path === '/api/auth/me') {
      return {
        status: 200,
        body: { ...UNPAIRED, householdId: state.paired ? 10 : null },
      }
    }
    if (path === '/api/households' && overrides.create) return overrides.create
    if (path === '/api/households/join' && overrides.join) return overrides.join
    if (path === '/api/households') {
      state.paired = true
      return {
        status: 201,
        body: { id: 10, name: 'Our place', inviteCode: 'ABC234', isFull: false },
      }
    }
    state.paired = true
    return { status: 200, body: { id: 10, isFull: true } }
  })
  return { requests, state }
}

function renderPairing() {
  const store = makeStore()
  store.dispatch(signedIn({ token: 'jwt.token', user: { id: 7, name: 'Alex' } }))
  const router = createMemoryRouter(routes, { initialEntries: ['/pairing'] })
  render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  )
  return { store, router }
}

const at = (r: { state: { location: { pathname: string } } }) => r.state.location.pathname

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

async function createWith(name: string) {
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText('Household name'), name)
  await user.click(screen.getByRole('button', { name: /^create$/i }))
}

async function joinWith(code: string) {
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText('Invite code'), code)
  await user.click(screen.getByRole('button', { name: /^join$/i }))
}

describe('the screen offers both paths equally', () => {
  it('shows a create form and a join form', async () => {
    scenario()
    renderPairing()
    expect(await screen.findByLabelText('Household name')).toBeInTheDocument()
    expect(screen.getByLabelText('Invite code')).toBeInTheDocument()
  })

  it('does not show an invite code before one exists', async () => {
    scenario()
    renderPairing()
    await screen.findByLabelText('Household name')
    // Otherwise the "code is shown after creating" test could pass against a code shown always.
    expect(screen.queryByText(/invite code/i)?.tagName).not.toBe('P')
    expect(screen.queryByRole('button', { name: /copy code/i })).not.toBeInTheDocument()
  })
})

describe('creating a household', () => {
  it('shows the invite code rather than redirecting', async () => {
    scenario()
    const { router } = renderPairing()

    await createWith('Our place')

    expect(await screen.findByText('ABC234')).toBeInTheDocument()
    /**
     * The point of the whole confirmation step: the code is the sole credential for joining, so
     * creating must not sweep the user onward before they have seen it.
     */
    expect(at(router)).toBe('/pairing')
  })

  it('only leaves once Continue is pressed', async () => {
    scenario()
    const { router } = renderPairing()

    await createWith('Our place')
    await screen.findByText('ABC234')
    expect(at(router)).toBe('/pairing')

    await userEvent.setup().click(screen.getByRole('button', { name: /continue/i }))

    await waitFor(() => expect(at(router)).toBe('/'))
  })

  it('sends the name that was typed', async () => {
    const { requests } = scenario()
    renderPairing()

    await createWith('The Nest')

    const create = await waitFor(() => {
      const found = requests.find((r) => new URL(r.url).pathname === '/api/households')
      expect(found).toBeDefined()
      return found!
    })
    expect(await create.json()).toEqual({ name: 'The Nest' })
  })

  it('puts a blank-name error on the Name input despite the PascalCase key', async () => {
    scenario({
      create: {
        status: 400,
        body: {
          error: 'One or more fields are invalid.',
          errors: { Name: ['The Name field is required.'] },
        },
      },
    })
    renderPairing()

    await createWith('x')

    const input = await screen.findByLabelText('Household name')
    await waitFor(() => expect(input).toHaveAttribute('aria-invalid', 'true'))
    expect(screen.getByText('The Name field is required.')).toBeInTheDocument()
  })

  it('shows the 409 when already in a household', async () => {
    scenario({
      create: {
        status: 409,
        body: { error: 'You are already in a household.', errors: null },
      },
    })
    renderPairing()

    await createWith('Our place')

    expect(await screen.findByRole('alert')).toHaveTextContent('You are already in a household.')
  })
})

describe('joining a household', () => {
  it('redirects straight away — there is nothing to show', async () => {
    scenario()
    const { router } = renderPairing()

    await joinWith('ABC234')

    await waitFor(() => expect(at(router)).toBe('/'))
  })

  it('sends the code that was typed', async () => {
    const { requests } = scenario()
    renderPairing()

    await joinWith('ABC234')

    const join = await waitFor(() => {
      const found = requests.find((r) => new URL(r.url).pathname === '/api/households/join')
      expect(found).toBeDefined()
      return found!
    })
    expect(await join.json()).toEqual({ inviteCode: 'ABC234' })
  })

  it.each([
    [404, 'No household found with that invite code.'],
    [409, 'This household already has 2 members'],
  ])('shows the server message on %i', async (status, message) => {
    scenario({ join: { status, body: { error: message, errors: null } } })
    const { router } = renderPairing()

    await joinWith('ABC234')

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(at(router)).toBe('/pairing')
  })

  it('puts a length error on the Invite code input', async () => {
    scenario({
      join: {
        status: 400,
        body: {
          error: 'One or more fields are invalid.',
          errors: {
            InviteCode: ['The field InviteCode must be a string with a minimum length of 6…'],
          },
        },
      },
    })
    renderPairing()

    await joinWith('ABC')

    const input = await screen.findByLabelText('Invite code')
    await waitFor(() => expect(input).toHaveAttribute('aria-invalid', 'true'))
  })
})

describe('the two forms are independent', () => {
  /**
   * One shared error slot would render a join failure under the create form. Asserted in both
   * directions, since a single slot passes whichever check is written first.
   */
  it('a failed join does not mark the create form', async () => {
    scenario({ join: { status: 404, body: { error: 'No household found.', errors: null } } })
    renderPairing()

    await joinWith('ZZZZZZ')

    await screen.findByRole('alert')
    expect(screen.getByLabelText('Household name')).not.toHaveAttribute('aria-invalid')
    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })

  it('a failed create does not mark the join form', async () => {
    scenario({
      create: {
        status: 400,
        body: { error: 'Invalid.', errors: { Name: ['The Name field is required.'] } },
      },
    })
    renderPairing()

    await createWith('x')

    await screen.findByRole('alert')
    expect(screen.getByLabelText('Invite code')).not.toHaveAttribute('aria-invalid')
  })
})

describe('the invite code input', () => {
  it('uppercases as you type', async () => {
    scenario()
    renderPairing()

    const input = (await screen.findByLabelText('Invite code')) as HTMLInputElement
    await userEvent.setup().type(input, 'abc234')

    expect(input.value).toBe('ABC234')
  })

  it('is capped at the code length', async () => {
    scenario()
    renderPairing()

    const input = (await screen.findByLabelText('Invite code')) as HTMLInputElement
    await userEvent.setup().type(input, 'ABC234XYZ')

    expect(input.value).toHaveLength(6)
  })
})
