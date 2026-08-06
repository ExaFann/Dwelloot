import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { useLoginMutation, useRegisterMutation } from '../features/auth/authApi'
import {
  isPasswordAcceptable,
  NAME_MAX_LENGTH,
  validateEmail,
  validateName,
} from '../features/auth/passwordPolicy'
import { PasswordRules } from '../features/auth/PasswordRules'
import { fieldError, toApiError, type ApiError } from '../api/apiError'
import { Button } from '../components/ui/Button'
import { TextInput } from '../components/ui/TextInput'
import { FormAlert } from '../components/ui/FormAlert'

const CLAIMED_FIELDS = ['name', 'email', 'password'] as const

export function RegisterPage() {
  const [register, { isLoading: isRegistering }] = useRegisterMutation()
  const [login, { isLoading: isSigningIn }] = useLoginMutation()
  const [error, setError] = useState<ApiError | null>(null)

  /*
   * Controlled, because the password checklist has to update on every keystroke. The other two are
   * controlled for the same reason their errors are: a rule the user can see before submitting is
   * the whole point of this screen ([B] in the owner's UX list).
   */
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  /*
   * Field errors appear on **blur**, not on every keystroke. Validating as someone types tells them
   * "that is not an email address" after the first character, which is true and useless.
   */
  const [touched, setTouched] = useState<Record<string, boolean>>({})

  const nameError = touched.name ? validateName(name) : undefined
  const emailError = touched.email ? validateEmail(email) : undefined

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    /*
     * Everything the client can judge is judged here, so no request goes out that the server is
     * certain to refuse. `touched` is forced open first, or a user who submits without ever
     * blurring a field would see the form refuse and say nothing — the failure mode [47] found.
     */
    setTouched({ name: true, email: true, password: true })
    if (validateName(name) || validateEmail(email) || !isPasswordAcceptable(password)) return

    const credentials = { email: email.trim(), password }

    try {
      await register({ name: name.trim(), ...credentials }).unwrap()
      /**
       * `POST /api/auth/register` returns `{ id, name, email }` and **no token** — confirmed against
       * the running API. Rather than make the user retype credentials they typed a second ago, sign
       * them in with the same values.
       */
      await login(credentials).unwrap()
      // No navigation — AuthGate routes on the session change. See LoginPage.
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
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, name: true }))}
          required
          maxLength={NAME_MAX_LENGTH}
          error={nameError ?? (error ? fieldError(error, 'name') : undefined)}
        />
        <TextInput
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, email: true }))}
          required
          error={emailError ?? (error ? fieldError(error, 'email') : undefined)}
        />
        <TextInput
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          /*
           * Tied to the checklist rather than to a single error string, so a screen reader hears
           * every unmet rule when focus arrives instead of only the first one the server objected to.
           */
          aria-describedby="password-rules"
          error={error ? fieldError(error, 'password') : undefined}
        />
        <PasswordRules password={password} id="password-rules" />

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
