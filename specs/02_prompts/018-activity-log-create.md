## Task

[19] Add activity log create endpoint: `POST /api/activity-logs`.

## Spec

From `api-design.md`:

```
POST /api/activity-logs
{ "activityId": 3 }
→ 201 { "id": 90, "activityId": 3, "status": "Pending", "completedAt": "2026-07-29T09:15:00Z" }
```

Minimal body by design: `project-plan.md` cut the note field, and there is no date picker, so the
only thing a client chooses is which chore was done.

### The points snapshot — the issue carried over from task [18]

Log `017` flagged that `PATCH /api/activities/{id}` can change a chore's `Points`, and that a log
carrying no record of its own value is therefore re-valued retroactively. Log twenty chores at 10
points, edit the chore to 999, and every unsettled log inflates. This task owns the fix because it
is the task that creates logs.

**`ActivityLog` gains `PointsAwarded`, captured from `Activity.Points` at log time.**

Why that is the right shape rather than reading through the navigation at settlement:

- A log is a record of something that happened. What the chore was worth _then_ is part of what
  happened, and re-deriving it later from a mutable row means the past can change.
- It closes the same class of hole as archiving did in [18]. There, one partner could shrink the
  other's standing by removing a chore; here, either partner could inflate their own by editing one
  upward after logging. Both are edits to the catalog rewriting a competition already in progress.
- It is the ordinary approach for anything priced at a point in time — an invoice line does not
  re-price itself when the catalogue changes.

`LifetimePoints` is unaffected either way, since it is incremented at approval and stored. The
exposure is the live competition period, which task [23] computes from logs.

Task [21] (approve) will therefore award `log.PointsAwarded`, not `log.Activity.Points`, and task
[23] will sum the same column. Both are noted here so neither reaches for the navigation.

### Rules

| Condition                                 | Response                                                |
| ----------------------------------------- | ------------------------------------------------------- |
| Not authenticated                         | 401                                                     |
| Caller has no household                   | 409                                                     |
| Activity is not in the caller's household | 404                                                     |
| **Activity is archived**                  | 404 — a chore removed from the catalog cannot be logged |
| Otherwise                                 | 201, status `Pending`, `completedAt` = now (UTC)        |

Archived chores are rejected for the same reason they are hidden from the catalog: they are no
longer offered. Their existing logs stay readable — that is the point of archiving — but no new
ones can be attached.

### No duplicate guard, deliberately

Nothing stops a partner logging the same chore repeatedly. That is correct: doing the dishes twice
in a day is normal, and the actual defence against inflation is **peer approval** — every log needs
the other partner's sign-off before it earns anything. A rate limit here would penalise honest use
while doing nothing the approval step does not already do.

### Enums must serialise as strings

`api-design.md` shows `"status": "Pending"`. System.Text.Json emits enums as numbers by default, so
this would otherwise be `"status": 0`. A `JsonStringEnumConverter` is registered globally rather than
mapped per-DTO, since tasks [20] and [21] return the same status and `ActivityCategory` has the same
problem on input.

## Test requirement

**`ActivityLogServiceTests`**:

1. Creates a log for the caller, status `Pending`, attached to the right activity.
2. `CompletedAt` is set server-side, in UTC.
3. **`PointsAwarded` snapshots the activity's points at log time.**
4. **Editing the chore's points afterwards does not change the existing log** — the headline fix,
   and the assertion that would fail if settlement were left reading through the navigation.
5. Logging another household's chore returns `ActivityNotFound`, and writes nothing.
6. **Logging an archived chore returns `ActivityNotFound`.**
7. A caller with no household is rejected.
8. The same chore can be logged repeatedly — peer approval is the guard, not a uniqueness rule.
9. **Archiving a chore leaves its existing logs readable, with their points intact** — the
   follow-up task [18] left for this task, replacing the now-obsolete cascade check.

Then end-to-end against the running API and real PostgreSQL, including `"status": "Pending"`
arriving as a string rather than `0`.
