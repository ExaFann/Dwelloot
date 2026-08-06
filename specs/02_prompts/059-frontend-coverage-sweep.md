## Task

[59] Fill remaining frontend test gaps: sweep for components and hooks not yet covered.

**As revised.** The original task was "add frontend unit tests", which put the harness itself at [59]
and left [40]–[58] with no way to assert anything — retrofitting tests onto finished code, which
inverts the spec-then-test loop the backend was built with. **Vitest moved forward into [39]**, so
this becomes the coverage sweep its backend counterpart [36] was.

## Spec

**Measured first, then targeted** — the point is untested *behaviour*, not a percentage. This
project's standing rule is that a check which cannot fail is worse than no check, so a sweep that
pads numbers would be the opposite of the job.

`npm run coverage`, before any change:

```
statements 91.35%   branches 90.14%   functions 86.74%   lines 92.42%
```

The gaps that matter, ranked by what a bug there would cost:

| File | stmt | br | Why it matters |
|---|---|---|---|
| `QuickLogTiles.tsx` | 33% | 57% | Owns the **undo window** — the only protection against a write that cannot be undone |
| `useLongPress.ts` | 71% | 37.5% | The 10px cancel; if it breaks, every scroll opens an editor |
| `RecentChoresColumn.tsx` | 50% | 12.5% | Where "pending points are not earned" reaches a screen |
| `InviteCodeCard.tsx` | 28.6% | 50% | The clipboard refusal branch — the whole reason the code is selectable text |
| `RouteError.tsx` | **0%** | 0% | The component that appears when everything else has failed |
| `PagePlaceholder.tsx` | **0%** | — | — |
| `App.tsx` | **0%** | — | — |

### Two of those gaps are answered by deleting code, not testing it

**`PagePlaceholder.tsx` — delete.** Zero references: every screen is real now, so the placeholder
that stood in for them is dead. A sweep that wrote it a test would have locked in a component nobody
renders.

**`quickAddActivities` — delete.** A `?pageSize=5` query for the dashboard's original quick-add row.
[46] replaced that row with the tile wall, which reads the whole catalogue through `activities`, and
left this behind with no caller. Two ways to fetch chores is one to pick by accident.

**`approveLog` — keep and flag.** Also uncalled — the queue sends every decision through
`bulkApprove`, even a single row — but it binds a real documented endpoint rather than being
superseded work, and the invalidation reasoning on it is the record of what [48] measured. Named in
the file rather than removed.

### `App.tsx` is deliberately not tested

It is `RouterProvider` plus `useThemeEffect`, both covered where they live. A test here would assert
that a component renders its own children, which is the shape of a check that cannot fail. Left at
0% on purpose, and said so rather than padded.

## Test requirement

Four new files, and **every load-bearing constant gets mutation-tested** — that is what separates
this sweep from a percentage exercise.

1. **`useLongPress`** — the rules log `047` recorded as unverified. The 500ms threshold from both
   sides; the tolerance at 10px **and** 11px on both axes; that distance is measured **from the origin
   rather than the previous move**, so three 5px steps must cancel; release, cancel and leave; and the
   `consumedRef` flag that stops a hold from also toggling the selection.
   *Mutation:* `MOVE_TOLERANCE` 10 → 100 must fail.

2. **`QuickLogTiles`** — the wall, the empty and error states, and the undo window: queued-not-sent,
   sent when the window closes (4999ms vs 5000ms), undo cancelling entirely, a double tap logging
   once, two chores queued independently.
   *Mutation:* `UNDO_WINDOW_MS` 5000 → **0** must fail. An assertion placed synchronously after the
   tap survives that mutation, because `setTimeout(fn, 0)` still defers past a synchronous check — it
   would be testing "not sent *synchronously*", not "there is a window". The claim is that a window
   exists, so the test must **advance 1000ms** and then assert nothing has gone out.

3. **`RouteError`** — driven **through a router that really throws**, not by rendering the component
   directly: "the app shows a blank page on a render error" is the failure it exists to prevent, so
   the test has to prove the router reaches it. Include a thrown non-`Error`.

4. **`InviteCodeCard`** — the copy path and, more importantly, the **refusal**: code still on screen,
   no false "copied" confirmation.

5. **`RecentChoresColumn`** — the three status branches asserted in **both directions**: `+15` for
   approved; `(15)` for pending with `+15` **absent**; no number at all for rejected.

### Harness traps to expect, because each one looks like a product bug

- **Fake timers stall RTK Query.** `vi.useFakeTimers()` at the top of a test stops the initial
  `/api/activities` request ever settling, and every undo test times out. Load on **real** timers and
  switch to fake ones only for the window.
- **`userEvent` binds to a timer implementation at setup**, so it cannot straddle that switch. Use
  `fireEvent` in those tests.
- **`userEvent.setup()` installs its own `navigator.clipboard`**, silently replacing the stub under
  test in `InviteCodeCard` — `writeText` is never called and the failure reads as a component bug.
  `fireEvent` there too.
- **A test that is correct but too slow is still a flake.** Typing 61 characters one key at a time,
  each with a React re-render, exceeds the timeout under `--coverage` instrumentation only. Paste
  instead — a real user action exercising the same handler.

Finish with two consecutive clean full-suite runs, and report the coverage delta alongside a plain
statement that **coverage is not correctness**.
