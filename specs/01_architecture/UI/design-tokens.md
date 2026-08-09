# Design tokens

The visual system for Dwelloot's frontend. Sits alongside `wireframes.md`: that document says what is
on each screen, this one says what it looks like.

**The implementation is the source of truth for values.** `client/src/styles/theme.css` holds every
token as a CSS custom property, and `client/src/theme/tokens.test.ts` parses that file and asserts the
properties below. This document explains the *why*; the numbers here are duplicated from the CSS for
readability and the test is what keeps them honest.

---

## 1. The style

Neo-brutalist. Four rules, and they are rules rather than preferences because each one is load-bearing
for the others:

1. **Flat fills. No gradients, anywhere.** Not in backgrounds, not in elevation overlays, not in a
   button's ripple.
2. **2px solid borders.** Every surface and every control is outlined.
3. **Hard offset shadows — zero blur, zero spread.** `4px 4px 0 0 <ink>`. This is the depth cue; there
   is no other one.
4. **Physical press.** On hover an element travels 2px toward its shadow and the shadow contracts to
   meet it. On active it presses fully and the shadow disappears.

Remove the borders and the shadows and nothing is left but colored rectangles, which is why §3's ink
rules get more space here than the palette does.

## 2. Palette

Four fills plus two neutrals. Every value below is measured, not chosen by eye — see §5.

### Light scheme

| Token | Value | Foreground | Contrast | Used for |
|---|---|---|---|---|
| `--brand-primary` | `#6C00FF` Electric Purple | `#FFFFFF` | 6.81:1 | Points, primary actions |
| `--brand-success` | `#00C96F` Bright Green | `#0A0A0A` | 9.04:1 | Approvals, wins |
| `--brand-warning` | `#FFD600` Golden Yellow | `#0A0A0A` | 14.02:1 | Coins, loot |

> **Superseded by `ui-exp01`.** The palette below was picked for maximum punch and read as alarming
> on real screens — `#FF3B5C` is a warning light, `#00C96F` a highlighter, `#6C00FF` near-spectral
> violet. Neo-brutalism gets its energy from flat fills and heavy black outlines, not from
> saturation. Current values, all AA-checked in both schemes by `tokens.test.ts`:
>
> | Token | Light | Dark | Meaning |
> |---|---|---|---|
> | `--brand-primary` | `#7C4DFF` | `#A87BFF` | **you** — a person, not a currency |
> | `--brand-success` | `#3DDC97` | `#57E6B0` | your opponent |
> | `--brand-warning` | `#FFE14A` | `#FFEA6B` | Coins, loot, pending |
> | `--brand-danger` | `#FF7A70` | `#FF9A90` | destructive |
> | `--brand-flame` | `#FF8A3D` | `#FFA85C` | **streaks only** |
> | `--brand-points` | `#4CC9F0` | `#6FD6F7` | **Points only** |
>
> `--brand-flame` and `--brand-points` are new. The three profile stats needed three fills and the
> original four could not supply them: green is the opponent's colour and red is destructive, so
> Coins/Points/Streak in yellow, green and red reads as "good, neutral, something is wrong" about
> three things that are all simply yours.
>
> A streak is a fire, so orange. Points took purple at first and that was wrong — **purple is a
> person**, so one token was doing two unrelated jobs; blue gives Points their own identity and is
> the only hue far enough from the other two to keep the trio apart.
>
> The three separate on **two axes**, luminance and hue, rather than either alone — light-scheme
> luminance 0.756 / 0.496 / 0.398, with yellow against orange at 1.80:1 (it was 1.24:1 when they were
> a softer yellow and a lighter orange).
>
> **A badge's fill names its currency, everywhere.** Yellow means Coins — Store prices, the balance,
> the Coins stat. Blue means Points — a chore's worth in the Log tab and the approval queue, and the
> Lifetime pts stat. Those two chore badges were yellow until `ui-exp01`, which quietly said "chores
> are worth Coins"; they are not, and the two currencies are never interchangeable (Points are never
> spent, Coins are only won).
>
> Yellow's *other* job — **pending** — is unchanged and is not a currency: the "N waiting" counter on
> the Notices queue stays yellow because it counts things awaiting a decision, not points.
>
> **Geometry also split.** `--geometry-radius` is now `0` — surfaces are square, which is the whole
> point of the style — while `--geometry-radius-control: 8px` keeps corners on anything you press,
> because a square slab under a hard shadow reads as a card lying on the page rather than a key
> standing off it. The bottom nav is deliberately on the *surface* side of that split.
>
> **The press was also reversed**: hover now lifts (5px shadow, −1px) and `:active` presses flat
> (no shadow, +4px) with an overshoot on release. It used to do the opposite, so the pressed look
> appeared on hover and a real click had no physics at all.
| `--brand-danger` | `#FF3B5C` | `#0A0A0A` | 5.69:1 | Reject, destructive |
| `--surface-page` | `#F0EBFF` Light Lavender | — | — | Page background |
| `--surface-card` | `#FFFFFF` | — | — | Cards, inputs |
| `--text-primary` | `#0A0A0A` | on page | 17.00:1 | Body text |
| `--text-secondary` | `#4A4458` | on page | 7.98:1 | Supporting text |

### Dark scheme

| Token | Value | Foreground | Contrast |
|---|---|---|---|
| `--brand-primary` | `#A87BFF` | `#0A0A0A` | 6.54:1 |
| `--brand-success` | `#00E87F` | `#0A0A0A` | 12.11:1 |
| `--brand-warning` | `#FFD600` (unchanged) | `#0A0A0A` | 14.02:1 |
| `--brand-danger` | `#FF6B85` | `#0A0A0A` | 7.25:1 |
| `--surface-page` | `#171226` | — | — |
| `--surface-card` | `#241C3D` | — | — |
| `--text-primary` | `#F5F1FF` | on page | 16.43:1 |
| `--text-secondary` | `#B8AED6` | on page | 8.74:1 |

### 2.1 Player colours — purple is you, green is your opponent

Set by the owner while reviewing [46]. The palette **leads with purple and green**, and the two are
reserved for the two people:

| | Colour | Used for |
|---|---|---|
| **You** | `--brand-primary` purple | Your side of the tug bar, your avatar, your score |
| **Your partner** | `--brand-success` green | Their side, their avatar, their score |

This is a **second job** for green, which is also the approval/success colour, and the overlap is
deliberate rather than overlooked: the two never appear in the same component. The head-to-head panel
has no approval state, and the activity feed's green "Approved" badge has no opponent in it.

The opponent's side was **yellow** until this rule; yellow now means only **Coins, loot and pending**,
which is a cleaner split than it had before — it was carrying "the other player" *and* "waiting" *and*
"currency" at once.

Avatars follow the same mapping — see `[46]` in the commit plan.

**Avatars are generated, not uploaded** (owner's decision, 2026-08-04). `Avatar` takes a `userId` and
a `name` and derives everything else: the fill comes from the player role above, the initials from the
name, and a deterministic geometric motif from the id, so two partners who share an initial are still
distinguishable. No image is fetched, so avatars work offline and cost nothing to store.

A real upload feature is planned as `[64a]` and is **backend-first** — a column, an endpoint, size and
content-type limits, storage. Because `Avatar` takes only an id and a name, that change lands inside
the component and touches no call site; a user without an upload keeps the generated one as a fallback.

**Purple's foreground flips between schemes.** White on `#6C00FF` is 6.81:1; white on the lightened
`#A87BFF` would be 1.90:1. Any component that hard-codes white text on "the purple button" is broken
in dark mode. This is why foreground is a token per fill rather than a global rule.

**Danger is a fourth color the original direction did not include.** Rejecting a partner's chore log
([48]) is genuinely destructive and has no honest expression in purple, green or yellow.

## 3. Ink — the part a naive dark mode gets wrong

"Ink" is the color of borders and shadows. There are **three ink tokens, not one**, because ink is a
property of the *surface it sits on*, not of the color scheme.

The tempting rule is "dark mode inverts the ink to light". Measured against the fills, that is wrong:

| Light ink `#F0EBFF` against | Contrast | |
|---|---|---|
| `--brand-warning` `#FFD600` | 1.21:1 | invisible |
| `--brand-success` `#00E87F` | 1.40:1 | invisible |
| `--brand-danger` `#FF6B85` | 2.34:1 | below the 3:1 bar |
| `--brand-primary` `#A87BFF` | 2.60:1 | below the 3:1 bar |

A light border on a yellow button is not a border. So:

| Token | Light | Dark | Rule |
|---|---|---|---|
| `--ink-accent` | `#000000` | `#000000` | Borders on bright brand fills. **Does not change.** A filled button on a dark background is already separated from it by the fill; the border only has to draw the edge, and black does that (14.87:1 on yellow, 6.54:1 on dark purple). |
| `--ink-surface` | `#000000` | `#F0EBFF` | Borders on neutral surfaces — cards, inputs, the page. Follows the scheme, because black on a dark card is ~1.5:1. |
| `--ink-shadow` | `#000000` | `#F0EBFF` | Hard shadows. Always follows the scheme: a shadow is cast **onto the background**, whatever casts it. |

Dark mode's ink is `#F0EBFF` — light mode's *background*. The two schemes are each other's figure and
ground.

## 4. Geometry, type and motion

| Token | Value | Note |
|---|---|---|
| `--border-width` | `2px` | Uniform. Load-bearing, per §1. |
| `--geometry-radius` | `8px` | Judgment call — crisp, but friendlier than a hard `0` for a chore app. Exposed as the `rounded-base` utility. Named `--geometry-` rather than `--radius-` because `--radius-*` is a Tailwind namespace, and reusing the name makes the mapping self-referential. |
| `--shadow-rest` | `4px 4px 0 0 var(--ink-shadow)` | Resting elevation for a **standalone** control. |
| `--shadow-press` | `2px 2px 0 0 var(--ink-shadow)` | Hover, and the resting state for **list rows**. |
| `--shadow-raised` | `5px 5px 0 0 var(--ink-shadow)` | Cards. |
| `--press-travel` | `2px` | Hover displacement. Equals the shadow contraction, so the element meets its shadow. |

**Offset scales with the element, not with its importance.** A 4px shadow under a full-width row is a
4px-tall black band the width of the screen, and five stacked rows read as a striped page rather than
five liftable objects — the owner's note reviewing [46]. Standalone buttons keep 4px; anything in a
repeating full-width list uses `pressable-sm`, which rests at 2px and presses to 0.

**Type.** Two faces, both self-hosted via `@fontsource` — never a Google Fonts `<link>`. Same reasoning
as the self-hosted Scalar assets in task [34]: no third-party request on load, works under a strict CSP
and offline, and no visitor IPs sent to a font host.

| Token | Face | Weights | Used for |
|---|---|---|---|
| `--font-display` | Chakra Petch | 600, 700 | Headings, buttons, labels. Geometric, gaming-adjacent. |
| `--font-body` | Space Grotesk | 400, 500, 700 | Body copy, descriptions. |

Button labels are **uppercase with `0.02em` tracking** — a judgment call that suits Chakra Petch's cut.

**Focus.** One utility, `focus-ring`: a `3px solid var(--brand-primary)` outline at `2px` offset,
on `:focus-visible` only. Added in task [40], the first task with anything focusable.

Two choices worth stating. `:focus-visible` rather than `:focus`, so clicking a button with a mouse
does not leave a ring behind while keyboard navigation still shows one. And an `outline` rather than a
box-shadow ring, because every shadow in this system is a hard offset — a ring drawn as one would be
indistinguishable from resting elevation.

**Motion.** `120ms ease` on `transform` and `box-shadow` only. Everything is wrapped so that
`prefers-reduced-motion: reduce` removes the transition; the position change still happens, so the
affordance survives.

The press moves on **both axes** — `translate(2px, 2px)`, not `translateY(2px)`. The shadow sits on a
diagonal, so contracting it 4px→2px while moving only vertically leaves the horizontal gap unchanged
and the element reads as sliding rather than being pressed.

## 5. Rules that hold, and how they are enforced

These are asserted by `client/src/theme/tokens.test.ts`, which parses `theme.css` itself rather than a
copy of its values.

1. **Every fill's paired foreground meets WCAG AA (≥4.5:1), in both schemes.** A regression here is one
   hex digit and is invisible in a build.
2. **The dark scheme overrides every scheme-dependent token the light scheme defines.** A missing one
   silently keeps the light value — a black shadow on a dark background, which renders as no shadow at
   all rather than as an error.
3. **Every shadow token has zero blur and zero spread**, and derives its color from `--ink-shadow`
   rather than a literal. The one rule from §1 that a plausible-looking typo can violate.
4. **No token value contains `gradient`.**
5. **No raw `:root` token shares a name with a token mapped in `@theme inline`.** The mapping is
   `--x: var(--raw-x)`; reusing one name makes it `--x: var(--x)`, which resolves to nothing. This
   shipped once — `rounded-base` produced no radius at all, and the build, the linter and 49 passing
   tests all missed it.
6. **The press travel equals the shadow contraction**, so the element meets its shadow instead of
   sliding past it.

Non-text contrast is held to 3:1 (the WCAG bar for UI component boundaries), which is what §3's table
is measured against. Disabled controls are exempt under WCAG and are not asserted.

## 6. Theme switching

`[data-theme="dark"]` on `<html>` selects the dark scheme, and **it is the only thing that does** —
no `prefers-color-scheme` rule is generated for the palette. That was originally so the scheme could
not change out from under a developer or a screenshot before [57]; it is now permanent, for a better
reason.

**Settled in task [57].** Three modes — Light, Dark and System — persisted in `localStorage` under
`dwelloot.theme`. **"Follow system" is resolved in JavaScript and written to this same attribute**,
rather than by adding a media query to this file. Two independent selectors for one piece of state
can disagree: a user who has explicitly chosen Light on a machine set to dark would need the
attribute to fight the query. One mechanism, as with `AuthGate` and routing.

The attribute is set by an **inline script in `index.html` before the first paint** — React renders
after the browser has painted, so nothing in the app can prevent the flash. Light **removes** the
attribute rather than setting `data-theme="light"`: the stylesheet selects on presence, so a light
value would be a state no rule matches.

Theme switching is one of the three assessed advanced requirements, which is the other reason it stays
a visible, deliberate feature rather than an ambient default.

## 7. Why not a component library

Task [39] was first built on MUI and reversed. The record is in `specs/02_prompts/039-mui-theme-tokens-superseded.md`;
the short version is that Material Design's defaults are the opposite of every rule in §1 — soft layered
shadows, elevation gradients, a ripple that is an animated radial gradient — so the work was
subtraction, and subtraction that has to be repeated for every component anyone later reaches for.

The replacement is **Tailwind CSS v4**, which has no visual opinion to remove, and hand-built components
on top of these tokens. Accessible behavior for the genuinely hard primitives — dialog, select, tabs,
checkbox — comes from **Radix UI**, which supplies behavior and no styling. Those arrive when a screen
needs them, not before.
