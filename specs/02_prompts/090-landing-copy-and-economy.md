## Task

Copy and terminology on the landing page, plus one label in the household card, plus the economy
band becoming a three-step row.

## Decisions

**1. "Start a duel" is a button, not a rename.** The CTA's words change in two places; `to="/register"`
does not, and the noun *household* stays everywhere else — including the footer CTA's own sentence
("One of you makes the household, the other joins with a code"), which sits directly beneath the
changed button. That is deliberate rather than an oversight: the button names the *thing you are
about to do*, the sentence names the *thing you create*. No entity, route, type or identifier is
touched. `Household`, `/register`, `householdApi`, `HouseholdMember` all stay exactly as they are.

**2. "Head-to-head" is not in scope and is not touched.**

**3. The economy band becomes three steps, because two cards side by side quietly said the wrong
thing.** Points and Coins as a 2-up grid reads as *two halves of one currency* — the layout implies
they convert. They do not: Points are never spendable and Coins only ever come out of a box you won.
The middle step is what makes that true on the page, so it gets drawn rather than explained:

```
[ Points card ]  →  [ chest · Win the day ]  →  [ Coins card ]
```

**4. The arrows are a drawn shape, and a new one.** The brief rules out lucide and text arrows.
`icons.tsx` has no chevron or arrow to reuse — the nearest things are a chevron *inside* a badge
motif and the tug bolt, neither of which is a separate export. So `ArrowIcon` is added, in the file's
UI-glyph convention: one path, `currentColor`, no stroke, no curves. It is not in `icons-source.svg`,
which makes it an owner-directed shape exempt from the fidelity test by construction — the same
standing as `BoltIcon`, and noted in place for the same reason.

**One shape, rotated.** The phone layout stacks, so the arrows must point down; a second downward
path would be two drawings of one idea, and the thing that then drifts is the one nobody looks at.
`rotate-90` on the stacked layout, upright from the breakpoint.

**5. The middle step is not a card.** It carries the chest and two words. Making it a third card
would say "here are three things"; it is one thing that happens *between* two things, and the arrows
only read as flow if what they connect and what they pass through look different.

**6. The breakpoint for the row is measured, not guessed** — the same method as [89]. Five columns
of two text cards plus a chest cannot fit at `sm`; the question is whether `md` or `lg` is the first
width where the card text is not squeezed. Measured, then chosen.

**7. "You two", and only the label.** `HouseholdSettings` renders an uppercase `Members` above the
two people. `HouseholdMember`, `data.members` and every other identifier stay. **Nothing pinned this
string** — no test queries it — so a test is added rather than the change being made silently;
`MePage` and `PairingPage` were checked and use the word nowhere user-facing.

## The copy changes, exactly

| where | from | to |
|---|---|---|
| hero + footer CTA | Start a household | **Start a duel** |
| loop step 2 | …when the other of you signs off. | …when **your partner** signs off. |
| loop step 3 | Most Points when the day ends takes a loot box. | **Whoever has more Points** when the day ends takes **the box**. |
| loop step 4 | …rewards you two invented. | …rewards you two **made up**. |
| problem band | Every **flat** has the same three arguments. | Every **home** has… |
| approval band | Points in the **bank**. | Points on the **board**. |
| economy, Points card | Do chores, earn Points. **Most Points** when the day ends wins. | …**Whoever has more** when the day ends wins. |
| household card | Members | **You two** |

Everything else is left alone, including "one box in ten hides a bonus reward" and both economy card
texts beyond the one line named above.

## Test requirement

`LandingPage.test.tsx` asserts the CTA text and link count; it is **updated, not deleted**.

1. Both CTAs read "Start a duel" and both still point at `/register` — the words changing while the
   destination silently follows is the failure worth pinning.
2. The word *household* is still on the page, in the footer CTA's sentence. A blanket find-and-replace
   is the obvious way to do this task wrong, and nothing else would catch it.
3. Each of the six rewritten sentences is present, and its predecessor is **absent**. Present-only
   assertions would pass against the current page for two of them, since the changes are partial
   rewrites of a sentence that still contains the old words.
4. The economy band renders Points, the middle step and Coins **in that document order**, with two
   arrows between them — order is the whole point of the change, so order is what is asserted.
5. The arrow is an SVG from `icons.tsx`, not text: assert no literal arrow characters anywhere in the
   band.
6. `HouseholdSettings` shows "You two" and not "Members".
