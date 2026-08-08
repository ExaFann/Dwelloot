## Task

**Not a `task-decomposition.md` task.** The second design-review thread on `ui-exp01`, running from
the brand-icon work to the end of the build. Where
[`ui-exp01-visual-language.md`](ui-exp01-visual-language.md) established the visual language, this is
what happened when the owner reviewed it **in the running application, in both colour schemes, at
more than one width** — repeatedly.

Numbered `ui-exp02` rather than given a task number: every task number is referenced by code
comments, and these rounds cut across many tasks at once.

**Read this one for the method as much as the outcomes.** Nine of these rounds are corrections to
work delivered earlier in the same thread, and two are corrections to corrections. That is not a
failure mode — it is how this UI got good — but it means the standing instruction for anything visual
is: **expect the first answer to be wrong about something, and verify in the browser before calling
it done.** The tests cannot see any of this.

---

## Round A — the currency marks

The three currency marks (Points, Coins, streak flame) are flat fills with no outline, and against a
mid-tone surface they lose their edges.

**A.1 The marks gain an outline.** This reverses the icon spec's "no stroke" decision, taken after
comparing both treatments in the running app rather than on paper.

**A.2 The outline is `--ink-surface`, not black.** A black outline is correct in light mode and
disappears in dark, where the surface is nearly as dark as the stroke. Ink-that-inverts is the token
that already exists for exactly this: black on light, `#F0EBFF` on dark.

**A.3 The marks get their own token family: `--mark-points`, `--mark-coins`, `--mark-flame`,
`--mark-bolt`.** They cannot borrow the semantic brand tokens, because the semantic palette answers a
different question — *what does this colour mean* — and the marks need *what does this shape need to
stay legible*.

**Their dark values are deepened, not lightened.** This is the counter-intuitive part and the reason
the family exists. Every other token in the system lightens for dark mode. An outlined mark does not:
the outline is now the light element, so lightening the fill collapses the contrast between fill and
stroke and the mark turns into a blob. Deepening the fill preserves the shape.

**A.4 The bolt is re-cut.** Adding a stroke to the tug bar's divider bevelled its points off — a
mitre limit, not a path error, so the source path was correct and the rendering was not. Re-cut with
angles inside the limit so it is sharp again at every size.

**A.5 Currency values lose their coloured chips.** A number in a coloured pill inside a card that is
also coloured is two backgrounds arguing. The mark already names the currency; the chip was saying it
a second time, louder.

> **The rule this round produced.** *A token family exists when a group of colours answers a question
> the semantic palette does not.* Any new family joins the scheme-completeness scanner by prefix, so
> a value defined in one scheme and forgotten in the other fails the suite rather than shipping.

---

## Round B — the badge wall

**B.1 The honeycomb is the badge surface at every width**, not a desktop-only flourish with a
different component below it. Two implementations of "here are your badges" is two things to keep in
step, and the narrow one was the one nobody looked at.

**B.2 A locked badge shows its criteria, not a celebration.** Tapping a badge you have not earned was
showing the unlock message in a muted colour — the right words for the wrong moment. A locked badge
answers *how do I get this*; an unlocked one celebrates.

**B.3 The lock chip moves to the centre and its padlock goes grey.** In the corner it read as a
notification badge — something new, something to act on — which is the opposite of what it means.

**B.4 Unseeded slots render as empty frames, `aria-hidden`.** Six of the twelve badge motifs exist
with no server row yet. An empty frame says *there is more here* honestly; hiding them would make the
honeycomb geometry collapse, and inventing placeholder names would be a lie the server could later
contradict.

**Not built:** a "coming soon" label on the empty slots. It would need copy the server does not have,
and the frame already carries the meaning.

---

## Round C — motion

A survey first, then implementation — because "add some animation" is not a decision, it is a budget.

**C.1 Six one-shot animations, no library.** Value pulses on change, rows animate in, the nav badge
bumps, routes fade, the lead change flips, badges celebrate. All CSS keyframes in `theme.css`, all
driven by a small hook that returns true briefly after a watched value changes.

**No animation library.** The zero-dependency, zero-vulnerability property is worth more here than
any easing curve. Every one of these is a keyframe and a class.

**C.2 Every animation has a `prefers-reduced-motion` answer, and reduced motion is handled by hiding
the stage — never by leaving something mid-transform.** The loot sequence's stages overlap in grid
cells, so `display: none` on the chest strands nothing. A transform frozen at 50% is a bug that looks
like a design.

**C.3 The loot reveal becomes a centre-screen dialog with a real chest.** It was a panel on the
dashboard, which made the one genuinely celebratory moment in the app compete with the scoreboard.
The chest rattles, its lid swings, coins fountain out, and the prize lands. A bonus reward adds
full-screen confetti, because it is the rare outcome and should feel like one.

**The chest is a drawn chest, not the app's logo** — owner's call, and correct. The logo is the
brand's mark; a chest is the object being opened. Reusing the logo would have been cheaper and would
have made the moment generic.

**C.4 The badge celebration lives in the app shell, not on the badge wall.** A badge unlocks when
your **partner approves your chore** — a moment you can be on any tab. Watching for it from the badge
wall means it only fires on the one screen you are least likely to be on. The stated cost, taken
knowingly: every signed-in screen now polls the badge endpoint.

---

## Round D — boldness, and the duplication it exposed

**D.1 Bigger type, heavier weights, thicker borders on the two hero cards.** The reference this
project designs against is a Neobrutalist one and the build had drifted polite. Typography remains
the largest untouched gap.

**D.2 Scrollbars.** Restyling `::-webkit-scrollbar` was tried and **the platform ignored everything
but the colour** — the owner reported it as not working and was right. The rules are deleted. Inner
scrollers hide the bar entirely and carry the signal with an edge fade and dot indicators instead.
**Never hide the page's own scrollbar** — that one is the document's.

**D.3 The period panels become a ladder: day thinnest, month thickest, in that order.** This was
shipped inverted first, on the reasoning that today matters most and should be biggest. The owner
reversed it: the ladder should read as *zooming out*, and the earlier reasoning is retired rather
than defended.

**D.4 — the important one. One implementation per idea.**

The chore-status notation was changed in one place. **Three other surfaces rendered the same idea
from their own copies** — the notices feed, the landing page's poster card — and the suite stayed
green because **each copy was tested against itself.** The owner found the old notation still on the
front door of the application.

The fix is structural, not textual. These modules become the single definition of their idea, and new
surfaces consume them rather than re-implementing:

| Module | Owns |
|---|---|
| `choreStatusDisplay.tsx` | approved shows a number and a mark, pending shows **nothing**, rejected is struck through |
| `TugBar.tsx` | the rope, its bolt, and the absence of a centre tick |
| `StandingTotals.tsx` | Coins / Lifetime points / Streak as one row — yours and your partner's must stay the same card |
| `ScrollArea.tsx` | vertical overflow, hidden scrollbar, conditional edge fade |
| `AvatarPicker`'s `PickerTile` | the selected state of every avatar tile |

> **The test of whether this worked: break the rule inside the shared module and count the red
> files.** Making pending chores show a figure again must fail four, not one. "How many tests went
> red" is the wrong number here; "how many *files*" is the right one, because it measures whether the
> duplication is actually gone.

---

## Round E — the two bugs the browser found and the suite could not

**E.1 The edge fade is per-edge and conditional.** A fade permanently over the top of a scroller
covers the most-read line in order to say something untrue — that there is content above, when the
box is scrolled to the top. Two custom properties are set from scroll position; an edge with nothing
behind it fades to zero.

This retires an earlier comment of mine claiming a conditional version was not worth the listener. It
was worth it, and the comment was the tell.

**E.2 Two traps recorded, because both shipped broken first:**

- **A ref object is `null` on the render that mounts your effect.** These containers sit behind
  loading branches, so `ref.current` is null when the effect first runs — and mutating `.current`
  re-renders nothing, so it never runs again. **Put the node in state via a callback ref**, which
  makes its arrival a render. Both scroll features shipped broken this way, and both now have a test
  named for the late-mount case.
- **A hook that returns an object with a `ref` key trips the lint rule** for reading a ref during
  render, which then flags every sibling property. Return `attach` and a style object instead.

**E.3 A 401 from a dead session survives into the next one.** A 60-minute token expires, the store
signs the user out, but nothing clears the query cache — so every errored entry is still there, and
the *next* login renders them on the first frame before the refetch lands. The owner reported it as
"Authentication is required, for a few seconds after logging in, and then it heals itself", which is
an exact description of a replayed cache.

Fixed with store middleware, because **"the identity changed" is a property of the action, not of any
component**. It resets on `signedIn` **as well as** `signedOut`: sign-out leaves nothing on screen,
so the survivors are what the *next* user sees. And it resets **after** the action is reduced, or the
restarted queries go out with the old token and 401 again.

---

## Round F — the selected state, twice

The avatar picker gave no feedback, and the highlight looked stuck on the first tile.

**F.1 The cause is two tokens that are the same colour.** The selected tile was `border-ink-accent`
and the others `border-ink`. **`--ink-accent` is `#000000` in both schemes by design; `--ink-surface`
is `#000000` in light.** So in light mode the chosen tile was pixel-identical to its neighbours. The
generated tile *also* swapped its background, so it was the only one that visibly changed — which
read as the selection sitting there permanently.

> **The rule: `border-ink-accent` and `border-ink` encode "border on a bright fill" versus "border on
> a surface". They never encode "selected" versus "unselected".** A selected state built on that pair
> is invisible on half the app.

**F.2 The first fix was also wrong, and the second round is the more useful one.** The tick was
right; the `border-[3px]` and the hard shadow shipped beside it were not.

- **A hard shadow means *pressable* in this system** — that is why the shadows were stripped from
  every container in the first place. Every tile in this row is pressable, so a shadow on one of them
  cannot also mean "chosen".
- **`--ink-shadow` inverts to near-white in dark.** The "lift" marking the selection was a thick
  white edge in dark mode — failing in exactly the scheme the original bug was in.
- A 2px → 3px step on a 48px square reads as a size wobble, and it shifts the row's metrics as the
  selection travels along it.

**The tile is now byte-identical in both states and a drawn tick is the entire signal.** One signal
is sufficient here precisely because the tick is a **drawn presence or absence, not a colour pair** —
there is nothing for a theme to collapse.

**Not built:** a colour change on the chosen tile, in any form. That is the failure mode this whole
round exists to close.

---

## Test requirement

Most of this is not testable, and saying so is part of the spec. What **is** testable:

1. **Scheme completeness.** Every token in a `--mark-*` or `--surface-*` family must be defined in
   both schemes; the scanner matches by prefix, so a new family is covered the day it is added.
2. **Contrast.** Every fill/foreground pair AA in both schemes, and every border ≥3:1 against what it
   sits on. A tint is a surface and takes `border-ink`, not `border-ink-accent` — black on the dark
   tint measures 1.74:1, which is not a border.
3. **De-duplication, measured in files.** Break the rule inside each shared module and assert the
   number of **files** that go red. `choreStatusDisplay` must fail four.
4. **The selected state carries no styling difference.** Assert `chosen.className === other.className`
   and that neither matches `/shadow-/`. Whole-string equality on purpose: this state has already
   been dressed as a border colour once and as a width-plus-shadow once, so naming a single property
   lets the third attempt through.
5. **Late mount.** Every scroll feature has a test where the container arrives on a later render than
   the effect. Both of them shipped broken this way.
6. **Session reset** is unit-tested at the middleware level, not by seeding a cache — `initiate()`
   issues no request in this environment, so a "seed a cache entry then assert it was cleared" test
   passes against an empty cache and proves nothing.
7. **Reduced motion** hides the stage. Assert `display: none` on the element, not a paused animation.

**Then a browser pass, in both schemes, at a narrow and a wide width — which is the only instrument
that can see any of the rest.**
