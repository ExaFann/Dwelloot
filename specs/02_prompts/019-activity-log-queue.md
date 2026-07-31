## Task

[20] Add activity log pending-queue endpoint: `GET /api/activity-logs?status=pending`, excludes the
caller's own logs.

## Spec

From `api-design.md`:

```
GET /api/activity-logs?status=pending
→ 200 { "items": [ { "id": 90, "activityTitle": "Wash dishes", "loggedByUserId": 2,
                     "completedAt": "2026-07-29T09:15:00Z" } ] }
```

### Excluding the caller's own logs is the whole endpoint

`relational-model.md` and `er-diagram-1` both make self-approval impossible, and task [6] added a
database check constraint behind it. This endpoint is the _first_ line of that defence: if your own
logs never appear in the queue, the approve button is never even offered for them.

So the exclusion is not a display convenience — it is the same rule as the check constraint, applied
at the point where a user would otherwise be tempted. Task [21] enforces it again on the approve
action itself, because a queue that hides something is not the same as an endpoint that refuses it.

### Logs of archived chores still appear

A chore archived (task [18]) while one of its logs is still pending must keep that log in the queue.
The work was done before the chore was removed from the catalog; refusing to approve it would
destroy the partner's points for a reason that has nothing to do with them.

This is exactly what archiving-rather-than-deleting was for, and it is worth a test because the
natural implementation — joining to `activities` and filtering `ArchivedAt == null`, as the catalog
endpoints do — would silently drop them.

### Query shape

`status` is **optional**, not required. `?status=pending` is the documented approval queue;
omitting it returns the partner's logs at every status, which is what the dashboard's recent-activity
feed and the Notices tab's middle section want. Same superset approach as `desc` on the activities
endpoint in task [16].

Pagination reuses `PagedResponse<T>` and the same clamped page size, so one request cannot ask for
an unbounded number of rows.

Ordering is newest first — `completedAt` descending, then `id` descending. The `id` tiebreaker is
the same lesson as task [16]: two logs can share a timestamp, and without a total order they repeat
or vanish across pages.

### Three additions beyond `api-design.md`'s example, all deliberate

- **`total`**, from `PagedResponse<T>`. The Notices tab wants a pending count for its badge, and
  every other list endpoint already returns it.
- **`status`**, because making the filter optional means an item is ambiguous without it.
- **`pointsAwarded`**, so the approval UI can show what it is approving. Now that this is a
  snapshot taken at log time (task [19]), it is the authoritative value and not derivable by the
  client from the chore's current points.

## Test requirement

**`ActivityLogQueryTests`**:

1. Returns the partner's pending logs with the activity title resolved.
2. **Never returns the caller's own logs** — the headline rule.
3. Never returns another household's logs, even at the same status.
4. `?status=pending` narrows to pending; other statuses are excluded.
5. Omitting `status` returns every status.
6. **Logs whose chore has been archived still appear** — the case the obvious implementation drops.
7. `pointsAwarded` carries the snapshot, not the chore's current points — asserted after editing the
   chore, so it would fail if the projection read through the navigation.
8. Ordering is newest first with an id tiebreaker.
9. Paging covers every row exactly once.
10. `pageSize` is capped.
11. A caller with no household is rejected.

Then end-to-end against real PostgreSQL with two genuinely different users, which is the only way to
exercise the exclusion rule properly — a single-user test cannot tell "excludes mine" from
"returns nothing".
