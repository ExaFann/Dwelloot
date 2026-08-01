// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { makeStore } from '../app/store'
import { routes } from '../app/routes'

/**
 * The login form, rendered through the real router and the real store so the whole path — form,
 * mutation, base query, slice — is exercised rather than a component in isolation.
 */

function stubFetch(status: number, body: unknown) {
  const requests: Request[] = []
  const spy = vi.fn((input: Request) => {
    requests.push(input)
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

function renderLogin() {
  const store = makeStore()
  const router = createMemoryRouter(routes, { initialEntries: ['/login'] })
  render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  )
  return { store, router }
}

async function submit(email = 'alex@example.com', password = 'Passw0rd!23') {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Email'), email)
  await user.type(screen.getByLabelText('Password'), password)
  await user.click(screen.getByRole('button', { name: /log in/i }))
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('the form', () => {
  it('renders labelled email and password inputs', () => {
    renderLogin()
    expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email')
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
  })

  it('marks the fields for password managers', () => {
    renderLogin()
    expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'email')
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'current-password')
  })

  it('offers a way to the register page', () => {
    renderLogin()
    expect(screen.getByRole('link', { name: /create one/i })).toHaveAttribute('href', '/register')
  })
})

describe('a successful sign in', () => {
  it('stores the session and leaves the login screen', async () => {
    stubFetch(200, { token: 'jwt.signed.token', user: { id: 7, name: 'Alex' } })
    const { store, router } = renderLogin()

    await submit()

    await waitFor(() => expect(store.getState().auth.token).toBe('jwt.signed.token'))
    expect(router.state.location.pathname).toBe('/')
  })

  it('sends what was typed', async () => {
    const { requests } = stubFetch(200, { token: 't', user: { id: 1, name: 'A' } })
    renderLogin()

    await submit('typed@example.com', 'TypedPassword1')

    // Targeted rather than counted: since [43] a successful sign-in is followed by AuthGate's
    // `/api/auth/me`, so the total is no longer 1.
    const loginRequest = await waitFor(() => {
      const found = requests.find((r) => new URL(r.url).pathname === '/api/auth/login')
      expect(found).toBeDefined()
      return found!
    })
    expect(await loginRequest.json()).toEqual({
      email: 'typed@example.com',
      password: 'TypedPassword1',
    })
  })
})

describe('a rejected sign in', () => {
  it('shows the message the server sent, and stays put', async () => {
    stubFetch(401, { error: 'Invalid email or password.', errors: null, traceId: '00-x-00' })
    const { router, store } = renderLogin()

    await submit()

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.')
    expect(router.state.location.pathname).toBe('/login')
    // Finding 1: a 401 here must not be mistaken for a session expiry.
    expect(store.getState().auth.token).toBeNull()
  })

  /**
   * 423 is the lockout from task [13]. Without the extra line a locked-out user reads "Invalid email
   * or password" and keeps guessing, which extends the lockout each time.
   */
  it('explains a lockout rather than blaming the password', async () => {
    stubFetch(423, { error: 'Too many failed attempts. Try again later.', errors: null })
    renderLogin()

    await submit()

    expect(await screen.findByText(/wait a few minutes/i)).toBeInTheDocument()
  })

  // Both directions — the lockout hint must not appear on an ordinary rejection.
  it('does not show the lockout hint on a wrong password', async () => {
    stubFetch(401, { error: 'Invalid email or password.', errors: null })
    renderLogin()

    await submit()

    await screen.findByRole('alert')
    expect(screen.queryByText(/wait a few minutes/i)).not.toBeInTheDocument()
  })

  it('attaches a field error to the right input despite PascalCase keys', async () => {
    stubFetch(400, {
      error: 'One or more fields are invalid.',
      errors: { Email: ['The Email field is not a valid e-mail address.'] },
    })
    renderLogin()

    await submit('nope', 'whatever')

    const email = await screen.findByLabelText('Email')
    await waitFor(() => expect(email).toHaveAttribute('aria-invalid', 'true'))
    expect(
      screen.getByText('The Email field is not a valid e-mail address.'),
    ).toBeInTheDocument()
    // The other direction: password had no error, so it must not be marked.
    expect(screen.getByLabelText('Password')).not.toHaveAttribute('aria-invalid')
  })

  it('does not lose messages whose key is not a form field', async () => {
    stubFetch(400, {
      error: 'One or more fields are invalid.',
      errors: { $: ["'n' is an invalid start of a property name."] },
    })
    renderLogin()

    await submit()

    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid start of a property name/)
  })

  it('falls back to a readable message when the body carries none', async () => {
    stubFetch(500, {})
    renderLogin()

    await submit()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/something went wrong/i)
    expect(alert.textContent).not.toContain('undefined')
  })
})
