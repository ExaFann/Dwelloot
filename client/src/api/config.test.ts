import { describe, expect, it } from 'vitest'
import { DEV_FALLBACK_BASE_URL, resolveApiBaseUrl } from './config'

describe('resolveApiBaseUrl', () => {
  it('uses the configured value when there is one', () => {
    expect(resolveApiBaseUrl('https://api.example.com', false)).toBe('https://api.example.com')
  })

  it('prefers the configured value over the development fallback', () => {
    // Both directions: a resolver that ignored its input and always returned the fallback would
    // pass "development falls back" on its own.
    expect(resolveApiBaseUrl('https://api.example.com', true)).toBe('https://api.example.com')
    expect(resolveApiBaseUrl(undefined, true)).toBe(DEV_FALLBACK_BASE_URL)
  })

  it('falls back to the local API in development', () => {
    expect(resolveApiBaseUrl(undefined, true)).toBe('http://localhost:5193')
  })

  it.each([undefined, '', '   '])('throws in production when the value is %o', (value) => {
    expect(() => resolveApiBaseUrl(value, false)).toThrow(/VITE_API_BASE_URL/)
  })

  it('treats blank as unset in development too', () => {
    expect(resolveApiBaseUrl('   ', true)).toBe(DEV_FALLBACK_BASE_URL)
  })

  it.each([
    ['https://api.example.com/', 'https://api.example.com'],
    ['https://api.example.com///', 'https://api.example.com'],
    ['  https://api.example.com/  ', 'https://api.example.com'],
  ])('strips a trailing slash: %s', (input, expected) => {
    // Otherwise joining with an endpoint path yields `//api/activities`. The backend's CORS
    // normaliser forgives one on its side (task [35]); this is the mirror.
    expect(resolveApiBaseUrl(input, false)).toBe(expected)
  })

  it('leaves a path segment alone', () => {
    // A base URL with a path is legitimate behind a reverse proxy; only the trailing slash goes.
    expect(resolveApiBaseUrl('https://example.com/api/', false)).toBe('https://example.com/api')
  })
})
