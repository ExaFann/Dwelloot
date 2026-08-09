// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ChoreCredit, ChoreStatusDot, ChoreTitle } from './choreStatusDisplay'
import type { ActivityLogStatus } from './activityApi'

/**
 * The notation, tested where it is **defined** — task [84].
 *
 * It was previously tested only through `RecentChoresColumn`, one of its four consumers, which is
 * why three of them could keep rendering the retired version while the suite stayed green. The
 * consumer tests still exist and still matter (they check the notation reaches those screens); this
 * file is what makes the rule itself the thing under test.
 */

const STATUSES = ['Approved', 'Pending', 'Rejected'] as const

afterEach(cleanup)

describe('ChoreCredit — a figure only when it was earned', () => {
  it('shows the number and the Points mark for an approved chore', () => {
    const { container } = render(<ChoreCredit status="Approved" points={15} />)

    expect(screen.getByText('15')).toBeInTheDocument()
    expect(container.querySelector('svg')).not.toBeNull()
  })

  /**
   * The load-bearing half. `pointsAwarded` is populated on all three statuses — measured in [46],
   * a rejected chore still reports its 5 — so printing it anywhere but Approved says a chore paid
   * out when it did not.
   */
  it.each(['Pending', 'Rejected'] as const)('renders nothing at all for %s', (status) => {
    const { container } = render(<ChoreCredit status={status} points={15} />)

    expect(container).toBeEmptyDOMElement()
  })

  /** No sign: the mark is the unit, and a `+` implies a ledger of debits that does not exist. */
  it('never prefixes a plus', () => {
    render(<ChoreCredit status="Approved" points={15} />)

    expect(screen.queryByText('+15')).not.toBeInTheDocument()
    expect(screen.getByText('15').textContent).toBe('15')
  })

  it('renders a zero-point chore rather than treating it as absent', () => {
    render(<ChoreCredit status="Approved" points={0} />)
    expect(screen.getByText('0')).toBeInTheDocument()
  })
})

describe('ChoreTitle — struck through only when rejected', () => {
  it('strikes a rejected chore', () => {
    render(<ChoreTitle status="Rejected">Bins</ChoreTitle>)
    expect(screen.getByText('Bins').className).toContain('line-through')
  })

  it.each(['Approved', 'Pending'] as const)('leaves a %s chore unstruck', (status) => {
    render(<ChoreTitle status={status}>Bins</ChoreTitle>)
    expect(screen.getByText('Bins').className).not.toContain('line-through')
  })
})

describe('ChoreStatusDot', () => {
  /**
   * Three statuses, three fills — and hidden from assistive tech, because colour never carries
   * meaning alone here: every caller pairs the dot with `STATUS_LABEL` in words.
   */
  it('gives each status its own colour, and none of them to a screen reader', () => {
    const classes = STATUSES.map((status: ActivityLogStatus) => {
      const { container } = render(<ChoreStatusDot status={status} />)
      const dot = container.firstElementChild!
      expect(dot).toHaveAttribute('aria-hidden', 'true')
      const fill = [...dot.classList].find((c) => c.startsWith('bg-'))!
      cleanup()
      return fill
    })

    expect(new Set(classes).size).toBe(3)
  })
})
