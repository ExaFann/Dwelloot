## Task

A full-colour `RewardMark` in `icons.tsx`, from the owner's SVG, path data verbatim. The existing
single-colour `RewardIcon` **stays**. `RewardMark` replaces `RewardIcon` on the landing page's
"Rewards you invent" card, and nowhere else.

## Decisions

**1. The two coexist, and that is the point rather than an oversight.** `RewardIcon` is one path on
`currentColor` with no stroke — which is what a button and a nav item need, because there the glyph
has to take the colour of the thing it sits in. A seven-shape literal-colour drawing cannot do that:
put it in a nav and it stays purple-and-yellow through every state. So the mono glyph keeps every
call site it has, and the mark gets exactly one. Same arrangement as `ChestMark` and the mono
loot-box icon.

**2. The colour mechanism is the badges', not the marks'.** `icons.tsx` has two, and they answer
different questions:

- **Marks** (Points, Coins, streak) carry `var(--mark-*)` fills and a `var(--ink-surface)` stroke,
  because they sit on many surfaces in both schemes and have to survive all of them.
- **Badges** carry literal colours and a literal `#000` stroke, because they only ever sit on cards.

This is a badge-shaped problem — one card, one context — so it takes the badges' mechanism: literal
fills exactly as supplied, and the common stroke hoisted into a wrapping `<g>`, which is what
`Badge` already does. **No third mechanism is introduced**, per the brief.

**3. Draw order is load-bearing and is the owner's.** Bow, then the four body wedges, then the lid
**last**. The lid is a full-width rectangle across the middle; drawn first, the wedges would sit on
top of it and the parcel would read as a diamond with a stripe behind it rather than a box with a
lid in front.

**4. The four wedge colours mean nothing, and the file has to say so.** Everywhere else in this
codebase a fill is a claim — yellow is Coins, blue is Points, purple is you, green is your partner.
Four different hues inside one small drawing is decorative faceting, and without a note the next
person to read it will look for the currency each facet stands for and find a rule that is not
there.

**5. Not in `icons-source.svg`, so exempt from the fidelity test by construction** — the same
standing as `BoltIcon`, `BurstIcon` and [90]'s `ArrowIcon`, recorded in place rather than left as a
silent gap in `icons.test.tsx`'s coverage.

## Test requirement

The sprite cannot pin this one, so the test has to do it directly.

1. `RewardMark` renders **seven** shapes — six paths and a rect — in the supplied order, with the
   supplied fills. Order is asserted, not just membership, because the lid being last is the
   decision.
2. The stroke is the supplied one, and it is on the group rather than repeated per shape.
3. **`RewardIcon` still exists, still has exactly one path, and still carries no `fill` of its own**
   so it inherits `currentColor`. The failure this guards against is someone "tidying up" by
   deleting the mono glyph now that a prettier one exists — which would repaint its two loot-reveal
   call sites, one of which is `size-4.5` where the mark's facets are mud.
4. The landing page's rewards card renders `RewardMark`, and `RewardIcon` appears nowhere else on
   that page.
