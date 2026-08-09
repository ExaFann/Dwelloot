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

  /**
   * The page used to state **one** rule — "At least 8 characters." — while the server enforced
   * four, so `abcdefgh` obeyed every instruction on screen and was still refused. A test that
   * checked only the length sentence passed throughout that. It now checks all four.
   */
  it('states every password rule up front, not just the length', async () => {
    renderRegister()
    expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument()
    expect(screen.getByText(/uppercase letter/i)).toBeInTheDocument()
    expect(screen.getByText(/lowercase letter/i)).toBeInTheDocument()
    expect(screen.getByText(/a number/i)).toBeInTheDocument()
  })

  it('ticks the rules off as they are met, and only the ones that are', async () => {
    renderRegister()
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Password'), 'abcdefgh')

    // Met: length and lowercase. Not met: uppercase and digit.
    expect(screen.getByLabelText(/at least 8 characters: met/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/lowercase letter: met/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/uppercase letter: not met yet/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/a number: not met yet/i)).toBeInTheDocument()
  })
})

/**
 * The claim is "the server is never asked a question it is certain to refuse", so every assertion
 * is on the **fetch spy**. "Shows an error" and "sent nothing" are different claims and only the
 * second is the fix — [47]'s rule, in a third place.
 */
describe('a submission the client can already judge', () => {
  it('sends nothing when the password breaks a rule', async () => {
    const { spy } = stubFetchSequence({ status: 201, body: {} })
    renderRegister()
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Name'), 'Alex')
    await user.type(screen.getByLabelText('Email'), 'alex@example.com')
    await user.type(screen.getByLabelText('Password'), 'abcdefgh')
    await user.click(screen.getByRole('button', { name: /create account/i }))

    expect(spy).not.toHaveBeenCalled()
  })

  it('sends nothing when the email is malformed, and says so on the field', async () => {
    const { spy } = stubFetchSequence({ status: 201, body: {} })
    renderRegister()
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Name'), 'Alex')
    await user.type(screen.getByLabelText('Email'), 'nobody')
    await user.type(screen.getByLabelText('Password'), 'Passw0rd!23')
    await user.click(screen.getByRole('button', { name: /create account/i }))

    expect(spy).not.toHaveBeenCalled()
    expect(await screen.findByText(/does not look like an email address/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
  })

  /**
   * Validating on every keystroke would tell someone their email is malformed after the first
   * character, which is true and useless. The error waits for blur.
   */
  it('does not complain about a half-typed email before the field is left', async () => {
    stubFetchSequence({ status: 201, body: {} })
    renderRegister()
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Email'), 'al')
    expect(screen.queryByText(/does not look like an email address/i)).not.toBeInTheDocument()

    await user.tab()
    expect(await screen.findByText(/does not look like an email address/i)).toBeInTheDocument()
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
    // The first two calls, in order. Not the whole list: since [43] AuthGate follows a successful
    // sign-in with `/api/auth/me`.
    expect(requests.slice(0, 2).map((r) => new URL(r.url).pathname)).toEqual([
      '/api/auth/register',
      '/api/auth/login',
    ])
    /*
     * `waitFor`, not a bare assertion — and this was a latent flake, not a style preference.
     *
     * The token landing in the store is **not** the moment the route changes: AuthGate then fetches
     * `/api/auth/me` to learn whether there is a household, and only navigates once that answers. So
     * this assertion sat one un-awaited async hop past the thing above it, and passed only because
     * the hop usually completed inside the same flush.
     *
     * It started failing when this file grew a few more tests — nothing about the behaviour changed,
     * only how much work ran before it. A test that is correct but timing-dependent is still a
     * flake ([59]).
     */
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
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
    expect(alert).toHaveTextContent(/already registered/i)
    expect(alert).not.toHaveTextContent(/something went wrong/i)
    // ProblemDetails' title is a wrapper: it says only that *something* failed, which the
    // sentence above already says better. Suppressed once anything else speaks.
    expect(alert).not.toHaveTextContent('One or more validation errors occurred.')
  })

  /**
   * Neither `DuplicateEmail` nor `DuplicateUserName` is an input on this form, so only the
   * unclaimed-error list makes them visible at all.
   *
   * The pair also says the same thing twice, and the second one says **"Username"** to someone who
   * only ever typed an email — Identity derives the username from it. One sentence now, and the
   * absence of the word is asserted, because that is the defect.
   */
  it('says it once in plain terms, not twice in Identity terms', async () => {
    stubFetchSequence({ status: 400, body: DUPLICATE_EMAIL })
    renderRegister()

    await submit()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/that email is already registered/i)
    expect(alert).not.toHaveTextContent(/username/i)
    // One item, not two saying the same thing.
    expect(alert.querySelectorAll('li')).toHaveLength(1)
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
