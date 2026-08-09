// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { leadOf, useChangePulse } from './useChangePulse'

/**
 * Task [81] A/C/E — the hook behind every "did that just work?" pulse.
 *
 * Tested here rather than through the three screens that use it: the rules that matter (never on
 * arrival, restart on a second change, increase-only) are the hook's, and asserting them once
 * beats asserting a third of them three times against unrelated fixtures.
 */

function Probe({ value, onlyIncrease }: { value: number | undefined; onlyIncrease?: boolean }) {
  const pulsing = useChangePulse(value, { onlyIncrease, durationMs: 300 })
  return <span data-testid="probe">{pulsing ? 'pulsing' : 'still'}</span>
}

const state = () => screen.getByTestId('probe').textContent

afterEach(cleanup)

describe('useChangePulse', () => {
  /**
   * The load case, and the reason `undefined` is the "nothing yet" marker rather than `0`: a screen
   * that pulsed every total the moment its query landed would celebrate the user doing nothing.
   */
  it('stays still on the first real value', () => {
    const { rerender } = render(<Probe value={undefined} />)
    expect(state()).toBe('still')

    rerender(<Probe value={13} />)
    expect(state()).toBe('still')
  })

  it('pulses when the value changes, and settles again', () => {
    vi.useFakeTimers()
    try {
      const { rerender } = render(<Probe value={13} />)
      rerender(<Probe value={14} />)
      expect(state()).toBe('pulsing')

      act(() => void vi.advanceTimersByTime(320))
      expect(state()).toBe('still')
    } finally {
      vi.useRealTimers()
    }
  })

  /** A re-render with the same number is not a change — polling every 20s must not strobe. */
  it('ignores a re-render that carries the same value', () => {
    const { rerender } = render(<Probe value={13} />)
    rerender(<Probe value={14} />)
    rerender(<Probe value={14} />)
    expect(state()).toBe('pulsing')
  })

  /**
   * The restart case. A second change landing mid-flight leaves the class already applied, so React
   * renders nothing new and no `animationend` ever arrives — which is exactly why the hook clears
   * on a timer it can reset rather than on the animation event.
   */
  it('restarts its timer when a second change lands mid-pulse', () => {
    vi.useFakeTimers()
    try {
      const { rerender } = render(<Probe value={1} />)
      rerender(<Probe value={2} />)
      act(() => void vi.advanceTimersByTime(200))
      rerender(<Probe value={3} />)
      // The first pulse's 300ms would have elapsed here; the second's must not have.
      act(() => void vi.advanceTimersByTime(200))
      expect(state()).toBe('pulsing')

      act(() => void vi.advanceTimersByTime(150))
      expect(state()).toBe('still')
    } finally {
      vi.useRealTimers()
    }
  })

  describe('onlyIncrease — the nav badge’s rule', () => {
    it('pulses when the count rises', () => {
      const { rerender } = render(<Probe value={1} onlyIncrease />)
      rerender(<Probe value={2} onlyIncrease />)
      expect(state()).toBe('pulsing')
    })

    /** Approving things makes it fall; a badge that applauded that would applaud your own work. */
    it('stays still when the count falls', () => {
      const { rerender } = render(<Probe value={2} onlyIncrease />)
      rerender(<Probe value={1} onlyIncrease />)
      expect(state()).toBe('still')
    })
  })
})

describe('leadOf', () => {
  /**
   * The bolt reacts to the lead **changing hands**, not to the gap widening — so this collapses to
   * a sign. Going 10–0 up to 25–0 is the same lead and must not fire.
   */
  it('is a direction, not a margin', () => {
    expect(leadOf(10, 0)).toBe(leadOf(25, 0))
    expect(leadOf(0, 10)).toBe(-1)
    expect(leadOf(5, 5)).toBe(0)
  })

  /** A tie is its own state: drawing level and then going ahead are two separate moments. */
  it('treats level as distinct from either lead', () => {
    expect(leadOf(5, 5)).not.toBe(leadOf(6, 5))
    expect(leadOf(5, 5)).not.toBe(leadOf(5, 6))
  })
})
