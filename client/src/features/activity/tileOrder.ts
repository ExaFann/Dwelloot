/**
 * The order tiles are laid out in, so they actually form a wall.
 *
 * Alphabetical order pairs long titles with long titles — "Change the bed sheets" next to "Clean the
 * kitchen bench" — and at 375px two long tiles do not fit on one row, so every tile gets a row to
 * itself and the result is the list it was supposed to replace. Measured: 12 tiles produced 11 rows.
 *
 * Interleaving longest with shortest gives each row one wide brick and one narrow one, which both
 * fills the row and produces the uneven, stacked look. It is also **deterministic** — the same
 * catalogue always lays out the same way, so tiles never jump between renders.
 *
 * Title length is a proxy for rendered width. It is not exact — proportional type makes "Mow the
 * lawn" narrower than "Wash dishes" would suggest — but it does not need to be: the goal is variety
 * per row, not a perfect fit, and flex-wrap handles the remainder.
 */
export function interleaveBySize<T>(items: readonly T[], sizeOf: (item: T) => number): T[] {
  const sorted = [...items].sort((a, b) => sizeOf(b) - sizeOf(a))

  const packed: T[] = []
  let long = 0
  let short = sorted.length - 1

  while (long <= short) {
    packed.push(sorted[long])
    long += 1
    // The `!==` guard stops the middle item being emitted twice on an odd-length list.
    if (long <= short) {
      packed.push(sorted[short])
      short -= 1
    }
  }

  return packed
}
