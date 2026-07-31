# 022 — Own activity-log history endpoint

Corresponds to `task_decomposition.md` task **[22a]** — the endpoint added to the plan in log `021`
after it turned out `api-design.md` used it twice with no task covering it.

**Numbering note.** The "log `NNN` documents task `[NNN + 1]`" rule held from `001` to `021`.
Inserting `[22a]` ends it. From here:

| Logs         | Tasks                     |
| ------------ | ------------------------- |
| `001`–`021`  | `[2]`–`[22]` (offset +1)  |
| `022`        | `[22a]`                   |
| `023` onward | `[23]` onward (no offset) |

## Task

[22a] Add own activity-log history endpoint: `GET /api/activity-logs/mine`, with optional `?status=`
filter and a `take` limit.

## Spec

`api-design.md` uses this in two places, and they want different fields:

```
GET /api/activity-logs/mine?take=5                     (dashboard recent feed)
→ 200 { "items": [ { "id": 88, "activityTitle": "Wash dishes",
                     "status": "Approved", "completedAt": "2026-07-28T19:03:00Z" } ] }

GET /api/activity-logs/mine?status=approved            (Notices, bottom section)
→ 200 { "items": [ { "id": 85, "activityTitle": "Vacuum",
                     "approvedAt": "2026-07-28T18:00:00Z" } ] }
```

One item shape covers both: `completedAt` always, `approvedAt` nullable.

### `take` is an alias for `pageSize`

`api-design.md` says `?take=5` here but `?pageSize=5` on the activities catalog — an inconsistency
in the spec rather than a real difference in behaviour. "The first 5" is exactly
`page=1&pageSize=5`.

So `take` is accepted as documented and treated as a page size, with `page` and `pageSize` also
available for the Notices list, which can grow past one screen. If both `take` and `pageSize` are
supplied, `pageSize` wins as the more specific of the two. Same clamping and cap as everywhere else.

### `rejectReason` is included, and it matters

Task [21] made a reject reason mandatory on input. Nothing has ever been able to read it back —
which makes a required field pure ceremony. This is the endpoint where it belongs: a rejected log
in your own history without "why" is the one place the user actually needs it.

Also included beyond the worked examples: `pointsAwarded`, matching the approval queue's item shape,
so the dashboard feed can show what each entry earned.

### Scoping

Filtered to `LoggedByUserId == caller` **and** the caller's current household.

The user filter alone would be correct in the narrow sense — they are the caller's own logs either
way — but someone who left a household and joined another would see their old household's history
mixed into the new one. Nothing leaks, since it is all their own data, but it would be confusing.
Scoping to the current household keeps "my history" meaning "my history here", consistent with every
other endpoint in the app.

A caller with no household gets 409, as elsewhere.

Logs whose chore has been archived are included, for the same reason as the approval queue in task
[20]: archiving removes a chore from the catalog, not from what already happened.

## Test requirement

**`ActivityLogMineTests`**:

1. Returns the caller's own logs.
2. **Never returns the partner's logs** — the exact inverse of task [20]'s queue, and the pair is
   what makes both meaningful.
3. Every status is returned by default.
4. `?status=` narrows correctly.
5. `?take=n` limits the result.
6. `pageSize` wins when both are supplied.
7. Ordering is newest first.
8. **A rejected log carries its `rejectReason`.**
9. An approved log carries `approvedAt`; a pending one does not.
10. Logs of archived chores still appear.
11. Another household's logs are excluded even though the caller logged them — the
    left-and-rejoined case.
12. A caller with no household is rejected.

Then end-to-end against real PostgreSQL, checking both documented call shapes and that Alex's `/mine`
is the complement of Alex's queue.
