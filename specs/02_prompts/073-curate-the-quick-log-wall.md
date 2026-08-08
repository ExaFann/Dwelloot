> **Reconstructed.** See the note in [`068-store-change-approval.md`](068-store-change-approval.md)
> — this file was written up from the task ledger after the task was built.

## Task

[73] `activities.is_quick` — which chores appear on the dashboard's quick-log wall. Filterable via
`GET /api/activities?isQuick=`, settable on create and patch, with a tick box in the chore editor and
a **Choose** manager beside the wall itself.

The wall was asking for the whole catalogue and rendering whatever came back, capped only by the
default page size. Thirty chores gave thirty tiles and no way to thin them.

## Decisions

**1. A household-shared column, not a per-device preference.** Both partners see one wall. Browser
storage would let them disagree about what the household considers routine, and lose it on a new
phone. This is shared state about the household, not a UI preference.

**2. Defaults to true, and the migration backfills true.** Starting empty and making everyone opt in
would empty the dashboard of every existing household on deploy — a regression dressed as a feature.
What is new is the ability to take a chore *off*.

**3. All three query states are honoured.** `null` is no filter, `true` is the wall, `false` is the
complement. Accepting `false` and quietly ignoring it would hand back the whole catalogue to a client
that asked for the opposite, with nothing in the reply to say so.

**4. `IsQuick` is on the create request too**, not just patch. The tick box appears on the create
form, and a control that cannot affect the outcome is worse than no control.

**5. The Log tab still lists everything.** A chore off the wall is still loggable from there — the
wall is a shortlist, not a scope.

**6. A visible way to curate it.** The owner's point, and it is right: the tick box inside the editor
means curating the wall requires knowing that editing a chore is how you do it. A **Choose** control
sits beside the wall, where the thing being curated actually is.

## The sync bug this task found — and the rule that came out of it

One partner taking a chore off the wall left the other's dashboard unchanged, while the other's
*editor* showed the new value. Two views of one household disagreeing, which is worse than both being
stale.

The cause was mine: `liveSync.ts` exempted the catalogue queries because *"only this user can change
them"*. **That is false** — both partners have chore CRUD, and both have reward CRUD. An audit of the
whole query surface found the same defect in four more places.

**The real test is not "who owns this data" but "can anything the other person does alter this
answer?"** In a two-person shared household, almost everything qualifies. That question is now the
one the coverage test asks, and every exemption has to carry a written reason.

## Test requirement

1. The migration backfills existing rows to **true** — assert on a row created before it.
2. `?isQuick=true`, `false` and omitted each return a different set. Assert all three; two of them
   agreeing is how the `false` case would slip through.
3. `IsQuick` is honoured on **create** as well as patch.
4. The dashboard wall requests `isQuick=true`; the Log tab does not filter.
5. Both the editor tick box and the Choose manager write the same field.
6. `liveSyncCoverage.test.ts` — the catalogue queries are no longer exempt, and every remaining
   exemption has a reason recorded beside it.
