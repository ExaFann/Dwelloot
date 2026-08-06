## Task

The Notices tab, all three sections. `wireframes.md` §3:

> Three sections, most to least urgent:
> 1. Pending logs from the partner — select-all / bulk approve, plus individual reject with a required reason.
> 2. Partner's recent redemptions and achievements — highlighted, meant to spark competitive awareness.
> 3. The user's own logs the partner has approved — lighter weight, smaller text, informational only.

**Merged from three plan tasks**, following the owner's correction during [47]: *finish each screen's
feature as a whole rather than splitting it across tasks.* [48]/[49]/[50] are three sections of one
screen, and shipping one of them would leave the same "looks finished, is not" problem that got [46]
and [47] rejected. Recorded in the commit plan.

---

## What the API actually does

### The queue

```
GET /api/activity-logs?status=pending
→ { "items": [ { "id": 39, "activityTitle": "Vacuum", "pointsAwarded": 15,
                 "loggedByUserId": 80, "status": "Pending", "completedAt": "…" } ], "total": n }
```

Always the *partner's* logs — the endpoint excludes the caller's own by construction, which is the
first of the three layers of "no self-approval" (handover §4.4).

### Bulk approve is a **partial-success** endpoint, and `api-design.md` understates it

Documented as `→ 200 { "approved": [90, 91] }`. The real shape carries a second array:

| Call | Response |
|---|---|
| Two valid pending ids | `{"approved":[30,28],"skipped":[]}` |
| The same two again | `{"approved":[],"skipped":[{"id":30,"reason":"NotPending"},{"id":28,"reason":"NotPending"}]}` |
| One valid + one nonexistent | `{"approved":[32],"skipped":[{"id":999999,"reason":"LogNotFound"}]}` |
| Empty list | **400** `{"Ids":["…minimum length of '1'."]}` |

**Every one of those is HTTP 200.** A UI that reports "Approved 2 chores" after sending two ids is
guessing, and will be wrong whenever the partner approved something from their own device a moment
earlier — which in a two-person app is not a rare race, it is the normal one. The count comes from
`approved.length`, and a non-empty `skipped` is reported rather than swallowed.

`NotPending` is the interesting reason: it means *someone already dealt with this*. That is worth
different wording from `LogNotFound`.

### Approving **does** move the standing

Confirmed by measurement: `partnerPoints` went 0 → 10 immediately after approving a log inside the
current period.

This is the counterpart to [46]'s finding. Creating a log is `Pending` and cannot change the score, so
it invalidates only `ActivityLog`. **Approving turns a pending log into points**, so approve, reject
and bulk-approve all invalidate `Competition` as well — this is the invalidation [46] deferred here.

Not `Me`: points go to the *logger*, and the approver is the other person, so the approver's
`lifetimePoints` is unchanged.

### Reject needs a real reason

```
PATCH /api/activity-logs/{id}/reject  {"reason":"  "}
→ 400 {"Reason":["The Reason field is required.",
                 "Reason must contain at least one visible character and be at most 200 characters…"]}
```

Trimmed server-side, capped at 200. Validated client-side for the same reason as [47]'s chore form —
the round trip adds nothing when the rule is knowable up front.

### The 403 exists but should be unreachable

`PATCH /api/activity-logs/{id}/approve` on your own log returns **403** *"You cannot approve or reject
a chore you logged yourself."* The queue never lists your own logs, so the UI cannot offer it. Handled
anyway, because it is one of only two deliberate 403s in the API (§3.4) and a stale cache could in
principle produce it.

### Sections 2 and 3

```
GET /api/redemptions?scope=household&excludeMine=true
→ { items: [ { id, userId, rewardId, rewardTitle, coinsSpent, redeemedAt } ], total }

GET /api/activity-logs/mine?status=approved
→ { items: [ { id, activityTitle, pointsAwarded, status, completedAt, approvedAt, rejectReason } ], total }
```

`coinsSpent` is a **snapshot** (§4.3) — what was actually paid, not the reward's current price. The
feed must show it as-is; recomputing from the catalogue is the exact drift that column exists to
prevent.

---

## Decisions

**1. The same selection pattern as [47].** Tap a row to select, multi-select, and a counted action in
the sticky bar — *"Approve 3"*. A user who has learned the Log tab already knows this screen. Reject
appears when exactly one row is selected, for the same reason Edit does there: it needs a single
subject, and it needs a reason typed against it.

**2. Bulk approve reports what actually happened**, not what was requested. `skipped` entries with
`NotPending` become *"2 were already dealt with"* — because in a two-person app the most likely cause
is the partner acting from their own device, which is information, not an error.

**3. Section 2 highlights, section 3 whispers.** The wireframe asks for exactly that. The partner's
redemptions carry the opponent's green and their avatar; your own approved logs are small, muted, and
have no actions at all.

**4. Empty states are per-section**, and the top one is the good news: *"Nothing waiting on you."*

---

## Test requirement

1. **The queue lists the partner's logs**, with what each is worth.
2. **Selection and the counted action** — both directions, including that Reject is absent for a
   multi-selection.
3. **Bulk approve sends the selected ids** — the ones chosen, not the first N.
4. **A partial success is reported honestly.** Given `{"approved":[1],"skipped":[{"id":2,"reason":"NotPending"}]}`,
   the UI must not claim two. This is the finding above, and it is the assertion that would fail
   against a UI that counted its own request.
5. **Reject requires a reason** — nothing sent for a blank one, asserted on the fetch spy.
6. **Approving invalidates `Competition`** — asserted as a *refetch*, since that is the observable.
7. Sections 2 and 3 render their shapes and their empty states.

Then a live pass with both accounts.

