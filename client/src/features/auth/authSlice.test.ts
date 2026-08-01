// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { authReducer, initialAuthState, signedIn, signedOut } from './authSlice'
import { readSession } from './authStorage'

const USER = { id: 7, name: 'Alex' }

beforeEach(() => {
  localStorage.clear()
})

describe('signedIn', () => {
  it('puts the token and user in state', () => {
    const next = authReducer(initialAuthState, signedIn({ token: 'jwt.abc', user: USER }))
    expect(next).toEqual({ token: 'jwt.abc', user: USER })
  })

  it('persists, so a refresh keeps the session', () => {
    authReducer(initialAuthState, signedIn({ token: 'jwt.abc', user: USER }))
    // Through storage, not through state — the whole point of the reducer's side effect.
    expect(readSession()).toEqual({ token: 'jwt.abc', user: USER })
  })
})

describe('signedOut', () => {
  const signedInState = { token: 'jwt.abc', user: USER }

  it('empties state', () => {
    expect(authReducer(signedInState, signedOut())).toEqual({ token: null, user: null })
  })

  it('empties storage too', () => {
    authReducer(initialAuthState, signedIn({ token: 'jwt.abc', user: USER }))
    expect(readSession()).not.toBeNull()

    authReducer(signedInState, signedOut())
    // Both directions: asserting only the "after" would pass against a reducer that never wrote.
    expect(readSession()).toBeNull()
  })

  it('is safe when already signed out', () => {
    expect(authReducer(initialAuthState, signedOut())).toEqual({ token: null, user: null })
  })
})
