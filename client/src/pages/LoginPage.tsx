import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { useLoginMutation } from '../features/auth/authApi'
import { fieldError, toApiError, type ApiError } from '../api/apiError'
import { Button } from '../components/ui/Button'
import { TextInput } from '../components/ui/TextInput'
import { FormAlert } from '../components/ui/FormAlert'

const CLAIMED_FIELDS = ['email', 'password'] as const

export function LoginPage() {
  const navigate = useNavigate()
  const [login, { isLoading }] = useLoginMutation()
  const [error, setError] = useState<ApiError | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const form = new FormData(event.currentTarget)
    try {
      await login({
        email: String(form.get('email') ?? ''),
        password: String(form.get('password') ?? ''),
      }).unwrap()
      /**
       * Always `/`. The pairing redirect belongs to [43]: the login response carries only
       * `{ token, user: { id, name } }`, so whether this user has a household needs
       * `GET /api/auth/me` — and that guard is [43]'s job, not a second request here.
       */
      void navigate('/', { replace: true })
    } catch (caught) {
      setError(toApiError(caught))
    }
  }

  return (
    <section>
      <h1 className="text-3xl">Log in</h1>
      <p className="mt-2 text-muted">Sign in to Dwelloot.</p>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4" noValidate>
        <FormAlert error={error} claimedFields={CLAIMED_FIELDS} />

        {/*
         * 423 is the account lockout from task [13] — five failed attempts, fifteen minutes. Without
         * calling it out, a locked-out user reads "Invalid email or password" and keeps guessing,
         * which is both useless and, with `lockoutOnFailure`, self-defeating.
         */}
        {error?.status === 423 && (
          <p className="text-sm font-semibold text-muted">
            Too many attempts. Wait a few minutes before trying again.
          </p>
        )}

        <TextInput
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          error={error ? fieldError(error, 'email') : undefined}
        />
        <TextInput
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          error={error ? fieldError(error, 'password') : undefined}
        />

        <Button type="submit" pending={isLoading} pendingLabel="Signing in…">
          Log in
        </Button>
      </form>

      <p className="mt-6 text-sm text-muted">
        No account?{' '}
        <Link to="/register" className="focus-ring font-semibold text-primary underline">
          Create one
        </Link>
      </p>
    </section>
  )
}
