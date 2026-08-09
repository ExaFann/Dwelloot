## Task

[21] Add activity log approve/reject endpoints: `PATCH .../approve`, `PATCH .../reject`.

## Spec

From `api-design.md`:

```
PATCH /api/activity-logs/90/approve
→ 200 { "id": 90, "status": "Approved", "approvedAt": "2026-07-29T10:00:00Z" }

PATCH /api/activity-logs/90/reject
{ "reason": "Not actually done yet" }
→ 200 { "id": 90, "status": "Rejected" }
```

Both are "the other partner only".

### Approving is where Points are actually awarded

`project-plan.md`: "Approved logs award **Points** (contribution measure, never spent)." Nothing
else in the plan increments `users.lifetime_points` — [23] settles competitions, [26] handles
streaks and badges — so approval is where it happens, and this task owns it.

Two details that are easy to get backwards:

- The points go to **`log.LoggedByUserId`**, the person who did the chore — not to the approver.
- The amount is **`log.PointsAwarded`**, the snapshot from task [19], not `log.Activity.Points`.
  Reading through the navigation would reintroduce exactly the retroactive re-valuation that
  snapshot exists to prevent.

### No self-approval, enforced as an action this time

Task [20] keeps your own logs out of the approval queue, so the button is never offered. That is not
the same as refusing the action: a client can `PATCH` any id it likes. This task refuses it.

**403, not 404.** Elsewhere in this API an inaccessible resource returns 404 so ids cannot be
enumerated — but that reasoning does not apply here. The caller created this log; they already know
it exists, and pretending otherwise would be confusing rather than protective. A log in _another
household_ still returns 404, because that one genuinely is about hiding existence.

Behind both sits the database check constraint from task [6]. Three layers for one rule, each doing
a different job: the queue never offers it, the endpoint refuses it, and the storage layer cannot
persist it whatever code reaches there.

### Only Pending logs can be decided

Approving an already-approved log would award its points a second time, so status is checked. A
**rejected** log also cannot be approved: reconsideration is not a flow in v1, and the logger can
simply log the chore again. Simpler than an un-reject path, and it keeps every log's history
single-directional.

### The double-click problem

Checking `Status == Pending` and then writing leaves a window where two concurrent requests both
see Pending and both award points. Unlike most races in this app, this one is plausible: it is a
double-click on the approve button, not two people acting in the same millisecond.

`Status` is therefore marked an EF **concurrency token**, the same trick that closed the join race
in task [15]. The second write finds no row with the original status and fails, which the service
turns into a 409 rather than a duplicate award. Expected to need no migration — a concurrency token
on an existing column only adds it to the `WHERE` clause — but that gets checked rather than
assumed.

### Reject

Reason is required and capped at `ActivityLog.RejectReasonMaxLength` (200), matching
`wireframes.md`'s "individual reject with a required reason". Rejecting awards no points and leaves
`ApprovedByUserId` null, per log `005`: in a two-person household the rejecter is always the partner
who did not log it, so recording it separately would be redundant.

### One divergence from `api-design.md`

The reject response is documented as `{ "id": 90, "status": "Rejected" }` while approve returns an
`approvedAt`. Rather than two response types differing by one field, a single record with a nullable
`approvedAt` is used, so reject returns `"approvedAt": null`. Additive, and it means a client parses
one shape for both outcomes.

## Test requirement

**`ActivityLogDecisionTests`**:

1. Approve sets status, `ApprovedByUserId` and `ApprovedAt`.
2. **Approve credits the logger's `LifetimePoints`, not the approver's** — the pair of assertions
   that catches crediting the wrong person, which a single-user fixture cannot.
3. Approve credits `PointsAwarded`, not the chore's current points — asserted after editing the
   chore.
4. **A partner cannot approve their own log**, and nothing is written.
5. A log in another household returns `LogNotFound`.
6. **Approving twice awards points once** — the double-click case.
7. An already-rejected log cannot be approved.
8. Reject sets status and reason, and **awards no points**.
9. Reject leaves `ApprovedByUserId` null.
10. A partner cannot reject their own log.
11. A log whose chore has been archived can still be approved — the work predates the removal.
12. Rejecting an already-decided log is refused.

Then end-to-end against real PostgreSQL with two accounts, including the self-approval 403 and the
`LifetimePoints` change visible through `GET /api/auth/me`.
