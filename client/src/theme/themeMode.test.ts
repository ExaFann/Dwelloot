// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  THEME_STORAGE_KEY,
  applyScheme,
  readStoredMode,
  resolveScheme,
  storeMode,
  systemPrefersDark,
} from './themeMode'

beforeEach(() => localStorage.clear())
afterEach(() => vi.unstubAllGlobals())

describe('resolveScheme', () => {
  /**
   * Both directions of the system flag for each explicit mode. A resolver that simply returned the
   * system value would satisfy every `system` case below and still be wrong for the two that matter
   * most — the ones where the user has actually answered the question.
   */
  it.each([
    ['light', true, 'light'],
    ['light', false, 'light'],
    ['dark', true, 'dark'],
    ['dark', false, 'dark'],
  ] as const)('%s ignores the system preference (prefersDark=%s)', (mode, prefersDark, expected) => {
    expect(resolveScheme(mode, prefersDark)).toBe(expected)
  })

  it('system follows the device, both ways', () => {
    expect(resolveScheme('system', true)).toBe('dark')
    expect(resolveScheme('system', false)).toBe('light')
  })
})

describe('applyScheme', () => {
  it('sets the attribute for dark', () => {
    const root = document.createElement('html')
    applyScheme('dark', root)
    expect(root.getAttribute('data-theme')).toBe('dark')
  })

  /**
   * Light **removes** the attribute rather than writing `data-theme="light"`. The stylesheet selects
   * dark on presence, so a light value is a state no rule matches — it works today and is a trap for
   * anyone who later adds a `[data-theme]` selector expecting it to mean something.
   */
  it('removes the attribute for light rather than writing a light value', () => {
    const root = document.createElement('html')
    root.setAttribute('data-theme', 'dark')
    applyScheme('light', root)
    expect(root.hasAttribute('data-theme')).toBe(false)
  })

  it('is idempotent', () => {
    const root = document.createElement('html')
    applyScheme('dark', root)
    applyScheme('dark', root)
    expect(root.getAttribute('data-theme')).toBe('dark')
  })
})

describe('storage', () => {
  it('round-trips each mode', () => {
    for (const mode of ['light', 'dark', 'system'] as const) {
      storeMode(mode)
      expect(readStoredMode()).toBe(mode)
    }
  })

  it('defaults to system when nothing is stored', () => {
    expect(readStoredMode()).toBe('system')
  })

  /** A value written by an older build, or corrupted, must not become an attribute value. */
  it('falls back to system for a value that is not a mode', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'midnight')
    expect(readStoredMode()).toBe('system')
  })

  /**
   * `localStorage` throws in Safari private browsing and when site data is blocked. This module is
   * read before React mounts, so an uncaught throw is a white screen with no UI.
   */
  it('survives storage that throws, in both directions', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })

    expect(readStoredMode()).toBe('system')
    expect(() => storeMode('dark')).not.toThrow()
  })
})

describe('systemPrefersDark', () => {
  it.each([true, false])('reports the media query (%s)', (matches) => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches })))
    expect(systemPrefersDark()).toBe(matches)
  })

  /** jsdom without a stub, and any server render, have no `matchMedia`. Absent is not a crash. */
  it('is false when matchMedia does not exist', () => {
    vi.stubGlobal('matchMedia', undefined)
    expect(systemPrefersDark()).toBe(false)
  })
})
