## Task

[18] Add activities create/update/delete endpoints: either partner may edit/delete any of their
household's own activities — no default-vs-custom distinction, since every row is already
household-owned after [12]/[14].

## Spec

`api-design.md` gives these three only a quick-reference line, no worked payloads:

| `POST /api/activities` | add a custom chore | either partner |
| `PATCH /api/activities/{id}` / `DELETE /api/activities/{id}` | edit/remove any of this household's chores | either partner |

So shapes are chosen here, staying consistent with `GET /api/activities` from task [16]: the
create and update responses are the same `ActivityResponse { id, title, points }` that endpoint
returns, so a client parses one shape everywhere.

### No default-vs-custom distinction, and nothing to implement for it

Worth stating because it is the task's headline and it turns into _zero code_: there is no `IsDefault`
column and no carve-out to write. Task [12] copies templates into per-household rows, so by the time
any of these endpoints runs, "Mow the lawn" is an ordinary row owned by that household. The absence
of a special case is the feature — `relational-model.md` chose copy-on-creation precisely so this
task would not need one.

### Ownership checks

Every endpoint takes an id from the caller, so each must confirm the activity belongs to the
caller's household. A chore in someone else's household returns **404**, not 403 — same reasoning
as task [16]: distinguishing "does not exist" from "not yours" lets an attacker enumerate ids.

`PATCH` cannot move an activity between households because `HouseholdId` is not in the request
record at all. A body that cannot express the change beats one that is filtered afterwards — same
principle as the rename request in task [16].

### Deleting a chore that has been logged

Log `005` recorded an obligation for this task. `ActivityLog.ActivityId` cascades, so deleting a
chore deletes every log of it. That cascade is forced by the delete graph (households cascade to
activities, so logs cannot restrict), and it is safe for scoring — `LifetimePoints` is a stored
running total and settled competitions persist their own results, so no score is recomputed. What
is lost is the audit trail in the Notices feed.

Silently destroying that is not acceptable, and neither is blocking a legitimate cleanup. So:

- **No logs** → delete immediately, 204.
- **Has logs, no confirmation** → **409** carrying the count, so the UI can say "this will also
  remove 14 logged entries".
- **Has logs, `?confirm=true`** → delete, 204.

That keeps the common case (`project-plan.md`'s worked example is removing "Mow the lawn" from a
household with no yard) frictionless, and puts a deliberate step in front of irreversible history
loss. It is an addition beyond `api-design.md`'s bare "edit/remove", recorded as such.

### Point validation lives in the service, not only the DTO

`points > 0` is already a database check constraint (task [5]) and will be a DataAnnotation on the
request record. The service checks it too.

That is not redundancy for its own sake: without the service check, a bad value that slipped past
model binding would reach PostgreSQL and surface as a `DbUpdateException` — a 500 describing a
constraint name, rather than a 400 saying what was wrong. It also makes the rule testable at the
service level, which matters because `project-plan.md` names rejecting negative point values as part
of the Security advanced requirement. Task [32] owns the broader validation pass; this is the piece
that belongs with the endpoint that can violate it.

## Test requirement

**`ActivityServiceMutationTests`**:

1. Create adds a chore to the caller's household and returns it.
2. Create rejects a caller with no household.
3. **Create rejects zero and negative points** at the service level.
4. Update changes the supplied fields.
5. **Update leaves omitted fields alone** — the property that separates PATCH from PUT, and the one
   a careless implementation breaks by writing nulls over everything.
6. **Update refuses another household's chore, and the row is unchanged afterwards.**
7. Update rejects non-positive points.
8. Delete removes a chore with no logs.
9. **Delete refuses a chore that has logs, reports the count, and leaves both the chore and its
   logs intact.**
10. **Delete with confirmation removes the chore and its logs**, and leaves other chores' logs
    alone — the assertion that would catch an over-broad delete.
11. Delete refuses another household's chore, and it survives.
12. Deleting a default-copied chore works exactly like a custom one — the "no distinction" claim,
    asserted rather than assumed.

Then end-to-end against real PostgreSQL, where the log cascade is genuinely exercised rather than
simulated by EF's change tracker (the trap found in task [16]).
