// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { makeStore } from '../../app/store'
import { ThemeToggle } from './ThemeToggle'
import { useThemeEffect } from './useThemeEffect'
import { THEME_STORAGE_KEY } from '../../theme/themeMode'

/**
 * The toggle and the root effect are exercised together, because that is the only arrangement in
 * which the feature is real: the control dispatches, and the effect writes `data-theme`. Testing the
 * toggle alone would assert that a button changes a Redux value, which is not the behaviour anyone
 * cares about.
 */
function Harness() {
  useThemeEffect()
  return <ThemeToggle />
}

type Listener = (event: MediaQueryListEvent) => void

/** A controllable `prefers-color-scheme` so the OS can be made to "change" mid-test. */
function stubMatchMedia(initialMatches: boolean) {
  const listeners: Listener[] = []
  const query = {
    matches: initialMatches,
    addEventListener: (_type: string, listener: Listener) => listeners.push(listener),
    removeEventListener: (_type: string, listener: Listener) => {
      const index = listeners.indexOf(listener)
      if (index >= 0) listeners.splice(index, 1)
    },
  }
  vi.stubGlobal('matchMedia', vi.fn(() => query))

  return {
    listenerCount: () => listeners.length,
    change(matches: boolean) {
      query.matches = matches
      for (const listener of [...listeners]) listener({ matches } as MediaQueryListEvent)
    },
  }
}

function renderToggle() {
  render(
    <Provider store={makeStore()}>
      <Harness />
    </Provider>,
  )
}

const chip = (name: RegExp) => screen.getByRole('button', { name })
const scheme = () => document.documentElement.getAttribute('data-theme')

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  document.documentElement.removeAttribute('data-theme')
})

describe('the control', () => {
  it('offers all three modes', () => {
    stubMatchMedia(false)
    renderToggle()

    expect(chip(/light/i)).toBeInTheDocument()
    expect(chip(/dark/i)).toBeInTheDocument()
    expect(chip(/system/i)).toBeInTheDocument()
  })

  /** Both directions: exactly one pressed, and the others explicitly not. */
  it('marks the current mode and only that one', () => {
    stubMatchMedia(false)
    renderToggle()

    expect(chip(/system/i)).toHaveAttribute('aria-pressed', 'true')
    expect(chip(/light/i)).toHaveAttribute('aria-pressed', 'false')
    expect(chip(/dark/i)).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('choosing a scheme', () => {
  it('applies dark to the document and remembers it', async () => {
    stubMatchMedia(false)
    renderToggle()

    await userEvent.setup().click(chip(/dark/i))

    await waitFor(() => expect(scheme()).toBe('dark'))
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
  })

  /** Light removes the attribute rather than setting a value no CSS rule matches. */
  it('applies light by removing the attribute', async () => {
    stubMatchMedia(true)
    renderToggle()
    const user = userEvent.setup()

    await user.click(chip(/dark/i))
    await waitFor(() => expect(scheme()).toBe('dark'))

    await user.click(chip(/light/i))
    await waitFor(() => expect(scheme()).toBeNull())
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
  })

  it.each([
    [true, 'dark'],
    [false, null],
  ])('resolves system from the device (prefersDark=%s)', async (prefersDark, expected) => {
    stubMatchMedia(prefersDark)
    renderToggle()
    const user = userEvent.setup()

    // Away and back, so the assertion is about System resolving rather than about the initial state.
    await user.click(chip(/dark/i))
    await user.click(chip(/system/i))

    await waitFor(() => expect(scheme()).toBe(expected))
  })
})

describe('following the device', () => {
  it('re-applies when the OS changes while in System', async () => {
    const media = stubMatchMedia(false)
    renderToggle()
    await waitFor(() => expect(scheme()).toBeNull())

    media.change(true)

    await waitFor(() => expect(scheme()).toBe('dark'))
  })

  /**
   * The other direction, and the assertion that fails against a listener which ignores the mode: an
   * explicit choice must survive the OS changing under it.
   */
  it('ignores the OS while a scheme is chosen explicitly', async () => {
    const media = stubMatchMedia(false)
    renderToggle()
    const user = userEvent.setup()

    await user.click(chip(/light/i))
    await waitFor(() => expect(scheme()).toBeNull())

    media.change(true)

    // Still light: the user answered the question.
    await waitFor(() => expect(scheme()).toBeNull())
    expect(media.listenerCount()).toBe(0)
  })

  it('stops listening when the component unmounts', async () => {
    const media = stubMatchMedia(false)
    renderToggle()
    await waitFor(() => expect(media.listenerCount()).toBe(1))

    cleanup()

    expect(media.listenerCount()).toBe(0)
  })
})
