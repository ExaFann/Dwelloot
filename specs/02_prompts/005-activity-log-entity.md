## Task

[6] Add ActivityLog entity: class + EF configuration, including the
`ApprovedByUserId ≠ LoggedByUserId` constraint expressed at the application level (documented in a
code comment referencing `er-diagram-1`).

## Spec

Source material: `relational-model.md`
(`activity_logs(id, status, completed_at, approved_at, reject_reason, *activity_id,
*logged_by_user_id, *approved_by_user_id)`), `er-diagram-1-household-activity.svg`,
`api-design.md` (the log/approve/reject/queue endpoints), `wireframes.md` screen 3, and
`project-plan.md`'s peer-approval rules.

### Entity

`API/Entities/ActivityLog.cs`:

| Property                          | Type                | Notes                                                                                                                                                     |
| --------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Id`                              | `int`               | Surrogate PK.                                                                                                                                             |
| `ActivityId` / `Activity`         | `int` / nav         | Which chore was done. Supplies `activityTitle` in API responses.                                                                                          |
| `LoggedByUserId` / `LoggedBy`     | `int` / nav         | Who did it.                                                                                                                                               |
| `ApprovedByUserId` / `ApprovedBy` | `int?` / nav        | The partner who approved. Null while pending.                                                                                                             |
| `Status`                          | `ActivityLogStatus` | Enum → string, mirroring `Activity.Category`.                                                                                                             |
| `CompletedAt`                     | `DateTime`          | Set server-side at creation.                                                                                                                              |
| `ApprovedAt`                      | `DateTime?`         | Null until approved.                                                                                                                                      |
| `RejectReason`                    | `string?`           | Max 200. Required _when rejecting_ — `wireframes.md` calls it a required reason — but nullable in the schema because it is absent for every other status. |

No `Note` field: `project-plan.md` cut it deliberately ("partners living together can just talk
to each other").

### `ApprovedByUserId` stays null on rejection

The column is named for approval and is only populated on approve. Nothing records who _rejected_
a log, and nothing needs to: a household is exactly two people, so the rejecter is always "the
partner who did not log it" and is derivable from `LoggedByUserId`. Adding a `RejectedByUserId`
that could only ever hold one derivable value would be redundant, and it would give the
"must differ" rule a second column to be checked against.

### The no-self-approval rule

This is the single most important integrity rule in the app: the whole competition is meaningless
if a partner can approve their own logs. Per `er-diagram-1-household-activity.svg`, the `approves`
relationship is a distinct edge from `logs`, and `relational-model.md` states
`approved_by_user_id must ≠ logged_by_user_id`.

The task calls for this **at the application level**, which is where the real enforcement goes —
the approve/reject endpoints in task [21], and bulk-approve in [22], which must reject an attempt
with a proper API error rather than a database exception. A code comment on the entity records the
rule and points at `er-diagram-1`.

**Additionally**, a database check constraint is added as a backstop:

```
CHECK (approved_by_user_id IS NULL OR approved_by_user_id <> logged_by_user_id)
```

This goes beyond what the task asked for, so the reasoning matters. The max-2-members rule is
application-level because a `CHECK` counting related rows is not portable — that argument does not
apply here. This is a plain row-level comparison of two columns in the same row, portable across
every SQL engine, and it costs nothing. Given the rule's importance, having the storage layer
refuse to persist a self-approval regardless of which code path reaches it is worth the four extra
words. Same reasoning as the `points > 0` constraint in task [5]. The `IS NULL` branch is required
so pending and rejected rows remain legal.

### Delete behaviours

Three foreign keys, and the choices differ:

- **`ActivityId` → `activities`: Cascade.** Forced by the delete graph as much as chosen: a
  household cascades to its activities (task [5]), so if logs restricted deletion of an activity,
  deleting a household would fail on its own cascade. The consequence is that deleting a chore
  also deletes its history — acceptable because nothing derived is lost. `LifetimePoints` is a
  stored running total, and settled competitions persist their own results, so removing old logs
  cannot retroactively change anyone's score or rewrite a past competition. What is lost is the
  audit trail in the Notices feed. Task [18], which owns `DELETE /api/activities/{id}`, should
  surface that before deleting a chore that has been logged.
- **`LoggedByUserId` → `users`: Restrict.**
- **`ApprovedByUserId` → `users`: Restrict.**

Restrict on both because v1 has no user-deletion flow at all — leaving a household sets
`household_id` to null (task [4]) and does not delete the person. Restrict makes that explicit: if
account deletion is ever added it has to decide, deliberately, what happens to logged and approved
history, instead of inheriting a silent cascade that quietly erases the other partner's approval
record too.

### Index

One composite index on `(logged_by_user_id, status, completed_at)`, replacing the plain FK index
EF would otherwise create on `logged_by_user_id`. It serves all three of the reads this table
gets:

- `GET /api/activity-logs?status=pending` — the approval queue, filtered by status and excluding
  the caller's own logs.
- `GET /api/activity-logs/mine?status=approved` — user plus status.
- Competition settlement (task [23]) — approved logs for one user within a period range.

Worth noting for [23]: `activity_logs` carries no `household_id`. That matches
`relational-model.md`, and it is not an oversight — the household is reachable through
`activity_id → activities.household_id`. Settlement therefore joins through `activities` rather
than filtering the log table directly. Flagged here so [23] is not surprised by it; if that join
turns out to be awkward, denormalising `household_id` onto the log is the fallback, but it would
be a documented deviation from the relational model rather than a silent one.
