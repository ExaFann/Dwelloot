## Task

**Not a `task_decomposition.md` task.** An owner-directed visual-language experiment on branch `ui-exp01`,
off `dev` at `9dc5f3e`. Areas raised after reviewing the running app (2026-08-05), then two further
rounds of feedback on the result.

Numbered here as `ui-exp01` rather than given a task number, because every task number is referenced
by the chat logs and by code comments.

## Spec — round 1

### 1. Only pressable things look pressable

**The complaint:** in dark mode the 5px offset shadow is `#F0EBFF`, so every card carries a thick
white edge and the screen is a field of them.

Every `shadow-hard-*` on a container goes — 20 usages across 14 files. A 2px `border-ink` remains on
cards, and in dark that is still a light line; that is the flat-fill outline the whole style rests on
rather than a raised edge, so it stays. If the screen still reads as too bright afterwards, **the next
lever is the card border colour in dark**, not the shadow.

### 2. The press physics are backwards

Hover contracts the shadow and pushes the element down — the look of a button already held — while a
real click only changes colour. The strongest physical signal fires for the weakest input. Reversed:

| State  | Shadow | Transform | Reads as                        |
| ------ | ------ | --------- | ------------------------------- |
| rest   | 4px    | none      | sitting on the page             |
| hover  | 5px    | −1px      | lifted, ready to take           |
| active | none   | +4px      | pushed flat into its own shadow |

Releasing overshoots (`cubic-bezier(0.34, 1.4, 0.64, 1)`) so it rebounds rather than gliding back, and
the press is faster than the release, which is how a real key feels.

### 3. No more rounded corners

`--geometry-radius: 8px → 0px` squares every `rounded-base` in the app — cards, inputs, selects,
chips, nav links — **from one token**. The four hardcoded radii the token cannot reach are squared by
hand: two selection boxes and two status dots (`rounded-full`, now square).

### 4. Marks for Points, Coins, streak and badges

New `components/ui/marks.tsx`. **Drawn rather than imported**: `lucide` is a _line_ set with rounded
caps, and a rounded outline glyph beside a square yellow chip is two design languages in one card.

All 24×24, flat fills, `currentColor`, **no curves** — a coin is an octagon, which still reads as a
coin while keeping the geometry the rest of the app now uses.

**Six badges, six distinct motifs**, keyed by the id `GET /api/badges` returns — a presentation-only
lookup that never decides what a badge _means_, which stays with the server's `name` and `criteria`
(log `027`'s obligation). A seventh seeded badge gets a generic medallion without this file changing.
Locked badges show the motif desaturated at 40% with a padlock, so you can see what you are working
towards.

### 5. Head-to-head: two real bugs

**The avatars misalign** because the two sides are flex columns aligned on their _bottoms_, so
whoever has logged fewer chores gets a shorter column and sits lower. Alignment is a side effect of
content height — the one thing that differs between two people. Becomes a two-row grid: both headers
in row 1, both lists in row 2, aligned by construction.

**Only four chores exist to scroll.** `RecentChoresColumn` is a `max-h-28 overflow-y-auto` box, so it
_looks_ scrollable — but the requests ask for `take: 4`. The ceiling is in the request, not the
styling. Fetch 12; four fit, the rest scroll.

### 6. The tug bar — the rule behind it, not the drawing

Position is **share of total**, so _one chore to nil is 100% of the points scored_: the marker slams
to the far end and announces a rout over a single 5-point chore, while by evening the same 5-point gap
barely moves it. **Most dramatic when least has happened.**

Position now comes from the **lead**, against a scale that starts at 30 and grows with the real
scores: 0–0 → 50%, 5–0 → 58%, 15–0 → 73%, 60–10 → 83% capped short of the end. `MAX_LEAN` keeps it
off both ends, because a rope pulled out of frame stops reading as a contest.

The bar becomes a rope with a square **grip** at the contested point, sliding with a 500ms
transition. **Yellow, not the red flag** a tug-of-war would really have: red is the destructive
colour here (reject, leave), so a red marker would be the one alarming thing on a screen about chores.

**Not built:** the "leader's colour floods the app background" idea. It is the most striking of the
three offered and the most expensive to get right — it fights the contrast work in `design-tokens.md`
§3, and a background that changes every time someone logs a chore is a lot of motion on every screen,
not just this card. Worth doing deliberately, not as a side effect of this pass.

### 7. Quick log — three per row

At 390px it is two tiles per row with a ragged right margin. With real numbers — tiles of
147 / 62 / 142 / 86 px in a 322px list — the cause is one long title plus one short one filling a row
and leaving ~107px dead. Smaller type never fixes that; **capping the tile width** does. A long title
wraps to two lines instead of taking the whole row, which also makes the wall look more hand-stacked,
because the bricks differ in height as well as width.

**Not built:** the horizontal-swipe alternative. Wrapping keeps every chore visible; a swipe strip
hides most of them behind a gesture.

### 8. Selection shows a tick

The filled inner square is the same failure one level down: a block of colour inside a box that has
_also_ changed colour reads as decoration. Both multi-select surfaces — the Log tab and the approval
queue — draw a checkmark.

## Spec — round 2 (owner feedback on the above)

**R2.1 Buttons keep their corners; surfaces stay square.** Squaring _everything_ makes a button read
as a small card with a shadow under it rather than a key standing off the page — the shadow ends up
doing all the work of saying "this lifts". Split into two tokens: `--geometry-radius: 0` for surfaces,
**`--geometry-radius-control: 8px`** for anything you press, exposed as `rounded-control`. Applied to
`Button` and to every pressable tile, chip and row; **the bottom nav deliberately stays square**,
since its tabs are navigation rather than buttons.

**R2.2 The tug bolt loses its box.** Boxing the bolt gives the `spark` animation a bordered chip to
scale and rotate, so the eye tracks the box and the bolt reads as its contents. A bare yellow bolt
with a black stroke, same animation.

**R2.3 Quick log — the fix was on the wrong element, twice.** Still two per row at desktop, because
Quick log lives in the dashboard's **2/5 column — 332px wide at a 1280px viewport**. A `sm:`
breakpoint keys off the _viewport_, so it was making tiles _bigger_ exactly where the container was
narrow: **a viewport breakpoint can never answer "how much room does this card have"**. Then `grow`
did nothing, because it was on the `<button>` while the flex child is the `<li>`. Fixed with
`grow basis-[5.5rem]` on the `li` and `w-full` on the button, so tiles bid for a small minimum and
share whatever is left of the row.

**R2.4 A softer palette, and a fifth hue.** The first palette was picked for punch and reads as
alarming on real screens. Every hue steps back from the edge while keeping its identity; purple and
green still lead. `--brand-flame` is new. **The three profile stats all gain a fill**, and the hues
avoid a traffic light: green is the _opponent's_ colour and red is destructive, so yellow/green/red
would say "good, neutral, something is wrong" about three things that are all simply yours. Coins keep
yellow (loot), Points take purple, the streak takes flame — a streak _is_ a fire, and orange borrows
no other meaning.

**R2.5 Deferred: multi-colour badges.** Owner's decision — not now. Each badge should be several
colours rather than one flat purple block that switches on unlock, so the six read as six distinct
objects rather than one shape in two states. What that needs, so the next attempt starts in the right
place: the motifs are **single-path, `currentColor`** drawings, so multi-colour means splitting each
into layered paths with their own fills — a different drawing job, not a colour swap. Those fills
would come from outside the semantic palette (yellow means Coins, green means opponent, red means
destructive), so the likely answer is a **separate decorative ramp** declared as tokens and held to
the same contrast bar. Locked state would then be a greyscale filter over the same artwork.

## Spec — round 3 (the reference guide, and a third hue)

Source: _Neobrutalism UI (How to)_ — Sepideh Yazdi, Dribbble (owner-supplied PDF, 65 pages).

**Where we already agree:** pitch black used for strokes and shadows; backgrounds vibrant _or_ muted
rather than white/grey; **no gradients**; shadows with both X and Y and **no blur**; raw shapes
defined by strokes. Sans-serif with large headings and deliberate line-height is only partly met.

**Two places the guide contradicts decisions already taken. Neither is changed — both are recorded,
because both were deliberate calls made for reasons the guide does not address.**

1. **"Cards have strokes and black shadows."** Round 1 stripped shadows off every card, which is what
   fixed the dark-mode complaint. The guide would instead say the _shadow colour_ was the error: ours
   inverts to `#F0EBFF` in dark, and a near-white 5px offset under every card is what produced the
   「大量很粗的白边」. So there is a second possible fix — keep shadows on cards but keep them **black
   in dark mode**. The cost is that a black shadow on `#171226` is nearly invisible, which is why [39]
   inverted it in the first place. The guide is written for light-mode posters and does not answer
   what a dark theme should do.
2. **"Raw, unrefined shapes like circles, rectangles, stars, and polygons."** Circles are explicitly
   _in_ the style. Round 1 squared the status dots and the tug marker on the "no rounded corners"
   instruction — but that instruction was about **rounded corners on containers and controls**, which
   is a different thing from a circle used as a shape. Round 2 already restored corners to buttons on
   the same reasoning. Not assumed either way.
3. **Typography is the least-explored rule** and the largest remaining gap against the reference.

**R3.3 Yellow brighter, orange deeper, and Points gets its own hue.** Points were purple, and purple
already means _you_ — on the head-to-head card it is the colour of a _person_, so using it for a stat
made one token carry two unrelated jobs, which is why that tile never looked like it belonged with the
other two. Points take **blue**: the one cool accent in the set, and the only hue far enough from
yellow and orange to keep the three stats apart. The three stat fills now separate on **two** axes at
once — luminance _and_ hue — rather than relying on either alone.

| Token             | Light     | Dark      | Meaning                            |
| ----------------- | --------- | --------- | ---------------------------------- |
| `--brand-primary` | `#7C4DFF` | `#A87BFF` | **you** — a person, not a currency |
| `--brand-success` | `#3DDC97` | `#57E6B0` | your opponent                      |
| `--brand-warning` | `#FFE14A` | `#FFEA6B` | Coins, loot, pending               |
| `--brand-danger`  | `#FF7A70` | `#FF9A90` | destructive                        |
| `--brand-flame`   | `#FF8A3D` | `#FFA85C` | **streaks only**                   |
| `--brand-points`  | `#4CC9F0` | `#6FD6F7` | **Points only**                    |

## Test requirement

Almost everything here is appearance, and **appearance is what assertions cannot see** — so the tests
pin the _rules_, and the log has to say plainly which claims are measurements rather than looks.

1. **`tokens.test.ts` parses `theme.css` itself**, not a TypeScript copy of the palette — a mirror
   would be the thing under test. Every new and changed value is checked for **AA against its own
   foreground and a ≥3:1 black border, in both schemes**. `--brand-flame` and `--brand-points` join
   `FILL_PAIRS` so the new hues are held to the same bar as the old ones, and the parse canary is
   updated to the new primary.
2. **No Tailwind namespace name is reused for a raw token.** `--radius-base: var(--radius-base)` is
   self-referential and silently resolves to nothing; raw values use `--geometry-*`, `--brand-*`,
   `--ink-*`, `--surface-*`. A test pins the rule, not the instance.
3. **The tug position tests must be rewritten, not extended.** The three existing tests pin
   share-of-total numbers, so they will keep passing against the new rule for the wrong reason. Add a
   direct assertion that **an early one-sided score can never pin the marker to the end** — that is
   the defect, and share-of-total numbers cannot express it.
4. **`RecentChoresColumn` fetches 12, not 4** — asserted on the request, because the styling already
   claimed to scroll while the request was the ceiling. This is a query-parameter assertion, not a
   DOM one.
5. **Six badges resolve to six distinct motifs**, and the lookup is keyed by id with a generic
   fallback for an unknown one — so a seventh seeded badge cannot crash the shelf. Locked badges carry
   the padlock.
6. **The rendered page is measured** for what the tokens claim: after the shadow sweep, every element
   still carrying a shadow is interactive (`button`, `a`, `input`, `select`) and **no** non-interactive
   element has one; `border-radius` is `0px` on a card and `8px` on a button **on the same screen**;
   both avatars report the same top with 9 chores against 1; and the quick-log wall reports its row
   counts via **`offsetTop`, never `getBoundingClientRect().top`** — the tiles carry a `rotate`, and
   rotation moves the bounding box, which is how the first measurement reported one tile per row when
   it was two.
7. **Row counts are measured at both ends** — 390px full width _and_ 1280px in the dashboard's side
   column — because the container width, not the viewport, is what the layout actually depends on.

Then a browser pass, which is the only instrument that can answer whether any of this is _attractive_.
Where the pane refuses to composite, say so plainly rather than implying the UI was seen.
