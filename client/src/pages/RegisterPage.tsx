import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { useLoginMutation, useRegisterMutation } from '../features/auth/authApi'
import { fieldError, toApiError, type ApiError } from '../api/apiError'
import { Button } from '../components/ui/Button'
import { TextInput } from '../components/ui/TextInput'
import { FormAlert } from '../components/ui/FormAlert'

const CLAIMED_FIELDS = ['name', 'email', 'password'] as const

export function RegisterPage() {
  const navigate = useNavigate()
  const [register, { isLoading: isRegistering }] = useRegisterMutation()
  const [login, { isLoading: isSigningIn }] = useLoginMutation()
  const [error, setError] = useState<ApiError | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const form = new FormData(event.currentTarget)
    const credentials = {
      email: String(form.get('email') ?? ''),
      password: String(form.get('password') ?? ''),
    }

    try {
      await register({ name: String(form.get('name') ?? ''), ...credentials }).unwrap()
      /**
       * `POST /api/auth/register` returns `{ id, name, email }` and **no token** — confirmed against
       * the running API. Rather than make the user retype credentials they typed a second ago, sign
       * them in with the same values.
       */
      await login(credentials).unwrap()
      void navigate('/', { replace: true })
    } catch (caught) {
      setError(toApiError(caught))
    }
  }

  return (
    <section>
      <h1 className="text-3xl">Create an account</h1>
      <p className="mt-2 text-muted">Then create a household, or join your partner&apos;s.</p>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4" noValidate>
        {/*
         * A taken email arrives as `{"DuplicateEmail": […], "DuplicateUserName": […]}` — neither key
         * is an input on this form, so FormAlert's unclaimed-error list is what makes it visible.
         * Without it the page would show only "One or more validation errors occurred."
         */}
        <FormAlert error={error} claimedFields={CLAIMED_FIELDS} />

        <TextInput
          label="Name"
          name="name"
          autoComplete="name"
          required
          maxLength={60}
          error={error ? fieldError(error, 'name') : undefined}
        />
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
          autoComplete="new-password"
          required
          minLength={8}
          error={error ? fieldError(error, 'password') : undefined}
        />
        {/* The server's rule, stated up front rather than discovered by failing. */}
        <p className="-mt-2 text-sm text-muted">At least 8 characters.</p>

        <Button
          type="submit"
          pending={isRegistering || isSigningIn}
          pendingLabel={isRegistering ? 'Creating…' : 'Signing in…'}
        >
          Create account
        </Button>
      </form>

      <p className="mt-6 text-sm text-muted">
        Already have an account?{' '}
        <Link to="/login" className="focus-ring font-semibold text-primary underline">
          Log in
        </Link>
      </p>
    </section>
  )
}
