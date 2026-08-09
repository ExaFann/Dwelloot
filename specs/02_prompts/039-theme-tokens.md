## Task

[39] Add Tailwind CSS + base theme tokens: light/dark color tokens defined, switch not wired yet.
Also sets up Vitest, pulled forward from [59].

Two changes of direction, both the owner's, both taken after [39] had already been built once:

1. **MUI is out.** Judged the wrong foundation for a neo-brutalist system. §1 records why, with the
   costs measured rather than asserted.
2. **Vitest moves forward from [59].** Raised as a standing item in logs `038` and `039-superseded`;
   approved here.

## 1. Why MUI was reversed

The owner's argument was that Material Design's premises are the inverse of this project's — fluid
shadows, gradients, rounded micro-animations against hard offsets, sharp edges and zero gradients —
and that using it means overriding `box-shadow`, `border` and `transition` on essentially every
component, which invites inconsistency in corners nobody checks.

The superseded attempt is evidence for that, and the evidence is stronger than the argument:

| What MUI needed | |
|---|---|
| Ripple disabled globally | An animated radial gradient — a direct violation |
| All **25** elevation slots replaced | Blurred, three-layer shadows by default |
| `backgroundImage: 'none'` forced on `Paper` | MUI overlays an alpha **gradient** on elevated surfaces in dark mode |
| Border + shadow overrides on Button (×3 variants), Paper, Card, Chip, OutlinedInput | |
| A hand-written runtime assertion | To catch MUI's own CSS-variable naming drifting from ours |

**And the failure mode was silent.** The shadow ramp did not apply at all for part of that task:
`createTheme(baseTheme, { shadows })` does not merge, so every Card and Paper kept a three-layer
blurred shadow while the buttons — which set their shadow directly — looked right. Clean build, clean
lint, and a screenshot that looked correct. That is the "inconsistency in hidden corners" prediction
happening within one task.

Only 6 component types were ever styled. Menu, Dialog, Tooltip, Snackbar, Select and the rest were
never mounted, so the theme's correctness for them was never more than likely.

**What carried forward unchanged:** the three-ink dark-mode design and every contrast measurement.
Both are about color, not about MUI, and neither needed revisiting.

## 2. What replaced it

**Tailwind CSS v4.3.3**, via `@tailwindcss/vite`. Chosen because it has no visual opinion to remove —
the failure mode above is not available. Its v4 CSS-first configuration is also a direct fit for this
task's actual deliverable: `@theme` *is* a design-token file, so the tokens and the utilities that
consume them are one artifact rather than a TypeScript object that has to be kept in sync with a
stylesheet.

Considered and rejected:

- **Mantine** — the same shape of problem as MUI, milder. It has a visual language of its own, so the
  work would still be subtraction, and the requirement asks for "your own design choices".
- **A neo-brutalist component kit** (neobrutalism.dev, Retro UI). Fast, and precisely the wrong move
  for a brief that says the UI "should reflect your own design choices and have a unique visual
  identity". Adopting a recognisable off-the-shelf neo-brutalist look concedes the thing being
  assessed.
- **Hand-rolled everything, no primitives.** Maximum control, but it makes an accessible dialog,
  select and menu my problem across [51]–[53], which is where an assessed project quietly loses
  keyboard and screen-reader support.

**The settled position:** Tailwind for styling, our own components on our own tokens, and **Radix UI**
for the primitives whose *behavior* is hard — dialog, select, tabs, checkbox. Radix ships behavior and
no styling, which is MUI's trade-off inverted. Nothing from Radix is installed yet; it arrives when a
screen first needs it, which is not this task.

### Decisions

**1. `theme.css` is the single source of truth, and the tests parse it.** There is no TypeScript copy
of the palette. `tokens.test.ts` reads `src/styles/theme.css` off disk and asserts against what the
app actually ships. A mirrored TS object would be the thing under test and could agree with itself
perfectly while the stylesheet said something else — which is the shape of most of the vacuous checks
catalogued in the handover's §5.1.

**2. Two layers of custom properties.** Raw scheme-dependent values in `:root` / `[data-theme=dark]`;
`@theme inline` maps them onto Tailwind's namespaces. `inline` is required: without it a utility
references `--color-primary`, which is defined once at `:root` and freezes the light value.

**3. The dark scheme is selected by `[data-theme="dark"]`, never `prefers-color-scheme`.** Tailwind's
default is the media query, which would make the app follow the OS with nothing written to switch it —
the switch half-implemented, in a project where theme switching is one of three assessed advanced
requirements. It also means every screenshot and every task from [40] to [58] would differ by
developer OS setting. Carried over from the superseded attempt, where the same decision was made
against MUI's identical default.

**4. The press is one `@utility`, not six classes per control.** Retyping
`hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-hard-sm …` on every button is how four
style rules drift apart. `pressable` keeps the physics with the tokens.

**5. Vitest runs in `node` by default**, with `jsdom` opted into per-file. The token tests are string
and number work over a stylesheet; a DOM would be pure cost. Component tests from [40] on add
`@vitest-environment jsdom`.

**6. A third TypeScript project for tests.** `tokens.test.ts` reads a file with `node:fs`. Adding
`"node"` to `tsconfig.app.json` would let application code import `fs` and fail only in a browser, so
tests get `tsconfig.test.json` and are excluded from the app project. `tsconfig.json` references all
three, so `npm run build` still typechecks every test.

### What is not done here

| Deferred to | Item |
|---|---|
| [40] | Router, real screens, and the shared component layer — `App.tsx` is still a preview |
| [41] | Redux Toolkit, RTK Query, the API base URL |
| [51]–[53] | Radix primitives, when a dialog or select first exists |
| [57] | The toggle, persistence, "follow system" |
| [58] | Responsive pass — only the type scale and a two-breakpoint preview grid exist |

## Test requirement

This is the first frontend task with a test harness, so the tests are the deliverable as much as the
tokens are. Three properties, all cheap, all previously guaranteed only by a browser session that
would never run again:

1. **Every fill's paired foreground meets WCAG AA in both schemes.** Including the case that is
   mode-dependent: purple takes white at `#6C00FF` and black at `#A87BFF`.
2. **The dark scheme overrides every scheme-dependent token.** A missing one silently keeps the light
   value — for `--ink-shadow` that is a black shadow on a near-black background, which renders as no
   shadow rather than as an error.
3. **Every shadow token has zero blur and zero spread**, and no token is a gradient.

Plus the ink rules from `design-tokens.md` §3 as contrast assertions, and a guard that nothing selects
a scheme on its own.

**The contrast maths gets its own tests.** Every color assertion rests on it, so a checker that erred
generously would pass the whole suite while the app was unreadable — the handover's "expectation
derived from the code under test", one level down. `contrast.test.ts` pins it against published
reference values: 21:1 for black on white, 0 and 1 for the luminance anchors, the sRGB gamma curve
(mid-grey is 0.2159, not 0.5 — a linear implementation would pass a naive test), the three channel
coefficients, and `#767676` on white at 4.54:1.

Then a browser pass, because none of the above can see a rendered page.

