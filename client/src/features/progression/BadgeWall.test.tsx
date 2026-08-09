// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Provider } from 'react-redux'
import { makeStore } from '../../app/store'
import { signedIn } from '../auth/authSlice'
import { BadgeWall } from './BadgeWall'
import { badgeWallGeometry } from './badgeWallGeometry'

/**
 * Task [76] — the honeycomb.
 *
 * The geometry tests check against §7's **worked pixel table**, not against `badgeWallGeometry`
 * re-run — the table was verified by the designer independently of this code, so it can catch an
 * implementation error the formula's own output never could.
 */

const BADGE = (id: number, unlocked: boolean, name = `Badge ${id}`) => ({
  id,
  name,
  criteria: `Criteria for ${name}`,
  unlocked,
  unlockedAt: unlocked ? '2026-08-01T00:00:00Z' : null,
})

function stub(badges: ReturnType<typeof BADGE>[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: Request) => {
      const path = new URL(input.url).pathname
      const body =
        path === '/api/badges'
          ? { items: badges }
          : { error: 'That endpoint does not exist.', errors: null }
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status: path === '/api/badges' ? 200 : 404,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    }),
  )
}

function renderWall(size?: number) {
  const store = makeStore()
  store.dispatch(signedIn({ token: 'jwt', user: { id: 7, name: 'Alex' } }))
  return render(
    <Provider store={store}>
      <BadgeWall size={size} />
    </Provider>,
  )
}

/** All twelve, mixed states — the full wall the backend will eventually serve. */
const ALL_TWELVE = Array.from({ length: 12 }, (_, i) => BADGE(i + 1, i % 2 === 0))

/** What the backend actually seeds today. */
const SEEDED_SIX = Array.from({ length: 6 }, (_, i) => BADGE(i + 1, i < 3))

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('the geometry, against §7’s worked table', () => {
  const geometry = badgeWallGeometry(130)

  it('matches the verified S=130 layout within a pixel', () => {
    // Row 0 (2 cells): lefts 103.4, 206.6; row 1 (3 cells): 51.8, 155, 258.2; row 2 starts at 0.2.
    expect(Math.abs(geometry.cellAt(0, 0).left - 103.4)).toBeLessThan(1)
    expect(Math.abs(geometry.cellAt(1, 0).left - 51.8)).toBeLessThan(1)
    expect(Math.abs(geometry.cellAt(2, 0).left - 0.2)).toBeLessThan(1)
    // Tops: 0, 89.4, 178.8, 268.2.
    expect(geometry.cellAt(0, 0).top).toBe(0)
    expect(Math.abs(geometry.cellAt(1, 1).top - 89.4)).toBeLessThan(1)
    expect(Math.abs(geometry.cellAt(3, 1).top - 268.2)).toBeLessThan(1)
    // Container ~440 wide.
    expect(Math.abs(geometry.width - 440)).toBeLessThan(1)
  })

  /** The size is a parameter, not a constant — §7 says formula, not the pixel table. */
  it('scales with the cell size', () => {
    const doubled = badgeWallGeometry(260)
    expect(doubled.cellAt(1, 1).left).toBeCloseTo(geometry.cellAt(1, 1).left * 2, 5)
    expect(doubled.width).toBeCloseTo(geometry.width * 2, 5)
  })
})

describe('the collector sits bottom-centre', () => {
  /**
   * Asserted by **position**, not markup order: the reward for filling the wall is the middle of
   * the bottom row, and a reordering that kept the DOM sequence would still break the layout.
   * Cells are buttons since [76a] — the wall opens badges, it no longer just shows them.
   */
  it('renders badge 12 at the bottom row’s middle cell', async () => {
    stub(ALL_TWELVE)
    renderWall()

    const collector = await screen.findByRole('button', { name: /badge 12/i })
    const geometry = badgeWallGeometry(130)
    const expected = geometry.cellAt(3, 1)

    expect(collector.style.left).toBe(`${expected.left}px`)
    expect(collector.style.top).toBe(`${expected.top}px`)
  })

  it('flanks it with 10 and 11', async () => {
    stub(ALL_TWELVE)
    renderWall()

    const ten = await screen.findByRole('button', { name: /badge 10/i })
    const eleven = await screen.findByRole('button', { name: /badge 11/i })
    const geometry = badgeWallGeometry(130)

    expect(ten.style.left).toBe(`${geometry.cellAt(3, 0).left}px`)
    expect(eleven.style.left).toBe(`${geometry.cellAt(3, 2).left}px`)
  })
})

describe('locked and unlocked', () => {
  it('puts the state in the accessible name, both directions', async () => {
    stub(SEEDED_SIX)
    renderWall()

    // SEEDED_SIX: 1–3 unlocked, 4–6 locked.
    expect(await screen.findByRole('button', { name: 'Badge 1, unlocked' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Badge 4, locked' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Badge 1, locked' })).not.toBeInTheDocument()
  })

  it('desaturates and chips only the locked cells', async () => {
    stub(SEEDED_SIX)
    renderWall()

    const locked = await screen.findByRole('button', { name: 'Badge 4, locked' })
    const unlockedCell = screen.getByRole('button', { name: 'Badge 1, unlocked' })

    expect(locked.querySelector('svg')?.style.filter).toContain('grayscale')
    // The chip is the second svg in a locked cell; an unlocked cell has exactly one.
    expect(locked.querySelectorAll('svg')).toHaveLength(2)
    expect(unlockedCell.querySelectorAll('svg')).toHaveLength(1)
  })

  it('centres the lock chip — [76b]: a corner chip overlapped the neighbouring hexes', async () => {
    stub(SEEDED_SIX)
    renderWall()

    const locked = await screen.findByRole('button', { name: 'Badge 4, locked' })
    const chip = locked.querySelectorAll('svg')[1] as SVGElement
    // width 0.34 × 130, centred: left = top = (1 − 0.34) / 2 × 130.
    expect(parseFloat(chip.style.width)).toBeCloseTo(130 * 0.34, 5)
    expect(parseFloat(chip.style.left)).toBeCloseTo(130 * 0.33, 5)
    expect(parseFloat(chip.style.top)).toBeCloseTo(130 * 0.33, 5)
  })
})

describe('the six unseeded cells', () => {
  it('renders them dark and labelled, but silent — not phantom badges', async () => {
    stub(SEEDED_SIX)
    const { container } = renderWall()

    await screen.findByRole('button', { name: 'Badge 1, unlocked' })
    // Six named badge buttons…
    expect(screen.getAllByRole('button')).toHaveLength(6)
    // …six aria-hidden placeholder *cells* — div, not svg, or this would also count the three
    // lock chips on the locked badges and pass at 9 for the wrong reason…
    const hidden = container.querySelectorAll('div[aria-hidden="true"].absolute')
    expect(hidden).toHaveLength(6)
    // …each carrying [76a]'s "More coming" label, with one audible count sentence for the lot.
    expect(screen.getAllByText(/more\s*coming/i)).toHaveLength(6)
    expect(screen.getByText('6 more badges coming soon.')).toHaveClass('sr-only')
  })

  it('fills them in with no code change once the backend seeds all twelve', async () => {
    stub(ALL_TWELVE)
    renderWall()

    // Exact name: /badge 1/i also matches Badge 10–12, and findByRole throws on multiples.
    await screen.findByRole('button', { name: 'Badge 1, unlocked' })
    expect(screen.getAllByRole('button')).toHaveLength(12)
    expect(screen.queryByText(/more\s*coming/i)).not.toBeInTheDocument()
  })
})

describe('the overlay — [76a], unlocked badges only since [76b]', () => {
  it('opens on click with the name, state word and criteria', async () => {
    stub(SEEDED_SIX)
    renderWall()

    fireEvent.click(await screen.findByRole('button', { name: 'Badge 1, unlocked' }))

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAccessibleName('Badge 1')
    expect(dialog).toHaveTextContent('Unlocked')
    expect(dialog).toHaveTextContent('Criteria for Badge 1')
  })

  it('shows when an unlocked badge was earned — the line the shelf used to carry', async () => {
    stub(SEEDED_SIX)
    renderWall()

    fireEvent.click(await screen.findByRole('button', { name: 'Badge 1, unlocked' }))

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('Unlocked')
    expect(dialog).toHaveTextContent(/earned/i)
    // The criteria still render — the overlay is the only place they appear now.
    expect(dialog).toHaveTextContent('Criteria for Badge 1')
  })

  it('closes on any click, returning focus to the cell that opened it', async () => {
    stub(SEEDED_SIX)
    renderWall()

    const cell = await screen.findByRole('button', { name: 'Badge 2, unlocked' })
    fireEvent.click(cell)
    // A click on the card itself must close too ("clicking again returns to the original state")
    // — nothing stops propagation.
    fireEvent.click(screen.getByRole('dialog').firstElementChild!)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(cell).toHaveFocus()
  })

  it('closes on Escape', async () => {
    stub(SEEDED_SIX)
    renderWall()

    fireEvent.click(await screen.findByRole('button', { name: 'Badge 3, unlocked' }))
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

})

describe('the locked tip — [76b]', () => {
  it('a locked badge tips its criteria instead of opening the overlay', async () => {
    stub(SEEDED_SIX)
    renderWall()

    fireEvent.click(await screen.findByRole('button', { name: 'Badge 4, locked' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const tip = screen.getByRole('status')
    expect(tip).toHaveTextContent('Badge 4')
    expect(tip).toHaveTextContent('Criteria for Badge 4')
  })

  it('replaces the tip when another locked badge is clicked, and dismisses on ×', async () => {
    stub(SEEDED_SIX)
    renderWall()

    fireEvent.click(await screen.findByRole('button', { name: 'Badge 4, locked' }))
    fireEvent.click(screen.getByRole('button', { name: 'Badge 5, locked' }))

    const tip = screen.getByRole('status')
    expect(tip).toHaveTextContent('Criteria for Badge 5')
    expect(tip).not.toHaveTextContent('Criteria for Badge 4')

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('clears the tip when an unlocked badge opens the overlay', async () => {
    stub(SEEDED_SIX)
    renderWall()

    fireEvent.click(await screen.findByRole('button', { name: 'Badge 4, locked' }))
    fireEvent.click(screen.getByRole('button', { name: 'Badge 1, unlocked' }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('claims a dialog popup only on the unlocked cells', async () => {
    stub(SEEDED_SIX)
    renderWall()

    const unlocked = await screen.findByRole('button', { name: 'Badge 1, unlocked' })
    const locked = screen.getByRole('button', { name: 'Badge 4, locked' })
    expect(unlocked).toHaveAttribute('aria-haspopup', 'dialog')
    expect(locked).not.toHaveAttribute('aria-haspopup')
  })
})
