// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NOTICE_TIMEOUT_MS, useTransientMessage } from './useTransientMessage'

/**
 * The claim is **"the message goes away on its own"**, and the assertions are positioned where that
 * claim can actually fail.
 *
 * [59] recorded the way this goes wrong: a test that checks a value immediately after an action
 * survives `TIMEOUT → 0`, because `setTimeout(fn, 0)` still defers past a synchronous check — it
 * proves "not cleared synchronously", not "there is a window". So every test here advances the
 * clock to a **named boundary** and asserts on both sides of it.
 *
 * Fake timers are safe in this file: the hook is pure and touches no RTK Query, which is the
 * combination [59] found stalls forever under `vi.useFakeTimers()`.
 */

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('a message clears itself', () => {
  it('shows immediately', () => {
    const { result } = renderHook(() => useTransientMessage())
    act(() => result.current.show('1 approved.'))
    expect(result.current.message).toBe('1 approved.')
  })

  it('is still there one millisecond before the timeout', () => {
    const { result } = renderHook(() => useTransientMessage())
    act(() => result.current.show('1 approved.'))
    act(() => void vi.advanceTimersByTime(NOTICE_TIMEOUT_MS - 1))
    expect(result.current.message).toBe('1 approved.')
  })

  it('is gone at the timeout', () => {
    const { result } = renderHook(() => useTransientMessage())
    act(() => result.current.show('1 approved.'))
    act(() => void vi.advanceTimersByTime(NOTICE_TIMEOUT_MS))
    expect(result.current.message).toBeNull()
  })

  /**
   * The bug being fixed, stated directly: `PendingApprovals` had no timer at all, so the notice
   * outlived every later action. A long advance is the shape of that failure.
   */
  it('does not survive a long wait', () => {
    const { result } = renderHook(() => useTransientMessage())
    act(() => result.current.show('1 approved.'))
    act(() => void vi.advanceTimersByTime(60_000))
    expect(result.current.message).toBeNull()
  })
})

describe('a second message restarts the clock', () => {
  /**
   * Without this, a notice shown 3.9s after the previous one inherits 0.1s of life. A `useEffect`
   * keyed on the message value would get this right for a *different* string and wrong for the same
   * one — so both cases are covered.
   */
  it('gives a different message its full window', () => {
    const { result } = renderHook(() => useTransientMessage())
    act(() => result.current.show('1 approved.'))
    act(() => void vi.advanceTimersByTime(NOTICE_TIMEOUT_MS - 100))
    act(() => result.current.show('Dishes rejected.'))

    act(() => void vi.advanceTimersByTime(NOTICE_TIMEOUT_MS - 1))
    expect(result.current.message).toBe('Dishes rejected.')

    act(() => void vi.advanceTimersByTime(1))
    expect(result.current.message).toBeNull()
  })

  it('gives an identical message its full window too', () => {
    const { result } = renderHook(() => useTransientMessage())
    act(() => result.current.show('1 approved.'))
    act(() => void vi.advanceTimersByTime(NOTICE_TIMEOUT_MS - 100))
    act(() => result.current.show('1 approved.'))

    act(() => void vi.advanceTimersByTime(NOTICE_TIMEOUT_MS - 1))
    expect(result.current.message).toBe('1 approved.')
  })
})

describe('clear', () => {
  it('removes the message at once', () => {
    const { result } = renderHook(() => useTransientMessage())
    act(() => result.current.show('1 approved.'))
    act(() => result.current.clear())
    expect(result.current.message).toBeNull()
  })

  /** A cleared message must not come back when the original timer would have fired. */
  it('cancels the pending timer rather than leaving it armed', () => {
    const { result } = renderHook(() => useTransientMessage())
    act(() => result.current.show('1 approved.'))
    act(() => result.current.clear())
    act(() => result.current.show('Dishes rejected.'))

    // The first timer, if still armed, would fire here and blank the second message early.
    act(() => void vi.advanceTimersByTime(NOTICE_TIMEOUT_MS - 1))
    expect(result.current.message).toBe('Dishes rejected.')
  })
})

describe('unmounting', () => {
  /**
   * Asserted on the timer count rather than on a console warning, because React 19 does not warn
   * about a setState after unmount — so the only observable evidence is that nothing is left armed.
   */
  it('leaves no timer behind', () => {
    const { result, unmount } = renderHook(() => useTransientMessage())
    act(() => result.current.show('1 approved.'))
    expect(vi.getTimerCount()).toBe(1)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('the window is configurable', () => {
  it('honours a caller-supplied timeout', () => {
    const { result } = renderHook(() => useTransientMessage(1000))
    act(() => result.current.show('Saved.'))
    act(() => void vi.advanceTimersByTime(999))
    expect(result.current.message).toBe('Saved.')
    act(() => void vi.advanceTimersByTime(1))
    expect(result.current.message).toBeNull()
  })
})
