## Task

[57] Wire up theme switching: the light/dark toggle connected to the tokens from [39]. Both schemes
already exist and are contrast-tested; this task adds **the control that writes `data-theme`**,
decides **persistence**, and decides whether to offer **"follow system"**.

This is one of the **three assessed advanced requirements** (with Security and State management), so
it has to be a visible, deliberate feature rather than an ambient default — `design-tokens.md` §6
says exactly that.

Nothing switches scheme today: [39] deliberately generated no `prefers-color-scheme` rule for the
palette, so the app cannot change appearance until this lands, and `tokens.test.ts` asserts that
absence.

---

## 1. What already exists, and what this must not break

- `[data-theme="dark"]` on any ancestor selects the dark scheme — `@custom-variant dark` in
  `theme.css`.
- `html:where([data-theme='dark']) { color-scheme: dark }` already switches form controls and
  scrollbars.
- Both palettes are complete and every fill/foreground pair is contrast-tested in both schemes,
  including the two a naive inversion gets wrong: `--ink-accent` stays **black** in dark mode, and
  `--brand-primary-fg` flips to black because white on `#A87BFF` is 1.90:1.
- `tokens.test.ts` asserts **no `@media prefers-color-scheme` rule exists** in `theme.css`.

That last assertion is the interesting constraint, and it is worth keeping rather than relaxing.

---

## 2. Decisions

**1. One mechanism selects the scheme: the `data-theme` attribute. "Follow system" is resolved in
JavaScript, not by adding a CSS media query.**

The tempting implementation of "follow system" is a `@media (prefers-color-scheme: dark)` block in
`theme.css`. That would give the app **two** independent selectors for one piece of state, and they
can disagree: a user who has explicitly chosen **Light** on a machine set to dark would need the
attribute to *fight* the media query, which means specificity juggling and a rule that is wrong by
default. Instead `matchMedia` is read in JS, resolved to `light` or `dark`, and written to the same
single attribute.

This is the same "one mechanism" call the project has made three times before — `AuthGate` owning
every identity redirect, `useDeferredLog` owning undo, and settlement's live standing and settled
result sharing one code path. It also means `tokens.test.ts`'s assertion keeps its meaning: the
stylesheet still has exactly one way to be dark.

**2. Three modes, not a boolean.** Light / Dark / **System**. `design-tokens.md` §6 left "follow
system" open to this task. Offering it costs one branch and is the behaviour a phone user expects;
omitting it would mean a user whose OS flips at sunset has to come here and flip it too.

**3. Persisted in `localStorage`, with every access wrapped**, exactly as `authStorage` is and for the
same reason: `localStorage` throws in Safari private browsing and when site data is blocked, and this
module is read *before React mounts*, so an uncaught throw is a white screen with a console error and
no UI. An unreadable preference degrades to "system", which is the best available guess.

**4. The scheme is applied by an inline script in `index.html`, before first paint.**

This is the one thing that cannot be done from React. `createRoot().render()` runs after the browser
has already painted the document, so a dark-mode user would see a **flash of the light theme** on
every load — worse here than in most apps, because the light page is `#F0EBFF` and the dark one is
`#171226`, so it is a full-brightness flash rather than a subtle shift.

The cost is a **second copy of the resolution logic**, in a language and a file the TypeScript module
cannot import. That is exactly the kind of duplication this project treats as a defect, so it is
pinned: `themeBoot.test.ts` reads `index.html` off disk and asserts the script uses the same storage
key, the same attribute and the same mode values as `themeMode.ts` — the same technique
`tokens.test.ts` uses to keep the palette honest by parsing the stylesheet the app actually ships.

**5. The mode lives in Redux.** Two places need it — the toggle on the Me screen, and the effect at
the app root that listens for OS changes — and they must agree. That is what the store is for, it
mirrors `authSlice`'s shape (hydrated at module load, persistence in the reducer), and state
management is itself one of the assessed requirements.

**6. The OS listener lives at the root, not in the toggle.** If `matchMedia` were only subscribed on
the Me screen, changing the OS theme while looking at the dashboard would do nothing until the user
visited Me. The effect is mounted in `App`.

**7. The control is three chips with `aria-pressed`**, the same idiom as the Store's affordability
filter — a user who has seen one already knows the other. A `radiogroup` would be marginally more
correct semantically but would need arrow-key roving-focus handling to actually *be* more correct,
and a half-implemented radiogroup is worse than a well-formed group of toggle buttons.

**8. It sits on the Me screen**, after household settings and before sign-out. It is a device
preference, so it belongs with the other settings rather than in the nav.

---

## 3. Test requirement

**`themeMode.test.ts`**
1. The resolution table: `light` → light and `dark` → dark **whatever the system says** — both
   directions, because a resolver that always returned the system value would pass a system-only test.
2. `system` follows `prefersDark`, both ways.
3. A stored value that is not a mode (corrupted, or written by an older build) falls back to `system`
   rather than throwing or applying garbage.
4. Applying `dark` sets the attribute; applying `light` **removes** it rather than setting
   `data-theme="light"` — the stylesheet selects on presence, and a stray attribute is a state that
   no CSS rule matches.
5. Storage round-trips, and a throwing `localStorage` degrades to `system` instead of propagating.

**`themeBoot.test.ts`** — the anti-drift check on the inline script: the same key, the same
attribute, the same mode strings as the module.

**`ThemeToggle.test.tsx`**
6. All three options render, with the stored one pressed and the others not — **both directions**.
7. Choosing Dark writes `data-theme="dark"` on `<html>` and persists the choice.
8. Choosing Light removes the attribute.
9. Choosing System resolves from `matchMedia`, asserted with the query stubbed to both values.
10. **A system change while in System mode re-applies**, and **does not** while in Light or Dark —
    the assertion that fails against a listener that ignores the mode.

Then a browser pass in both schemes, which is the only thing that can see a rendered page.
