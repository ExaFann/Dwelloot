## Task

[46] Add the dashboard's quick log, each partner's recent chores, and player avatars.

`wireframes.md` §1: *"quick 'Log activity' button, a row of common default chores for one-tap
logging, and a recent activity feed."* Avatars were added to that list by the owner while reviewing
this task.

**Scope note.** This began as "quick-add row and recent activity feed", with avatars split out as
`[46a]`. The owner's correction — *finish each screen's feature as a whole rather than splitting it
across tasks* — folds `[46a]` back in. A screen is the unit of work.

## Spec

### What the API gives, and the two traps in it

**`pointsAwarded` is what a chore is *worth*, not what you got.** It is populated on every log
regardless of outcome — the snapshot column from `[18]`, copied at write time so editing a chore
later cannot re-value old logs. Observed directly: an `Approved` 10 earned 10, a `Pending` 25 earned
**0 — not yet**, a `Rejected` 5 earned **0 — never**. The obvious rendering, `+{pointsAwarded}` on
every row, tells the user they earned 25 points they do not have and 5 they never will.

`describeLogPoints` therefore takes the **status**, so there is no call signature that produces a
bare number. A pending chore reads `(25)`, a rejected one `—`.

**Logging does not move the score, so it must not invalidate `Competition`.** Measured: with one
approved 10-point log and one pending 25-point log, `competitions/current` still reported
`myPoints: 10`. Points come only from *approved* logs. `createActivityLog` invalidates `ActivityLog`
and deliberately **not** `Competition` — invalidating it would refetch a standing that cannot have
changed, and that endpoint runs lazy settlement on every call, so it would be real server work for a
guaranteed no-op. The standing moves when the *partner approves*, which is [48]'s invalidation.

**The partner's history is fetchable, which `api-design.md` hides.** `GET /api/activity-logs`'s
`status` filter is **optional**. The quick reference documents the path as `?status=pending`, which
reads as though pending is all it returns. Omitting the filter returns every status, and the endpoint
already excludes the caller's own logs. That is what makes *"recent chores under each avatar"*
possible for **both** people: `/mine` for one side, `/api/activity-logs` for the other.

**There is no way to delete a logged chore.** `/api/activity-logs` offers `GET`, `GET /mine`, `POST`,
`PATCH /approve`, `PATCH /reject`, `POST /bulk-approve`. **No `DELETE`.** Once a log exists only the
partner can remove it, by rejecting it. This decides the whole undo design.

### The first version was rejected, and the redesign is the spec

Built first as a column of identical full-width buttons with a points badge on each, plus a separate
"Your recent chores" card at the bottom of the page. The owner's verdict: the rows felt oppressive
(*"一行一行地列着，给人一种压抑的感觉"*), nothing like the "playful geometric" direction; the points
wasted width; a double tap produced two logs with no way back; and the recent feed sat too far from
the score it explains.

**Bricks, not rows.** Each tile is sized by its own text, they wrap, and each carries a small
deterministic tilt — the same chore always leans the same way — which reads as stacked rather than
aligned. Hovering straightens the tile, which is what makes it feel picked up. **Points are gone from
the tiles**; they cost a line of width each and turned a wall of names into a price list. They stay
on the Log tab, where choosing a chore is deliberate.

**The wall needs a packing order.** Alphabetically, long titles sit beside long titles and no two
tiles fit a 375px row — 12 tiles take 12 rows, which is the list it was meant to replace.
`interleaveBySize` alternates longest with shortest so every row gets one wide brick and one narrow
one. Deterministic, so tiles never jump between renders.

**Undo, which has to mean "not sent yet".** Since there is no `DELETE`, undo cannot mean "remove what
was sent". `useDeferredLog` queues a tap and fires the request after five seconds; undo cancels the
timer and nothing ever reaches the server. One mechanism, two problems solved: undo works without a
backend change, and **a double tap cannot double-log** — a chore already queued ignores further taps.
Anything still queued at unmount is **sent immediately** rather than dropped: the user tapped it, and
silently discarding a chore they believe they logged is the one outcome with no recovery.

**Recent chores move under the avatars.** Four each, scrolling, inside the head-to-head card — beside
the score they explain rather than two sections below it. The standalone card goes.

**Avatars are generated on the client, not uploaded** — the owner's decision. `Avatar` takes **only**
`userId` and `name`; the fill comes from the player role, the initials from the name, and a corner
motif from the id. Nothing is stored and it renders offline. That signature is the deliverable:
`[64a]` adds real uploads as a backend-first change, and because callers pass only an id and a name
it lands inside `Avatar.tsx` and touches no call site, with the generated mark as the fallback.

**Colour is by role, identity is by initials and motif.** Purple is you, green is your opponent, so
colour cannot also distinguish two people. The motif covers the case initials cannot — two partners
sharing a first letter. One real edge case: `name` is user-supplied and the backend **stores text
verbatim** ([32]), so `name[0]` would slice a surrogate pair in half.

### Owner's other review notes, to be applied here

- **Purple and green are the player colours; the opponent is green.** This fixes more than it changes:
  yellow had been carrying *three* meanings — "the other player", "pending", and "Coins/loot". It now
  carries only the last two. Recorded as a rule in `design-tokens.md` §2.1, including the deliberate
  overlap with green-as-approval (the two never share a component).
- **A spark on the tug bar's divider**, at the **colour boundary** rather than the fixed midpoint —
  that is where the two sides meet, and it travels as someone pulls ahead. Live periods only.
- **The 3D press is too heavy.** A 4px shadow under a full-width row is a 4px black band the width of
  the screen; five stacked read as a striped page. Add `pressable-sm` (rests 2px, presses to 0) for
  list rows; standalone buttons keep 4px. Offset scales with the element.

| File | Change |
|---|---|
| `features/activity/useDeferredLog.ts` + test | The undo window. |
| `features/activity/tileOrder.ts` + test | The brick packing. |
| `features/activity/QuickLogTiles.tsx` | Replaces `QuickAddRow`. |
| `features/activity/RecentChoresColumn.tsx` | Replaces `RecentActivityFeed`. |
| `features/activity/logDisplay.ts` + test | `describeLogPoints`, `relativeTime`. |
| `features/activity/activityApi.ts` | `partnerActivityLogs`, `createActivityLog`. |
| `features/competition/HeadToHeadCard.tsx` | Avatars, spark, recent-chore columns. |
| `components/ui/Avatar.tsx`, `avatarIdentity.ts` + test | New. |
| `pages/DashboardPage.tsx` | Rebuilt. |
| `QuickAddRow.tsx`, `RecentActivityFeed.tsx`, `dashboardActivity.test.tsx` | Deleted. |

## Test requirement

The undo window is the load-bearing piece — it is the only protection against a write that cannot be
undone — so it gets the most attention.

1. **`useDeferredLog`.** A tap queues and **does not send**, asserted by advancing time *inside* the
   window rather than by checking synchronously. It sends when the window closes (4999ms vs 5000ms).
   Undo cancels entirely and nothing ever reaches the server — asserted **on the fetch spy**, since
   "shows no row" and "sent nothing" are different claims. A double tap on the same chore logs
   **once**. Two different chores queue independently. **Anything queued at unmount is flushed**, not
   dropped.
2. **`describeLogPoints`, in all three directions.** `+10` for approved; `(25)` for pending with the
   bare `+25` **absent**; no number at all for rejected. Asserting only the positive case would pass
   against a component that always printed the number.
3. **`tileOrder.interleaveBySize`** is deterministic for a given input and alternates long with short.
   Row counts measured on the rendered wall with **`offsetTop`, never `getBoundingClientRect().top`**
   — the tiles carry a `rotate`, and rotation moves the bounding box, so a bounding-box measurement
   reports a row count that is simply wrong.
4. **`avatarIdentity`** handles a surrogate-pair first character (`🦊 Fox`, `𝒜lice`) without slicing
   it in half, and gives two partners sharing an initial different motifs.
5. **`createActivityLog` invalidates `ActivityLog` and not `Competition`** — the tag list is asserted,
   because the wrong invalidation is invisible in the UI and costs a settlement round trip.
6. **`routes.test.tsx`'s `fetch` stub must answer by path.** This task gives the dashboard its own
   queries; a catch-all that returns the `/me` body for every path will crash the tree somewhere
   unrelated and appear as a flake, because the `h1` under assertion is static markup.

Then a live pass against the running API with two real accounts: triple-tap one tile and confirm
**one** queued row; undo and wait past the window, confirming nothing was sent; tap and wait past the
window, confirming the POST landed; and read the brick wall's row counts at 375px and 1280px.
