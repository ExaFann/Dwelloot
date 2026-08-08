## Task

[76] `BadgeWall` — the twelve badge motifs from [75] arranged as a honeycomb, rows of 2/3/4/3, with
the collector rosette bottom-centre.

## Decisions

**1. The geometry is formula-driven, with the cell size as a parameter.** Hard-coded coordinates for
twelve hexagons is twelve chances to be one pixel out, and it cannot be re-tuned. The row pattern and
the cell size go in, the positions come out, and the layout module is pure and testable without
rendering anything.

**2. A locked badge is desaturated, with a corner chip, and the state is in the accessible name.**
Colour alone is not a status. A screen reader has to hear "locked", and it must come from the same
source of truth the visual uses, not from a second hand-written string.

**3. The chip's stroke is `--ink-surface`** — black in light, `#F0EBFF` in dark. It sits on a surface,
so it takes the surface's ink. This was measured rather than chosen: the accent ink is `#000000` in
both schemes, which is invisible on the dark chip.

**4. Six unseeded cells render as `aria-hidden` frames.** Six of the twelve motifs exist with no
server row behind them yet. An empty frame says *there is more here* without inventing a name the
server could later contradict, and it keeps the honeycomb's geometry intact — which is the thing that
collapses if the grid is simply shorter. Badges 7–12 fill in with **no frontend change** once seeded.

**5. The wall is `md` and above, with the existing shelf below it.** Superseded within this thread —
see `ui-exp02-design-review-rounds.md` round B, where the honeycomb becomes the badge surface at
every width, because two implementations of "here are your badges" is two things to keep in step and
the narrow one was the one nobody was looking at.

## Test requirement

1. The geometry module: given the row pattern and a cell size, the positions are what is expected —
   tested as a pure function, with no DOM.
2. Changing the cell size moves every cell. A test that only checks one position at one size passes
   against a hard-coded layout.
3. A locked badge's accessible name contains its state; an unlocked one's does not.
4. Unseeded cells are `aria-hidden` and are not announced or focusable.
5. Twelve seeded badges render twelve live cells and no frames — i.e. the placeholder path is driven
   by the data, not by a constant.
