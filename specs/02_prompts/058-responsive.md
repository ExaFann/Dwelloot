## Task

[58] Responsive layout pass: mobile breakpoints across all screens.

The handover calls this **"the largest visible gap"**, and the measurement it quotes still holds
exactly. At 1280×900, before any change:

| Measured | Value |
|---|---|
| `main` width | **672px** (`max-w-2xl`) |
| Empty gutter each side | **304px** |
| Bottom nav | full-width bar, tabs squeezed into the centre 672px |
| Page height used | 900px viewport, content ends around 220px |

The app is mobile-first by construction and **nothing changes with width**. On a laptop it reads as a
phone app that has been stretched onto a desktop and then given up.

---

## 1. The decision this task turns on

There are two honest answers to "what should a two-person chore app look like on a laptop", and they
are not equally good:

**(a) Keep the phone column, make the surround deliberate.** Cheap, and defensible for an app whose
entire interaction model is one-thumb. But it is what is already there, and what got flagged — a
672px column in a 1280px window looks like an omission whether or not it was a decision.

**(b) Give the shell a desktop form.** The bottom tab bar becomes a **left sidebar**, the content
column widens, and the screens that are lists become grids. This is the ordinary pattern for exactly
this shape of app, and it is what "responsive" means in the plan.

**Taken: (b).**

### The constraint that shapes everything else

**The phone layout is already reviewed and accepted.** [46]'s tile wall, [47]'s sticky action bar,
[51]'s single-column store, [54]'s two-column badge grid — all were looked at and signed off at
375–390px, and two of them were sent back once before they were right.

So the rule for this task is: **every class added is breakpoint-prefixed.** Nothing unprefixed
changes, which makes the mobile rendering byte-identical by construction rather than by inspection.
That is the invariant worth stating up front, because a "responsive pass" that quietly reflows the
phone is a regression dressed as an improvement.

---

## 2. Decisions

**1. One `<nav>`, restyled — not two navs with one hidden.** The obvious implementation is a bottom
bar and a sidebar, each hidden at the other's breakpoint. That puts **two navigation landmarks with
the same accessible name** in the accessibility tree, and `display: none` is the only thing keeping
the second out of the reading order — a rule that is easy to break and invisible when it is. One
element that changes shape has no such failure mode, and it is what the markup already supports.

**2. The breakpoint is `md` (768px)** for the shell. Below it the bottom bar is right; above it there
is room for a 224px rail and a content column that is still wider than the 672px we have now.

**3. Grids arrive at `lg`, not `md`.** At 768px the content column is about 530px after the rail —
narrower than a phone-plus, so two columns there would be worse than one. The screens go
multi-column at `lg` (1024px) where there is genuinely room.

**4. The sidebar gets the wordmark.** There is no header anywhere in the app — the bottom bar is the
whole chrome — so on a phone the product name appears nowhere. The rail has space for it at the top,
and it costs nothing below `md`.

**5. Which screens actually become grids**, and why each:

| Screen | At `lg` | Why |
|---|---|---|
| Dashboard | head-to-head and quick log side by side | The tile wall is the thing that most wants width; the duel is the hero and keeps the wider column |
| Notices | pending approvals left, the two feeds right | The only section with a decision stays at the top of the reading order in one column |
| Store | reward cards two-up | Page size is 6, so 2×3 is a complete page |
| Log | chore list two-up | Twelve default chores is two screens of scrolling at one column |
| Me | profile + badges left, household + appearance right | Badges are already a grid; pairing them with settings balances the two columns |

**6. `BareLayout` is left alone.** Login and pairing are a centred `max-w-md` card, which is correct
at every width — a sign-in form does not get better at 1440px.

---

## 3. Test requirement

**This is the task where the tests can prove the least, and saying so is part of the job.** jsdom has
no layout engine: it computes no widths, applies no media queries and resolves no Tailwind classes.
A test that asserted `className` contains `md:flex-col` would be asserting a copy of the
implementation against itself — the self-referential trap this project has caught seven times.

So the split is:

**Asserted in the suite** — the structural invariants a responsive refactor can genuinely break:
1. **Exactly one navigation landmark**, with all five tabs, at any width. The regression a
   two-nav implementation introduces.
2. The skip link is still the first focusable thing.
3. Every screen still renders its sections after the refactor — the existing page suites cover this,
   and they must all still pass unchanged.

**Measured in the browser**, which is the only place layout exists, at **390 / 768 / 1024 / 1280 /
1440**:
4. `main`'s width and the gutters, as numbers, before and after.
5. **No horizontal overflow at any width** — `scrollWidth <= innerWidth`. This is the one that
   catches a grid whose minimum content width exceeds its column.
6. The nav is a bottom bar below `md` and a rail at and above it, by position rather than by class.
7. **The 390px rendering is unchanged** — same `main` width, same section order, same card widths.
