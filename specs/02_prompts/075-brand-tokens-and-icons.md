## Task

[75] Implement the decided icon system from `01_architecture/UI/BRAND-ICONS.md`: `marks.tsx` becomes
`icons.tsx` — three currency marks, twenty UI icons, twelve badge motifs and a padlock, with every
path taken **verbatim** from `icons-source.svg`. Two decorative tokens are added, every import is
migrated, and `lucide-react` is removed entirely.

The design brief numbers these tasks [64][65][66]; those numbers were long since taken, so they land
as [75][76][77]. Its stated test bar was stale as well and is reconciled here.

## Decisions

**1. `icons.tsx` is a transcription, not a drawing.** The sprite is the source of truth. Paths are
copied, not redrawn to look similar — because "looks similar" has no failure condition and drifts one
tweak at a time.

**2. The fidelity test parses the sprite from disk.** `icons.test.tsx` reads `icons-source.svg` at
test time and compares path data against the components. This is the house pattern for rules that
live in what is *not* written: the same shape as the token test parsing the stylesheet, and the
coverage test scanning query call sites. A hand-written copy of the expected paths would be a second
transcription and would drift with the first.

**3. `lucide-react` is removed, not merely unused.** It is a rounded-cap line set and it reads as a
different language beside flat hand-cut marks — the two together looked like an unfinished migration.
Removing the dependency also protects the zero-vulnerability property rather than merely not adding
to it. The test asserts the absence.

**4. Owner overrides are documented in place and exempt by construction.** The tug bar's divider is a
sharp bolt that is **not** in the sprite — an owner decision taken while looking at the running app.
It is exempt from the fidelity test because it has no source path, and that exemption is written next
to it rather than left as a silent gap in coverage.

**5. Badge motifs carry literal colours; the currency marks do not.** A badge is a small illustration
and its colours are part of the drawing. A currency mark has to sit on many different surfaces, so it
takes its fill from a token. Two decorative tokens (`--deco-red`, `--deco-blue`) are added for the
collector rosette, because the semantic palette cannot supply them without either borrowing a meaning
or breaking "yellow means Coins".

**6. The badge-id → motif lookup is presentation only.** What a badge *means* stays with the server's
name and criteria. The client picks a picture; it does not define the achievement.

## Test requirement

1. Every mark, icon and motif's path data matches `icons-source.svg`, parsed from disk. Deliberately
   corrupt one path in the component and confirm it goes red.
2. The sprite parser itself has a guard — assert it found more than a handful of paths, or a change
   to the sprite's structure turns the whole file into a vacuous pass.
3. `lucide-react` appears in no import and in no `package.json` — asserted by scanning the source.
4. Documented owner overrides are the **only** exemptions, and each carries a reason.
5. Every previously-imported icon still renders at its call sites; no screen loses a glyph.
