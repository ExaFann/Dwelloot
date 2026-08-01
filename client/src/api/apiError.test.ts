import { describe, expect, it } from 'vitest'
import { fieldError, toApiError, unclaimedFieldErrors } from './apiError'

/**
 * Fixtures are **verbatim response bodies captured from the running API** during task [41], not
 * paraphrases of `api-design.md`. Paraphrasing would test the documentation; these test the server.
 *
 * `traceId`s are the real ones from that session — their value is never asserted, only that it is
 * carried through.
 */
const REAL = {
  unauthenticated: {
    status: 401,
    data: {
      error: 'Authentication is required.',
      errors: null,
      traceId: '00-f74ad894ac38969fe3368d9fc67ce4da-5ac04dc167d401e8-00',
    },
  },
  unmatchedRoute: {
    status: 404,
    data: {
      error: 'That endpoint does not exist.',
      errors: null,
      traceId: '00-45d2ca34c60bbe8e75f9adac800b2608-41ae967702ca776d-00',
    },
  },
  domainRejection: {
    status: 400,
    data: {
      error: 'Invalid email or password.',
      errors: null,
      traceId: '00-df230ab6b2beb223fbfbb717ec7b25e3-688c075817066a89-00',
    },
  },
  noHousehold: {
    status: 409,
    data: {
      error: 'You are not in a household yet.',
      errors: null,
      traceId: '00-ab000b4459391fde80669f6b99a44250-88559df829631199-00',
    },
  },
  validation: {
    status: 400,
    data: {
      error: 'One or more fields are invalid.',
      errors: {
        Name: [
          'The Name field is required.',
          'Name must contain at least one visible character and be at most 60 characters once surrounding and repeated whitespace is removed.',
        ],
        Email: ['The Email field is not a valid e-mail address.'],
        Password: [
          'The field Password must be a string with a minimum length of 8 and a maximum length of 128.',
        ],
      },
      traceId: '00-02401bd2f540bab0a184facd5a055531-ff0964193a5e2cbf-00',
    },
  },
  /** A malformed JSON request body. Neither key is a form field. */
  malformedBody: {
    status: 400,
    data: {
      error: 'One or more fields are invalid.',
      errors: {
        $: ["'n' is an invalid start of a property name. Expected a '\"'. Path: $ | LineNumber: 0 | BytePositionInLine: 1."],
        request: ['The request field is required.'],
      },
      traceId: '00-db2e6b212d3677f65bec949f11a7e638-534bab5db9dcca13-00',
    },
  },
} as const

describe('the five real response shapes', () => {
  it.each([
    ['unauthenticated', REAL.unauthenticated, 401, 'Authentication is required.'],
    ['unmatched route', REAL.unmatchedRoute, 404, 'That endpoint does not exist.'],
    ['domain rejection', REAL.domainRejection, 400, 'Invalid email or password.'],
    ['no household', REAL.noHousehold, 409, 'You are not in a household yet.'],
    ['validation', REAL.validation, 400, 'One or more fields are invalid.'],
  ])('%s → status and message', (_name, input, status, message) => {
    const result = toApiError(input)
    expect(result.status).toBe(status)
    expect(result.message).toBe(message)
  })

  it('carries the traceId through, so it can be quoted to the server log', () => {
    expect(toApiError(REAL.noHousehold).traceId).toBe(REAL.noHousehold.data.traceId)
  })

  /**
   * The handover's standing instruction: `errors` is **always present and null when empty**, so a
   * client must test its value rather than the key's presence. A `'errors' in body` check would be
   * true for all four of these.
   */
  it.each([
    ['unauthenticated', REAL.unauthenticated],
    ['unmatched route', REAL.unmatchedRoute],
    ['domain rejection', REAL.domainRejection],
    ['no household', REAL.noHousehold],
  ])('%s has fieldErrors null, not an empty object', (_name, input) => {
    expect(toApiError(input).fieldErrors).toBeNull()
  })

  it('reads the validation map, keeping every message per field', () => {
    const { fieldErrors } = toApiError(REAL.validation)
    expect(fieldErrors).not.toBeNull()
    expect(Object.keys(fieldErrors!)).toEqual(['Name', 'Email', 'Password'])
    // Name really does carry two distinct messages — dropping to the first would lose one.
    expect(fieldErrors!.Name).toHaveLength(2)
  })
})

describe('transport failures, where no response arrived', () => {
  it.each([
    ['FETCH_ERROR', { status: 'FETCH_ERROR', error: 'TypeError: Failed to fetch' }],
    ['TIMEOUT_ERROR', { status: 'TIMEOUT_ERROR', error: 'AbortError' }],
  ])('%s reports no status and a connection message', (_name, input) => {
    const result = toApiError(input)
    expect(result.status).toBeNull()
    expect(result.message).toMatch(/could not reach the server/i)
    expect(result.fieldErrors).toBeNull()
    expect(result.traceId).toBeNull()
  })

  /**
   * PARSING_ERROR is the shape a missing `VITE_API_BASE_URL` produces: the request resolves against
   * the frontend's own origin, the SPA fallback returns `index.html` with a **200**, and only the
   * JSON parse fails. The original status is kept because 200-that-is-not-JSON is the diagnostic.
   */
  it('PARSING_ERROR keeps the original status', () => {
    const result = toApiError({
      status: 'PARSING_ERROR',
      originalStatus: 200,
      data: '<!doctype html><html>…',
      error: 'Unexpected token <',
    })
    expect(result.status).toBe(200)
    expect(result.message).toBeTruthy()
  })
})

describe('bodies that do not match the contract', () => {
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a bare string', 'boom'],
    ['an empty object', {}],
    ['a numeric status with no data', { status: 500 }],
    ['data that is a string', { status: 500, data: 'Internal Server Error' }],
    ['data with no error field', { status: 500, data: { traceId: '00-x-00' } }],
    ['error that is not a string', { status: 400, data: { error: 42, errors: null } }],
    ['error that is empty', { status: 400, data: { error: '   ', errors: null } }],
  ])('%s still yields a displayable message', (_name, input) => {
    const result = toApiError(input)
    expect(typeof result.message).toBe('string')
    expect(result.message.length).toBeGreaterThan(0)
    expect(result.message).not.toContain('undefined')
  })

  it('keeps a numeric status even when the body is unusable', () => {
    expect(toApiError({ status: 500, data: 'Internal Server Error' }).status).toBe(500)
  })

  it('ignores an errors map whose values are not string arrays', () => {
    expect(toApiError({ status: 400, data: { error: 'x', errors: { Title: 'nope' } } }).fieldErrors)
      .toBeNull()
    expect(toApiError({ status: 400, data: { error: 'x', errors: { Title: [] } } }).fieldErrors)
      .toBeNull()
  })
})

describe('fieldError', () => {
  const validation = toApiError(REAL.validation)

  /**
   * The API returns PascalCase keys while request bodies and the rest of the JSON are camelCase, so
   * a form binding its `email` input to `errors.email` finds nothing. Verified against the live API.
   */
  it.each(['Name', 'name', 'NAME', 'nAmE'])('finds %s regardless of case', (lookup) => {
    expect(fieldError(validation, lookup)).toBe('The Name field is required.')
  })

  it('returns the first message when a field has several', () => {
    expect(fieldError(validation, 'name')).toBe('The Name field is required.')
  })

  // The other direction: a matcher that returned something for everything would pass the above.
  it('returns undefined for a field that has no error', () => {
    expect(fieldError(validation, 'title')).toBeUndefined()
  })

  it('returns undefined when there are no field errors at all', () => {
    expect(fieldError(toApiError(REAL.noHousehold), 'name')).toBeUndefined()
  })
})

describe('unclaimedFieldErrors', () => {
  /**
   * `$` is a JSON path and `request` is the parameter name — neither is bound to an input. A form
   * that renders only the fields it recognises would show nothing at all and appear to reject the
   * submission for no reason.
   */
  it('surfaces messages no form field claims', () => {
    const error = toApiError(REAL.malformedBody)
    const unclaimed = unclaimedFieldErrors(error, ['email', 'password'])
    expect(unclaimed).toHaveLength(2)
    expect(unclaimed.join(' ')).toContain('invalid start of a property name')
    expect(unclaimed.join(' ')).toContain('The request field is required.')
  })

  // Both directions — a helper that always returned everything would pass the test above.
  it('returns nothing when every key is claimed', () => {
    const error = toApiError(REAL.validation)
    expect(unclaimedFieldErrors(error, ['name', 'email', 'password'])).toEqual([])
  })

  it('matches claims case-insensitively, like fieldError', () => {
    const error = toApiError(REAL.validation)
    expect(unclaimedFieldErrors(error, ['NAME', 'Email', 'password'])).toEqual([])
  })

  it('returns the messages of only the unclaimed keys', () => {
    const error = toApiError(REAL.validation)
    expect(unclaimedFieldErrors(error, ['name', 'email'])).toEqual(error.fieldErrors!.Password)
  })

  it('returns an empty array when there are no field errors', () => {
    expect(unclaimedFieldErrors(toApiError(REAL.noHousehold), ['name'])).toEqual([])
  })
})
