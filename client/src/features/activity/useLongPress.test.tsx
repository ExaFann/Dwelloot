// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useLongPress } from './useLongPress'

/**
 * The press-and-hold shortcut into editing a chore.
 *
 * Log `047` recorded this as unverified: *"Long-press has never been performed by a real finger; the
 * 10px scroll tolerance is convention, not measurement."* A real finger still has not touched it —
 * but the **rules** were untested too, and those are the part that decides whether scrolling the
 * chore list opens an editor by accident.
 *
 * Fake timers throughout, because the whole feature is "did 500ms pass without moving".
 */

function Harness({ onLongPress }: { onLongPress: () => void }) {
  const { handlers, consumedRef } = useLongPress(onLongPress)
  return (
    <button type="button" data-testid="target" {...handlers} onClick={() => consumedRef.current && onLongPressConsumed()}>
      hold me
    </button>
  )
}

let onLongPressConsumed: () => void

const target = () => screen.getByTestId('target')
const down = (x = 0, y = 0) => fireEvent.pointerDown(target(), { clientX: x, clientY: y })
const move = (x: number, y: number) => fireEvent.pointerMove(target(), { clientX: x, clientY: y })

beforeEach(() => {
  vi.useFakeTimers()
  onLongPressConsumed = vi.fn()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('holding still', () => {
  it('fires after the hold, and not before', () => {
    const onLongPress = vi.fn()
    render(<Harness onLongPress={onLongPress} />)

    down()
    // Both directions of the threshold: one tick short must not fire.
    vi.advanceTimersByTime(499)
    expect(onLongPress).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(onLongPress).toHaveBeenCalledTimes(1)
  })

  it('fires once, not once per timer tick', () => {
    const onLongPress = vi.fn()
    render(<Harness onLongPress={onLongPress} />)

    down()
    vi.advanceTimersByTime(3000)
    expect(onLongPress).toHaveBeenCalledTimes(1)
  })
})

describe('moving cancels it — this is what keeps the list scrollable', () => {
  /**
   * The tolerance is 10px. Both sides are asserted, because a check that only tested a big drag
   * would pass against any threshold at all — including one so small that a resting thumb cancels.
   */
  it.each([
    ['just inside, on x', 10, 0, true],
    ['just inside, on y', 0, 10, true],
    ['just outside, on x', 11, 0, false],
    ['just outside, on y', 0, 11, false],
    ['a real scroll', 0, 120, false],
  ])('%s', (_name, x, y, shouldFire) => {
    const onLongPress = vi.fn()
    render(<Harness onLongPress={onLongPress} />)

    down(50, 50)
    move(50 + x, 50 + y)
    vi.advanceTimersByTime(600)

    expect(onLongPress).toHaveBeenCalledTimes(shouldFire ? 1 : 0)
  })

  it('measures from where the press began, not from the last move', () => {
    const onLongPress = vi.fn()
    render(<Harness onLongPress={onLongPress} />)

    down(50, 50)
    // Three small steps that stay inside the tolerance individually but leave it in total.
    move(55, 50)
    move(60, 50)
    move(65, 50)
    vi.advanceTimersByTime(600)

    // 15px from the origin: a drag, so cancelled. Comparing against the previous move would have
    // seen three 5px steps and held on.
    expect(onLongPress).not.toHaveBeenCalled()
  })

  it('ignores movement when no press is in progress', () => {
    const onLongPress = vi.fn()
    render(<Harness onLongPress={onLongPress} />)

    // A hover across the row with no button down must not throw or arm anything.
    expect(() => move(500, 500)).not.toThrow()
    vi.advanceTimersByTime(600)
    expect(onLongPress).not.toHaveBeenCalled()
  })
})

describe('letting go', () => {
  it.each([
    ['pointerup', (el: HTMLElement) => fireEvent.pointerUp(el)],
    ['pointercancel', (el: HTMLElement) => fireEvent.pointerCancel(el)],
    ['pointerleave', (el: HTMLElement) => fireEvent.pointerLeave(el)],
  ])('%s before the hold cancels it', (_name, release) => {
    const onLongPress = vi.fn()
    render(<Harness onLongPress={onLongPress} />)

    down()
    vi.advanceTimersByTime(200)
    release(target())
    vi.advanceTimersByTime(600)

    expect(onLongPress).not.toHaveBeenCalled()
  })
})

describe('consumedRef', () => {
  /**
   * The flag the row's `onClick` reads to skip its own action. Without it a hold would open the
   * editor *and* toggle the selection on release — see `LogActivityPage`'s `ChoreRow`.
   */
  it('is set once a hold has fired', () => {
    const onLongPress = vi.fn()
    render(<Harness onLongPress={onLongPress} />)

    down()
    vi.advanceTimersByTime(600)
    fireEvent.click(target())

    expect(onLongPressConsumed).toHaveBeenCalled()
  })

  /** The other direction: an ordinary tap must leave the click handler free to act. */
  it('stays clear for a tap that never became a hold', () => {
    const onLongPress = vi.fn()
    render(<Harness onLongPress={onLongPress} />)

    down()
    vi.advanceTimersByTime(100)
    fireEvent.pointerUp(target())
    fireEvent.click(target())

    expect(onLongPressConsumed).not.toHaveBeenCalled()
  })

  it('resets on the next press, so one hold does not swallow every later tap', () => {
    const onLongPress = vi.fn()
    render(<Harness onLongPress={onLongPress} />)

    down()
    vi.advanceTimersByTime(600)
    fireEvent.pointerUp(target())

    down()
    vi.advanceTimersByTime(100)
    fireEvent.pointerUp(target())
    fireEvent.click(target())

    expect(onLongPressConsumed).not.toHaveBeenCalled()
  })
})
