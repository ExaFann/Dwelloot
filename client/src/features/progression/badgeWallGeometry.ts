/**
 * The honeycomb's arithmetic — split from `BadgeWall.tsx` because a file exporting both a component
 * and functions breaks fast refresh (the same rule that split `storeChangeCopy` and
 * `avatarPresetKeys`), and because the geometry deserves direct tests.
 *
 * §7's formula. Adjacent cells *overlap*: each square SVG cell is `S` wide but the hexagon inside
 * spans only `38.1/48` of it, so stepping by `hexW` is what makes hexagon edges touch.
 */

const ROWS = [2, 3, 4, 3] as const
const MAX_ROW = Math.max(...ROWS)

/**
 * Which badge id sits in which cell — **not** reading order. Collector (id 12) is bottom-centre:
 * it is the badge for filling the wall, and the position is part of the reward (§7). Ids 10 and 11
 * flank it.
 */
export const CELL_ORDER = [
  [1, 2],
  [3, 4, 5],
  [6, 7, 8, 9],
  [10, 12, 11],
] as const

export function badgeWallGeometry(size: number) {
  const hexW = (size * 38.1) / 48
  const hexH = (size * 44) / 48
  const xstep = hexW
  const ystep = hexH * 0.75
  return {
    xstep,
    ystep,
    width: (MAX_ROW - 1) * xstep + size,
    height: (ROWS.length - 1) * ystep + size,
    cellAt: (row: number, col: number) => ({
      left: ((MAX_ROW - ROWS[row]) / 2) * xstep + col * xstep,
      top: row * ystep,
    }),
  }
}
