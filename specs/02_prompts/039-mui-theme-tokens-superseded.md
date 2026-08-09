> # ⚠ SUPERSEDED — this approach was reversed
>
> **The canonical log for task [39] is `theme-tokens-039.md`.** MUI was removed and replaced with
> Tailwind CSS v4; the reasoning, and the measured cost of the MUI attempt, are in that log.
>
> Kept rather than deleted because it is the most thoroughly measured rejected alternative in the
> project, and because two things in it survive the change and were carried forward verbatim: the
> **three-ink dark-mode design** and the **contrast measurements**, neither of which had anything to
> do with MUI.
>
> Nothing below describes the current code. `src/theme/theme.ts`, `src/theme/tokens.ts` and every MUI
> package named here have been deleted.

---
## Task

[39] Add MUI + base theme tokens: light/dark color tokens defined, switch not wired yet.

The owner supplied the visual direction for this task: a neo-brutalist system — flat fills, no
gradients, 2px solid black borders, hard offset shadows of 3–5px, a tactile 2px press on hover,
Chakra Petch for headings/buttons/labels and Space Grotesk for body, on a palette of Electric Purple
`#6C00FF`, Bright Green `#00C96F`, Golden Yellow `#FFD600` and a Light Lavender `#F0EBFF` background.

## Scope

Tokens and the component overrides that express them. **No toggle and no persistence** — [57] owns
those, and the commit plan says so explicitly. The dark scheme is fully defined here; nothing selects
it at runtime.

The brief describes a **light** theme. Producing the dark half of it is the actual work in this task,
and it is not a mechanical inversion — see below, where measuring it changed the design.

### The problem the brief does not answer: what happens to black in dark mode

Neo-brutalism carries its structure in the border and the hard shadow. Remove them and nothing is
left but flat rectangles. So the dark scheme lives or dies on where the "ink" goes, and the obvious
answer is wrong.

The obvious answer is to invert: black ink becomes light ink. Measured against the brand fills, that
destroys the style on exactly the elements that use it most:

| Dark-mode ink `#F0EBFF` against… | Contrast |
|---|---|
| Yellow `#FFD600` | **1.21:1** |
| Green `#00E87F` | **1.40:1** |
| Red `#FF6B85` | **2.34:1** |
| Purple `#A87BFF` | **2.60:1** |

A light border on a yellow button is not a border. All four fall below the 3:1 that non-text UI
boundaries need, three of them are essentially invisible, and none of it would show up in a build or
a lint — it is a thing you only find by measuring or by looking.

**So ink is a property of the surface, not of the mode:**

- **Borders on bright brand fills stay black in both schemes.** Black on yellow is 14.87:1, on purple
  `#A87BFF` 6.54:1. A filled button on a dark background does not need its *border* to contrast with
  the background — the fill already separates it. The border's job is the edge, and black gives it.
- **Borders on neutral surfaces follow the mode.** Black on a dark card is invisible (~1.5:1); light
  lavender on it is 13.78:1.
- **Shadows follow the mode, always.** A hard shadow falls onto the background, so in dark mode it
  must be light regardless of what it is cast by. A black shadow on a dark background is no shadow.

That yields three ink tokens rather than one, and it is the substantive design decision in this task.
Recorded because "we inverted the colors for dark mode" is the sort of thing that reads as done and
ships broken.

Pleasing side effect: dark mode's ink is `#F0EBFF` — light mode's *background*. The two schemes are
each other's figure and ground.

### Decisions

**1. Every fill's `contrastText` is measured, not assumed.** The auto-picked text color and its ratio
are in Results. One case is mode-dependent and would have been got wrong by hand: purple takes
**white** text at `#6C00FF` (6.81:1) and **black** text at its dark-scheme lightening `#A87BFF`
(6.54:1). Hard-coding white for "the purple button" would have shipped 1.9:1 in dark mode.

**2. A fourth color, red, is added to the brief's three.** `#FF3B5C` light / `#FF6B85` dark. The app
has a genuinely destructive action — rejecting a partner's chore log with a required reason ([48]) —
and signalling that in purple, green or yellow would be worse than adding a color. It is the only
addition.

**3. `cssVariables: true` + `colorSchemes: { light, dark }`**, MUI v9's current pattern, rather than
two `createTheme` calls swapped by a provider. Both schemes emit CSS custom properties, so a single
set of component overrides referencing `theme.vars.palette.*` serves both — no `applyStyles('dark')`
branching in every override, and no repaint flash when [57] eventually flips it.

This is not "wiring the switch": `defaultMode` is pinned to `light`, so nothing follows the system
preference and nothing persists. [57] adds a toggle calling `useColorScheme().setMode` and the
storage decision. Choosing this now is what keeps [57] small.

**4. Fonts are self-hosted via `@fontsource`, not Google Fonts `<link>`.** Follows the precedent set
in [34], where Scalar's assets were served by the application rather than a CDN so the docs work with
no outbound internet and under a strict CSP. The same reasoning applies harder to a font: a webfont
`<link>` is a render-blocking third-party request on every page load, and it leaks visitor IPs to a
third party. Vite fingerprints and bundles the `@fontsource` files instead.

**5. MUI's default shadow ramp is replaced entirely.** All 25 entries are regenerated as hard offsets
with zero blur. Overriding only the components we style would leave every un-styled MUI component
emitting soft blurred elevation — the one thing the brief rules out — and the failure would appear
later, in a component nobody thought to check. Replacing the ramp makes flatness the default and a
gradient impossible to reintroduce by accident.

**6. The ripple is disabled globally.** MUI's touch ripple is an animated radial gradient; it
contradicts "zero gradients" directly. The press feedback is the 2px displacement instead.

**7. Two judgment calls where the brief was silent**, flagged as such: border radius **8px** (crisp,
still friendlier than a hard 0 for a chore app), and **uppercase** button labels with slight tracking,
which suits Chakra Petch's geometric cut. Both are one-line changes if the owner disagrees.

**8. The press is `translate(2px, 2px)`, not `translateY(2px)`.** The brief says "translate down 2px";
the shadow is on a diagonal, so contracting it 4px→2px while moving only vertically leaves the
horizontal gap wrong and the element reads as sliding rather than pressing. Moving on both axes is
what makes the shadow contraction land. `:active` presses fully to 0. Noting it because it is a small
departure from the literal wording.

### What is not done here

| Deferred to | Item |
|---|---|
| [40] | Routes and real pages — `App.tsx` here is a temporary theme preview |
| [41] | Redux, RTK Query |
| [57] | The toggle, persistence, and system-preference handling |
| [58] | The responsive pass; only the type scale is set here |
| [59] | Vitest — see the standing item, which this task makes concrete |

`@mui/icons-material` is deliberately not installed. Nothing in a token definition needs an icon, and
[40]'s bottom navigation is the first thing that does.

## Test requirement

**No test file, and this time that is a constraint rather than a judgment.** Vitest is not installed —
[59] owns it, and I flagged in log `038` that this is too late. This task is the concrete case:

There are three properties here worth asserting, all cheap, all real:

1. **Every fill's `contrastText` meets WCAG AA (≥4.5:1) in both schemes.** A regression is one hex
   digit and is invisible in a build.
2. **The dark scheme defines every token the light scheme does.** A missing dark token silently falls
   back to MUI's default — which is a soft grey, in a theme whose entire premise is that there are no
   soft greys.
3. **No entry in the 25-slot shadow ramp contains a blur radius or a gradient.**

I cannot write them as tests without pre-empting [59]. Instead they are verified **by measurement** —
a script that computes WCAG ratios over the actual token module, run and reported below — and by
looking at the rendered result in a browser. That is weaker than a test in one specific way: it does
not run again. Nothing stops task [45] from changing a hex value and nobody finding out.

Additionally: `npm run build`, `npm run lint`, and a rendered screenshot of both schemes, since the
first two cannot see a color at all.

