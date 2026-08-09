// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { useNewlyEarnedBadge } from './useNewlyEarnedBadge'
import type { Badge } from './badgeApi'

/**
 * Task [81] F — celebrating a badge at the moment it is **earned**, which used to pass in silence.
 * `badge-reveal` only ever fired when you *opened* one, which is the moment you go looking.
 */

const badge = (id: number, unlocked: boolean): Badge => ({
  id,
  name: `Badge ${id}`,
  criteria: `Criteria ${id}`,
  unlocked,
  unlockedAt: unlocked ? '2026-08-08T00:00:00Z' : null,
})

function Probe({ badges }: { badges: Badge[] | undefined }) {
  const earned = useNewlyEarnedBadge(badges, 1000)
  return <span data-testid="probe">{earned === null ? 'none' : String(earned)}</span>
}

const state = () => screen.getByTestId('probe').textContent

afterEach(cleanup)

describe('useNewlyEarnedBadge', () => {
  /**
   * The load case, and the whole reason the baseline is `null` rather than an empty set: the first
   * response is the *state*, not a set of changes. Without this, every visit to the Me screen would
   * celebrate every badge you already had — twelve of them at once.
   */
  it('does not celebrate badges you already had', () => {
    render(<Probe badges={[badge(1, true), badge(2, false)]} />)
    expect(state()).toBe('none')
  })

  it('reports a badge that unlocks while you are watching', () => {
    const { rerender } = render(<Probe badges={[badge(1, true), badge(2, false)]} />)
    rerender(<Probe badges={[badge(1, true), badge(2, true)]} />)
    expect(state()).toBe('2')
  })

  /** Which one, not merely that one — the wall has to know which cell to spin. */
  it('names the badge, so the right cell celebrates', () => {
    const { rerender } = render(<Probe badges={[badge(1, false), badge(7, false)]} />)
    rerender(<Probe badges={[badge(1, false), badge(7, true)]} />)
    expect(state()).toBe('7')
  })

  /** A poll returning the same list every 20s must not re-fire it. */
  it('stays quiet when the list is unchanged', () => {
    const list = [badge(1, true), badge(2, false)]
    const { rerender } = render(<Probe badges={list} />)
    rerender(<Probe badges={[badge(1, true), badge(2, false)]} />)
    expect(state()).toBe('none')
  })

  it('is silent while the query is still loading', () => {
    const { rerender } = render(<Probe badges={undefined} />)
    expect(state()).toBe('none')
    // And the first list after loading is still the baseline, not a celebration.
    rerender(<Probe badges={[badge(1, true)]} />)
    expect(state()).toBe('none')
  })
})
