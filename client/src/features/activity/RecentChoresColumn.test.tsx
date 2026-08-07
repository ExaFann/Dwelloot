// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
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
    render(
      <RecentChoresColumn
        chores={[chore({ status: 'Approved', pointsAwarded: 15 })]}
        align="left"
        emptyLabel="—"
      />,
    )
    expect(within(list()).getByText('+15')).toBeInTheDocument()
  })

  it('brackets a pending chore rather than crediting it', () => {
    render(
      <RecentChoresColumn
        chores={[chore({ status: 'Pending', pointsAwarded: 15 })]}
        align="left"
        emptyLabel="—"
      />,
    )

    expect(within(list()).getByText('(15)')).toBeInTheDocument()
    // Both directions: the credited form must be absent, not merely different.
    expect(within(list()).queryByText('+15')).not.toBeInTheDocument()
  })

  it('shows no number at all for a rejected chore', () => {
    render(
      <RecentChoresColumn
        chores={[chore({ status: 'Rejected', pointsAwarded: 15 })]}
        align="left"
        emptyLabel="—"
      />,
    )

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

/**
 * Task [71] — removing one of your own pending chores.
 *
 * The rule is narrow and its edges are the whole point: **your own column, and pending only.** An
 * approved chore has already moved the score and may sit in a settled period; taking it back stays
 * the partner's job, through rejection. Offering a control that can only fail would be the "never
 * show raw server internals" rule applied one step too late — at the message instead of the
 * affordance.
 */
describe('removing a pending chore', () => {
  const chores = [
    { id: 1, activityTitle: 'Dishes', pointsAwarded: 10, status: 'Pending' as const },
    { id: 2, activityTitle: 'Vacuum', pointsAwarded: 15, status: 'Approved' as const },
    { id: 3, activityTitle: 'Bins', pointsAwarded: 5, status: 'Rejected' as const },
  ]

  it('offers a control for a pending chore', () => {
    render(<RecentChoresColumn chores={chores} align="left" emptyLabel="—" onRemove={() => {}} />)
    expect(screen.getByRole('button', { name: /remove dishes/i })).toBeInTheDocument()
  })

  it('offers none for approved or rejected chores', () => {
    render(<RecentChoresColumn chores={chores} align="left" emptyLabel="—" onRemove={() => {}} />)
    expect(screen.queryByRole('button', { name: /remove vacuum/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /remove bins/i })).not.toBeInTheDocument()
  })

  /** The partner's column passes no callback, so nothing there is removable. */
  it('offers none at all without a callback', () => {
    render(<RecentChoresColumn chores={chores} align="right" emptyLabel="—" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  /**
   * Two steps since [78]: the trigger *asks*, and Delete is what sends. This is the assertion the
   * owner's complaint turns into — a mis-tap now costs one extra tap rather than a logged chore.
   */
  it('asks before it deletes', () => {
    const onRemove = vi.fn()
    render(<RecentChoresColumn chores={chores} align="left" emptyLabel="—" onRemove={onRemove} />)

    fireEvent.click(screen.getByRole('button', { name: /remove dishes/i }))

    expect(onRemove).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /delete dishes/i })).toBeInTheDocument()
  })

  it('reports the chore id, not its index, once confirmed', () => {
    const onRemove = vi.fn()
    render(<RecentChoresColumn chores={chores} align="left" emptyLabel="—" onRemove={onRemove} />)

    fireEvent.click(screen.getByRole('button', { name: /remove dishes/i }))
    fireEvent.click(screen.getByRole('button', { name: /delete dishes/i }))

    expect(onRemove).toHaveBeenCalledWith(1)
  })

  it.each([
    ['Keep', (title: string) => fireEvent.click(screen.getByRole('button', { name: `Keep ${title}` }))],
    ['Escape', () => fireEvent.keyDown(screen.getByRole('list'), { key: 'Escape' })],
  ])('backs out on %s without sending anything', (_name, back) => {
    const onRemove = vi.fn()
    render(<RecentChoresColumn chores={chores} align="left" emptyLabel="—" onRemove={onRemove} />)

    fireEvent.click(screen.getByRole('button', { name: /remove dishes/i }))
    back('Dishes')

    expect(onRemove).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /remove dishes/i })).toBeInTheDocument()
  })

  /** Otherwise cancelling drops focus on `<body>` and a keyboard user restarts from the top. */
  it('returns focus to the row it opened from', () => {
    render(<RecentChoresColumn chores={chores} align="left" emptyLabel="—" onRemove={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: /remove dishes/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Keep Dishes' }))

    expect(screen.getByRole('button', { name: /remove dishes/i })).toHaveFocus()
  })

  /** One row at a time: two open confirms in a 112px scroller is two ways to lose your place. */
  it('opening a second confirm closes the first', () => {
    const twoPending = [
      chores[0],
      { id: 4, activityTitle: 'Laundry', pointsAwarded: 8, status: 'Pending' as const },
    ]
    render(<RecentChoresColumn chores={twoPending} align="left" emptyLabel="—" onRemove={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: /remove dishes/i }))
    fireEvent.click(screen.getByRole('button', { name: /remove laundry/i }))

    expect(screen.getByRole('button', { name: 'Delete Laundry' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete Dishes' })).not.toBeInTheDocument()
  })

  /** A second tap while the first is in flight would send the same delete twice. */
  it('is disabled while a removal is in flight', () => {
    render(
      <RecentChoresColumn
        chores={chores}
        align="left"
        emptyLabel="—"
        onRemove={() => {}}
        isRemoving
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /remove dishes/i }))
    expect(screen.getByRole('button', { name: /delete dishes/i })).toBeDisabled()
    // Backing out stays available whatever is in flight.
    expect(screen.getByRole('button', { name: 'Keep Dishes' })).toBeEnabled()
  })

  /**
   * jsdom has no `:hover`, so this pins only the half that a unit test *can* see: the glyph is
   * hidden by opacity rather than removed, so revealing it cannot reflow the row, and it stays in
   * the tab order and the accessibility tree for keyboard and screen-reader users. Whether hover
   * actually reveals it is verified in the browser.
   */
  it('hides the trigger behind hover from sm up, without removing it', () => {
    render(<RecentChoresColumn chores={chores} align="left" emptyLabel="—" onRemove={() => {}} />)

    const trigger = screen.getByRole('button', { name: /remove dishes/i })
    expect(trigger.className).toContain('sm:opacity-0')
    expect(trigger.className).toContain('sm:group-hover:opacity-100')
    // Never `hidden`: below sm there is no hover, so the trigger has to stay plainly visible.
    expect(trigger.className).not.toMatch(/\bhidden\b/)
  })
})
