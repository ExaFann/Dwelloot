// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { FormAlert } from './FormAlert'
import type { ApiError } from '../../api/apiError'

/**
 * `FormAlert` carries two jobs that pull against each other, so both directions are asserted here.
 *
 * 1. **Show every message no input claimed.** A form that rendered only errors it recognised would
 *    reject a registration with a taken email and say nothing at all — the API answers that with
 *    `DuplicateEmail`/`DuplicateUserName`, and no input is bound to either (logs `041`, `042`).
 * 2. **Do not repeat the wrapper.** `Program.cs:166` prefixes every model-validation failure with
 *    *"One or more fields are invalid."*, which above a single red-outlined field says nothing the
 *    field is not already saying. Owner's note on the pairing screen.
 *
 * The risk in (2) is over-reach: a rule that suppressed a little too eagerly turns a rejected form
 * into a silent one. Every test below either proves the alert is gone when it should be, or proves
 * it survives — a suite with only the first kind would pass against a component that always
 * returned `null`.
 */

const WRAPPER = 'One or more fields are invalid.'

function error(over: Partial<ApiError> = {}): ApiError {
  return { status: 400, message: WRAPPER, fieldErrors: null, traceId: null, ...over }
}

afterEach(cleanup)

describe('the wrapper sentence is dropped when it adds nothing', () => {
  it('renders nothing when the only message is already on a field', () => {
    render(
      <FormAlert
        error={error({ fieldErrors: { Name: ['Give your household a name.'] } })}
        claimedFields={['name']}
      />,
    )

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  /** Matching is case-insensitive on the key, so a PascalCase server key still counts as claimed. */
  it('matches the claimed field case-insensitively', () => {
    render(
      <FormAlert
        error={error({ fieldErrors: { InviteCode: ['Six characters.'] } })}
        claimedFields={['inviteCode']}
      />,
    )

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('the alert survives everywhere it is load-bearing', () => {
  /**
   * The message survives; the wrapper above it does not, because the message is now the thing
   * speaking. Asserted in both directions so "renders something" cannot pass by rendering the
   * wrapper alone.
   */
  it('renders when a field message has no input to sit on', () => {
    render(
      <FormAlert
        error={error({ fieldErrors: { DuplicateEmail: ['That email is taken.'] } })}
        claimedFields={['name']}
      />,
    )

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent(/already registered/i)
    expect(alert).not.toHaveTextContent(WRAPPER)
  })

  /** An unmapped key passes through verbatim — the map must not be a whitelist. */
  it('shows a message it has never seen, unchanged', () => {
    render(
      <FormAlert
        error={error({
          fieldErrors: { SomeFutureRule: ['Households may not be renamed on a Tuesday.'] },
        })}
        claimedFields={['name']}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Households may not be renamed on a Tuesday.',
    )
  })

  /**
   * The mixed case is the one a naive rule gets wrong: one claimed message, one unclaimed. Dropping
   * the alert here would discard `$` and `request` — the malformed-body keys from [41].
   */
  it('renders when only some of the messages are claimed', () => {
    render(
      <FormAlert
        error={error({
          fieldErrors: { Name: ['Required.'], $: ['The JSON value could not be converted.'] },
        })}
        claimedFields={['name']}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(/could not be read/i)
  })

  /** A 409, a 404 or a transport failure has no `errors` map, and its sentence is the whole message. */
  it('renders a message that has no field errors at all', () => {
    render(
      <FormAlert
        error={error({ status: 409, message: 'You are already in a household.' })}
        claimedFields={['name']}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('You are already in a household.')
  })

  /**
   * The suppression keys on that one sentence, not on "there are field errors". A real message with
   * a field map beside it — which is what `AuthController.cs:46`'s ProblemDetails produces — has to
   * survive, or the user is told nothing about why registration failed.
   */
  it('renders a real sentence even when every field message is claimed', () => {
    render(
      <FormAlert
        error={error({
          message: 'That email is already registered.',
          fieldErrors: { Email: ['Taken.'] },
        })}
        claimedFields={['email']}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('That email is already registered.')
  })

  it('renders nothing at all when there is no error', () => {
    render(<FormAlert error={null} claimedFields={['name']} />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
