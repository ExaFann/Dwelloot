// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { RecentChoresColumn, type RecentChore } from './RecentChoresColumn'

/**
 * Each partner's chores under their avatar on the head-to-head card.
 *
 * 50% statements but **12.5% branches** when [59] measured — the rendering was exercised by the
 * card's own tests, but the per-status branches were not, and those are where the one rule that
 * matters lives: `pointsAwarded` is what a chore was *worth*, not what was earned, so a pending or
 * rejected row must never read as a credit.
 */

const chore = (over: Partial<RecentChore> = {}): RecentChore => ({
  id: 1,
  activityTitle: 'Wash dishes',
  pointsAwarded: 10,
  status: 'Approved',
  ...over,
})

const list = () => screen.getByRole('list', { name: /recent chores/i })

afterEach(cleanup)

describe('the empty state', () => {
  it('uses the caller’s wording rather than a shared one', () => {
    render(<RecentChoresColumn chores={[]} align="left" emptyLabel="Nothing logged today." />)

    expect(screen.getByText('Nothing logged today.')).toBeInTheDocument()
    // No empty list left behind for a screen reader to walk into.
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })
})

describe('how points are rendered', () => {
  /**
   * The rule from `describeLogPoints`, asserted here because this is where it reaches a screen.
   * `pointsAwarded` is populated on all three statuses — measured in [46], a rejected chore still
   * reports 5 — so the number alone is a lie on two of them.
   */
  it('credits an approved chore', () => {
    render(<RecentChoresColumn chores={[chore({ status: 'Approved', pointsAwarded: 15 })]} align="left" emptyLabel="—" />)
    expect(within(list()).getByText('+15')).toBeInTheDocument()
  })

  it('brackets a pending chore rather than crediting it', () => {
    render(<RecentChoresColumn chores={[chore({ status: 'Pending', pointsAwarded: 15 })]} align="left" emptyLabel="—" />)

    expect(within(list()).getByText('(15)')).toBeInTheDocument()
    // Both directions: the credited form must be absent, not merely different.
    expect(within(list()).queryByText('+15')).not.toBeInTheDocument()
  })

  it('shows no number at all for a rejected chore', () => {
    render(<RecentChoresColumn chores={[chore({ status: 'Rejected', pointsAwarded: 15 })]} align="left" emptyLabel="—" />)

    expect(within(list()).getByText('—')).toBeInTheDocument()
    expect(within(list()).queryByText('+15')).not.toBeInTheDocument()
    expect(within(list()).queryByText('(15)')).not.toBeInTheDocument()
  })

  /** The status reaches assistive tech as a word, since the visible marker is a coloured square. */
  it.each([
    ['Approved', 'Approved'],
    ['Pending', 'Waiting'],
    ['Rejected', 'Rejected'],
  ] as const)('announces %s as "%s"', (status, label) => {
    render(<RecentChoresColumn chores={[chore({ status })]} align="left" emptyLabel="—" />)
    expect(within(list()).getByText(label)).toBeInTheDocument()
  })
})

describe('the list', () => {
  it('keeps the order it was given', () => {
    const chores = [
      chore({ id: 1, activityTitle: 'Vacuum' }),
      chore({ id: 2, activityTitle: 'Mow the lawn' }),
      chore({ id: 3, activityTitle: 'Cook dinner' }),
    ]
    render(<RecentChoresColumn chores={chores} align="left" emptyLabel="—" />)

    const titles = [...list().querySelectorAll('li')].map((li) =>
      li.textContent?.replace(/\s+/g, ' ').trim(),
    )
    expect(titles[0]).toMatch(/vacuum/i)
    expect(titles[1]).toMatch(/mow the lawn/i)
    expect(titles[2]).toMatch(/cook dinner/i)
  })

  /**
   * The card must keep a fixed shape whether someone logged one chore or twenty, so the column
   * scrolls rather than growing. [58a] made this reachable by fetching twelve instead of four.
   */
  it('scrolls rather than growing', () => {
    render(
      <RecentChoresColumn
        chores={Array.from({ length: 12 }, (_, i) => chore({ id: i + 1 }))}
        align="left"
        emptyLabel="—"
      />,
    )
    expect(list().className).toMatch(/overflow-y-auto/)
    expect(list().className).toMatch(/max-h-/)
  })

  it('mirrors itself for the right-hand partner', () => {
    const { container } = render(
      <RecentChoresColumn chores={[chore()]} align="right" emptyLabel="—" />,
    )
    expect(container.querySelector('li')?.className).toMatch(/flex-row-reverse/)
  })
})
