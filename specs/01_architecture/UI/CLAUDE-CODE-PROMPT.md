# Kickoff prompt for Claude Code — brand & icon implementation

Paste the block below as the first message. After that, answer "continue" / "next task" each turn —
the working agreement is still **one task per turn, then stop**.

---

```
We are implementing the finished brand and icon system. Do NOT design anything — every visual
decision is already made and written down.

READ FIRST, IN THIS ORDER:
1. specs/claude-code-kickoff-prompt.md      — the working agreement. Still binding.
2. project-state-handover.md                — where the build is. §3.5 is the design system.
3. specs/1_architecture_and_ux/brand/BRAND-ICONS.md   — THE SPEC. This is the source of truth.
4. specs/1_architecture_and_ux/brand/icons-source.svg — every icon path. Open it in a browser first.

The two non-negotiables have not changed:
- ONE task per turn, then STOP.
- NEVER `git add`, `git commit` or `git push`. I review and commit every task myself.

Also unchanged: write the log spec into specs/2_chat_logs/ first, then implement, then test, then
verify against the running app, then record what failed honestly, then stop.

THREE TASKS. Do them in this order, one per turn. Add them to specs/3_myhiddenref/commit_plan.md
as [64] [65] [66] before you start, using the same format as the existing entries.

[64] Tokens + icons.tsx
  - Add --deco-red / --deco-blue to client/src/styles/theme.css (see BRAND-ICONS.md §1.1).
    theme.css is the single source of truth and tokens.test.ts parses that file — make sure the
    "no raw token name reuses a Tailwind namespace" test still passes with the new --deco-* prefix.
  - Replace client/src/components/ui/marks.tsx with icons.tsx: 3 currency marks, 20 UI icons,
    12 badge motifs, 1 lock. Copy the path data verbatim out of icons-source.svg — do not redraw,
    do not "improve", do not round the numbers.
  - Marks and UI icons are flat fills with NO stroke and NO shadow. BRAND-ICONS.md §4 explains why;
    if you think a stroke would look better, read §4 again rather than adding one.
  - UI icons use currentColor. Five of them need fill-rule="evenodd" — §5 lists which.
  - Update every import site. Remove any remaining lucide usage from client/src.
  - Keep BadgeMark's id-based switch AND its default: fallback, AND the comment saying the lookup is
    presentation-only. Badges 7–12 are not seeded on the backend yet.

[65] BadgeWall
  - New component: honeycomb, rows of 2/3/4/3, edges touching. Geometry formula in §7 — implement
    the formula, not the worked pixel table, so the cell size stays a parameter.
  - collector goes bottom-centre. That position is deliberate, see §7.
  - Locked = desaturated + a lock chip in the BOTTOM-RIGHT corner. Not a silhouette, not a centred
    lock. §7.1 says why. The locked/unlocked state must be in the accessible name, not just visual.
  - md and above only. Below md, fall back to the existing BadgeShelf grid — reuse the same
    breakpoint [58] established for the bottom-bar-to-left-rail switch.
  - The lock chip is #1E1830 and the dark page is #171226. Check it in dark mode before you call
    this done.

[66] App icons + manifest
  - Copy specs/1_architecture_and_ux/brand/assets/* into client/public/. Do not regenerate them.
  - Wire index.html and create manifest.webmanifest — exact markup in §8.
  - client/public/staticwebapp.config.json and _redirects already exist. Check whether either needs
    a rule for manifest.webmanifest. VERIFY BY FETCHING IT from the running app, not by reading the
    config and reasoning about it.
  - og:image wants an absolute URL. Take the origin from the actual deployed frontend URL. If you
    cannot determine it, leave the relative path and SAY SO — do not invent a hostname.

BEFORE YOU CALL ANY TASK DONE:
  npm run build && npm run lint && npm audit
  0 vulnerabilities has held since [34]. Keep it.
  npm test exits 1 because of 8 pre-existing unhandled rejections in authApi/LoginPage — that is
  known and not yours. 699 passing, 0 failing is the real bar. If the count drops, you broke it.

TESTS: existing tests assert on mark markup. Update them, do not delete them. And per §7.1 of the
handover — an assertion that cannot fail is worse than no assertion. If you add a test for the new
icons, change one path deliberately and confirm the test actually goes red.

FINALLY: do not touch anything under specs/1_architecture_and_ux/brand/ — it is finished design
output, not working files.
```

---

## If you want it shorter

For a single task, this is enough:

```
Read specs/1_architecture_and_ux/brand/BRAND-ICONS.md, then do task [64] from it (tokens +
icons.tsx). Working agreement unchanged: one task, then stop; never git add/commit/push; log spec
into specs/2_chat_logs/ first. Copy icon paths verbatim from brand/icons-source.svg — do not redraw.
```
