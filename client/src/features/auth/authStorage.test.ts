// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearSession, readSession, writeSession } from './authStorage'

const VALID = { token: 'jwt.abc.def', user: { id: 7, name: 'Alex' } }
const KEY = 'dwelloot.session'

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('round trip', () => {
  it('writes and reads a session back', () => {
    writeSession(VALID)
    expect(readSession()).toEqual(VALID)
  })

  it('clears it', () => {
    writeSession(VALID)
    clearSession()
    expect(readSession()).toBeNull()
    // Asserted against storage too, not only through the reader — a reader that always returned
    // null would pass the line above on its own.
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('returns null when nothing was ever stored', () => {
    expect(readSession()).toBeNull()
  })
})

describe('rejects anything that is not a session', () => {
  it.each([
    ['not JSON at all', 'definitely not json'],
    ['JSON null', 'null'],
    ['an array', '[]'],
    ['an empty object', '{}'],
    ['no token', JSON.stringify({ user: { id: 1, name: 'A' } })],
    ['an empty token', JSON.stringify({ token: '', user: { id: 1, name: 'A' } })],
    ['no user', JSON.stringify({ token: 'jwt' })],
    ['user missing id', JSON.stringify({ token: 'jwt', user: { name: 'A' } })],
    ['user id as a string', JSON.stringify({ token: 'jwt', user: { id: '1', name: 'A' } })],
    ['user missing name', JSON.stringify({ token: 'jwt', user: { id: 1 } })],
  ])('%s → null', (_name, raw) => {
    localStorage.setItem(KEY, raw)
    // A shape check rather than a null check, because a half-written value would otherwise become
    // `user.name === undefined` rendered straight into the DOM.
    expect(readSession()).toBeNull()
  })
})

describe('when localStorage itself throws', () => {
  /**
   * Safari private browsing and "block site data" both make these throw. `readSession` runs during
   * store creation, before React mounts, so an uncaught throw is a white screen with no UI at all.
   */
  it('read degrades to signed out', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('SecurityError')
    })
    expect(() => readSession()).not.toThrow()
    expect(readSession()).toBeNull()
  })

  it('write is swallowed, so the session still works for this page load', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError')
    })
    expect(() => writeSession(VALID)).not.toThrow()
  })

  it('clear is swallowed', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('SecurityError')
    })
    expect(() => clearSession()).not.toThrow()
  })
})
