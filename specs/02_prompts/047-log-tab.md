## Task

[47] Add the Log tab: list, search, select and log, **and full chore CRUD**.

`wireframes.md` §2: *"Category defaulted to Chore (v1 scope). Pick from default + household-custom
activities. No note field, no voice input — cut deliberately. Submits as Pending."*

### Scope was corrected twice, and both corrections are the lesson

This shipped first as list + search + log-one, with creation flagged as a gap and split into `[47a]`.
The owner's instruction: **"finish each screen's or each task's feature as a whole instead of split
them to more tasks."**

That is right, and the split was wrong in a specific way. `wireframes.md` §2 says *"default **+
household-custom** activities"* — a household that cannot create a chore cannot satisfy that
sentence, so the screen was never finished, only partly built. Flagging the remainder as a future
task made an incomplete screen look complete.

`[47a]` is folded in. **A screen is the unit of work, not a control.** The mirror gap — rewards CRUD
from [29] — belongs inside the Store screen ([51]) the same way.

## Spec

### What the API does

```
GET    /api/activities?category=Chore&sort=title    → { items: [{id,title,points}], total }
GET    /api/activities?search=clean                 → filtered
GET    /api/activities?sort=nonsense                → 400 "Unknown sort field. Valid values: title, points."
POST   /api/activities   {title, points, category?} → 201 {id, title, points}
PATCH  /api/activities/{id}  {title?, points?}      → 200 {id, title, points}
DELETE /api/activities/{id}                          → 204
DELETE /api/activities/{id}  (again)                 → 404 "Chore not found."
```

`PATCH` accepts partial bodies — sending only `title` keeps the existing points, confirmed. The
editor sends both anyway, because it always has both.

`DELETE` **archives** ([17]). A hard delete would cascade to `activity_logs`, and the live
competition period is computed from approved logs — so deleting a chore mid-period would retroactively
reduce whoever logged it, and either partner can delete any chore. The second `DELETE` returning 404
confirms it is gone from the API's view.

Two things not defended against, deliberately: **duplicate titles are allowed** (two 201s for the same
name), and re-pricing is safe because `pointsAwarded` is a snapshot per log ([18]), so past logs keep
what they were worth. That snapshot is exactly why editing is safe to expose at all.

The two valid sort fields are known from the API's own 400 rather than guessed. No sort control is
built: the commit plan gives sort/filter to the Store ([51]) explicitly and not here.

### A .NET type name reached the screen, and the reasoning behind it was backwards

The owner's screenshot showed this inside the create form:

> **One or more fields are invalid.**
> • The request field is required.
> • The JSON value could not be converted to `API.Dtos.Activities.CreateActivityRequest`.
>   Path: $.points | LineNumber: 0 | BytePositionInLine: 25.

Leaving the points box empty, the first version sent `points: null` over `points: 0`, arguing that
`0` produces a confusing "must be between 1 and 2147483647" for an empty field while `null` produces
an accurate required-field error. Measured against the running API, that is exactly inverted:

| Payload | Response |
|---|---|
| `points: 0` — the one **rejected** | `{"Points":["The field Points must be between 1 and 2147483647."]}` — clean, attached to the field |
| `points: null` — the one **chosen** | `{"request":[…]}` + `{"$.points":["The JSON value could not be converted to API.Dtos…"]}` |

`points` is a non-nullable `int`, so `null` fails **JSON deserialisation** before model validation
runs. Neither returned key is a form field, so both land in the unclaimed-error list and are rendered
verbatim — which is what that list is for, and why the leak was so visible.

**The fix is not a better message.** `choreValidation.ts` mirrors the server's rules so neither
payload is ever sent. The server stays the authority for anything else, and its field errors still
render through `fieldError`.

### The interaction, after the owner rejected the first version

The first version had single-selection radio rows with an edit pencil beside each. The owner's
verdict: the rows looked like buttons but the pencil did not, and did not react to hover; the green
confirmation never disappeared; and logging several chores meant repeating the whole flow per chore.

**Tap to select, multi-select, log the lot.** The action bar counts the selection: *"Log 3 chores"*.
Selecting is a toggle button with `aria-pressed` and a **visible tick box** — `aria-pressed` alone is
invisible, and a colour change reads as "highlighted", not "ticked".

**Editing is reached without a hidden gesture.** Once exactly **one** chore is selected, the action
bar also offers **Edit** — the action appears as a consequence of something the user already did,
with nothing to know in advance. **Press-and-hold** opens the editor directly, for anyone who learns
it, but it is a shortcut **on top of** the visible path, never the only route: a gesture that is the
sole way to delete something is a feature most people never find. Edit is deliberately absent for a
multi-selection, where "edit" has no single subject. `useLongPress` cancels on a pointer move of more
than 10px — without that, every attempt to scroll the list opens an editor.

**The confirmation goes away.** Logging uses the same `useDeferredLog` window as the dashboard, so a
queued chore shows an **Undo** button and disappears when it sends. A plain notice from
create/edit/remove clears after four seconds.

**Removal asks first, and says what survives.** The server archives so approved logs keep their
points — without saying so, a user has to guess whether removing a chore costs them what they already
earned. The copy promises only the part they can observe; nothing mentions archiving.

### Structural decisions

**No wrapping `<form>` for logging.** Any row can open an editor, which is a form of its own, and
nesting forms is invalid HTML that React refuses to render. Logging is a button with a handler, which
also fixes a side effect of the old structure: pressing Enter in the search box used to submit the log.

**One `ChoreEditor` for create and edit.** Same fields, same validation, same error rendering; the
only differences are which mutation fires and whether Remove is offered. Two components would drift.

**Client errors take precedence over server errors on the same field.** The client's complaint is
about the value in the box; the server's is about a value it may no longer have.

**The prototype conflicts with the architecture, and the prototype is wrong.**
`design/prototype.dc.html` shows *All / Defaults / Custom* filter chips and a per-chore "kind" label.
Neither is implementable: [11]'s copy-on-creation gives each household its **own copies** of the
defaults, and the absence of any default-vs-custom distinction is *the feature*.
`GET /api/activities` has no such field. Not built — recorded so the next reader treats the prototype
as stale here rather than as an unmet requirement.

| File | Change |
|---|---|
| `features/activity/choreValidation.ts` + test | New. Mirrors the server's rules. |
| `features/activity/ChoreEditor.tsx` + test | New. Create, edit, remove. |
| `features/activity/useLongPress.ts` | New. The gesture shortcut. |
| `features/activity/activityApi.ts` | `activities`, `createActivity`, `updateActivity`, `deleteActivity`. |
| `pages/LogActivityPage.tsx` + test | Rebuilt for multi-select. |
| `components/ui/TextInput.tsx` | Accepts a `ref`, for focus-on-open. |
| `NewChoreForm.{tsx,test.tsx}` | Deleted — superseded by `ChoreEditor`. |

## Test requirement

The previous version's test **passed while the defect was on screen**, and avoiding that repeat is
the point of this section. It asserted the *wire payload* — `expect(sent.points).toBeNull()` —
against a **fabricated** 400 body written by hand, which was the well-formed validation envelope
rather than the deserialisation failure the server actually returns for that payload. It confirmed
intent and never checked the outcome. So:

1. **Every invalid draft asserts on the fetch spy that no request goes out.** "Shows an error" and
   "did not call the server" are different claims, and only the second prevents the leak. Empty
   points, zero points, negative points, blank title, over-long title.
2. **Fixtures are captured from the running API**, never hand-written. A double more forgiving than
   the real thing is how the leak survived.
3. `choreValidation` — the rules directly, including the branch a `type="number"` input can never
   reach from the DOM (non-numeric text: the browser refuses it, so the value stays empty and the
   missing-value error fires instead).
4. **`ChoreEditor`** covers create and edit from one component: pre-filled on open, `PATCH` on save,
   remove behind a confirmation, and the confirmation copy naming what survives.
5. **`useLongPress`**: the 500ms threshold from both sides, the 10px tolerance at 10px **and** 11px on
   both axes, distance measured **from the origin rather than the previous move** (three 5px steps
   must cancel), and the flag that stops a hold from also toggling the selection.
6. **`LogActivityPage`** multi-select: the action bar counts, Edit appears at exactly one selection
   and disappears at two, the tick is present in the DOM and not merely `aria-pressed`, and a queued
   chore offers Undo.
7. **No nested form** — a create disclosure inside the logging form is invalid HTML that React
   refuses to render, and it was introduced twice.

Then a live pass against the running API reproducing the owner's exact input (title filled, points
box empty) and confirming **0 requests sent** and no `API.Dtos…` on screen; plus create, rename,
re-price, remove with confirmation, and logging two chores at once.
