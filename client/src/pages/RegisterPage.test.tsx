// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { makeStore } from '../app/store'
import { routes } from '../app/routes'

/** The real duplicate-email body, captured from the running API in task [42]. */
const DUPLICATE_EMAIL = {
  type: 'https://tools.ietf.org/html/rfc9110#section-15.5.1',
  title: 'One or more validation errors occurred.',
  status: 400,
  errors: {
    DuplicateEmail: ["Email 'alex@example.com' is already taken."],
    DuplicateUserName: ["Username 'alex@example.com' is already taken."],
  },
  traceId: '00-19e1b1259ffa454f120ebfaaa1470068-c49c015a2e9e907c-00',
}

function stubFetchSequence(...responses: { status: number; body: unknown }[]) {
  const requests: Request[] = []
  let call = 0
  const spy = vi.fn((input: Request) => {
    requests.push(input)
    const { status, body } = responses[Math.min(call++, responses.length - 1)]
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

function renderRegister() {
  const store = makeStore()
  const router = createMemoryRouter(routes, { initialEntries: ['/register'] })
  render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  )
  return { store, router }
}

async function submit() {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Name'), 'Alex')
  await user.type(screen.getByLabelText('Email'), 'alex@example.com')
  await user.type(screen.getByLabelText('Password'), 'Passw0rd!23')
  await user.click(screen.getByRole('button', { name: /create account/i }))
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('the form', () => {
  it('asks for name, email and password', () => {
    renderRegister()
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email')
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'new-password')
  })

  it('states the password rule up front instead of letting the server reject it', () => {
    renderRegister()
    expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument()
  })
})

describe('a successful registration', () => {
  it('signs in automatically, because register returns no token', async () => {
    const { requests } = stubFetchSequence(
      { status: 201, body: { id: 7, name: 'Alex', email: 'alex@example.com' } },
      { status: 200, body: { token: 'jwt.signed.token', user: { id: 7, name: 'Alex' } } },
    )
    const { store, router } = renderRegister()

    await submit()

    await waitFor(() => expect(store.getState().auth.token).toBe('jwt.signed.token'))
    expect(requests.map((r) => new URL(r.url).pathname)).toEqual([
      '/api/auth/register',
      '/api/auth/login',
    ])
    expect(router.state.location.pathname).toBe('/')
  })
})

describe('a duplicate email', () => {
  /**
   * The body is **ProblemDetails**, not this API's usual envelope — `title` where everything else
   * has `error`. `AuthController.cs:46` returns `ValidationProblem(ModelState)` and is the only
   * place in the API that does. Without the `title` fallback in `toApiError`, this shows the
   * generic "Something went wrong" on the one error a registration form most needs to explain.
   */
  it('shows a real message rather than the generic fallback', async () => {
    stubFetchSequence({ status: 400, body: DUPLICATE_EMAIL })
    renderRegister()

    await submit()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('One or more validation errors occurred.')
    expect(alert).not.toHaveTextContent(/something went wrong/i)
  })

  /**
   * Neither `DuplicateEmail` nor `DuplicateUserName` is an input on this form, so only the
   * unclaimed-error list makes them visible.
   */
  it('surfaces the messages even though no input is bound to those keys', async () => {
    stubFetchSequence({ status: 400, body: DUPLICATE_EMAIL })
    renderRegister()

    await submit()

    expect(await screen.findByRole('alert')).toHaveTextContent(/is already taken/)
  })

  it('does not sign the user in', async () => {
    stubFetchSequence({ status: 400, body: DUPLICATE_EMAIL })
    const { store, router } = renderRegister()

    await submit()

    await screen.findByRole('alert')
    expect(store.getState().auth.token).toBeNull()
    expect(router.state.location.pathname).toBe('/register')
  })

  it('never attempts the login call', async () => {
    const { requests } = stubFetchSequence({ status: 400, body: DUPLICATE_EMAIL })
    renderRegister()

    await submit()

    await screen.findByRole('alert')
    // Both directions on the chain: a register that failed must not fall through to login.
    expect(requests).toHaveLength(1)
    expect(new URL(requests[0].url).pathname).toBe('/api/auth/register')
  })
})
