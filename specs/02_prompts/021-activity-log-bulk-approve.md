## Task

[22] Add activity log bulk-approve endpoint: `POST /api/activity-logs/bulk-approve`.

## Spec

From `api-design.md`:

```
POST /api/activity-logs/bulk-approve
{ "ids": [90, 91] }
→ 200 { "approved": [90, 91] }
```

Driven by `wireframes.md` screen 3: the pending section has select-all and bulk approve.

### Best-effort, not all-or-nothing — and the response shape says so

The obvious question is what happens when one id in the batch is invalid: reject the whole request,
or approve the rest?

`api-design.md` answers it implicitly. The response echoes back **which** ids were approved. Under
all-or-nothing that field would be redundant — it would always equal the request. Returning a subset
only makes sense if a subset can succeed.

That is also the better behaviour for the screen it serves. Select-all sweeps up whatever is on
screen; if the partner decided one of them a second earlier, failing all twenty because of it would
be obstructive.

### Reporting what was skipped

The documented response carries only `approved`. A `skipped` array is added alongside it, each entry
carrying an id and a reason.

Silently dropping ids from a select-all is worse than useless — the user sees "approved" and cannot
tell that two of their five did not go through. This is additive to the documented shape and costs
nothing.

### One query, one save

A bulk endpoint that loops `ApproveAsync` would issue two round trips per id. This loads every
candidate in a single query, applies the same rules in memory, and saves once.

That also makes the points award naturally correct: totals are summed per logger and applied once,
rather than incrementing the same user's row twenty times.

### Rules, reused rather than reimplemented

The per-id rules are exactly task [21]'s, and they must stay identical — a bulk path with looser
checks would be a way around the no-self-approval rule, which is precisely the rule this app cannot
afford to have two versions of. Each id is skipped when it is:

| Reason         | Meaning                             |
| -------------- | ----------------------------------- |
| `NotFound`     | No such log, or another household's |
| `SelfApproval` | The caller logged it                |
| `NotPending`   | Already approved or rejected        |

### Input limits

- `ids` must be non-empty.
- **Capped at 100** — an unbounded array is a cheap way to make the server do arbitrary work, the
  same reasoning as the page-size cap in task [16].
- **Duplicates are collapsed.** `[90, 90]` must approve once and award once; without a `Distinct()`
  the same row would be counted twice in the points total.

### Concurrency

`Status` is a concurrency token (task [21]), so if any log in the batch is decided between the read
and the save, the whole save fails. That is left as an all-or-nothing 409 rather than retried: the
caller is told to refresh, and a refreshed queue will not offer the decided log again. Retrying a
partially-stale batch silently would be harder to reason about than asking for a fresh one.

## Test requirement

**`ActivityLogBulkApproveTests`**:

1. Approves several logs and returns their ids.
2. **Awards the sum of their points, once** — the case a naive per-id loop with a shared user entity
   gets wrong.
3. **A batch containing the caller's own log approves the others and skips that one**, with reason
   `SelfApproval` — the mixed batch is the whole point of best-effort.
4. Already-decided ids are skipped, not re-approved, and award nothing extra.
5. Another household's ids are skipped as `NotFound`, and stay pending.
6. **Duplicate ids award once.**
7. A batch where everything is invalid returns empty `approved` and writes nothing.
8. An empty `ids` array is rejected.
9. A batch over the cap is rejected.
10. Approved logs leave the pending queue.

Then end-to-end against real PostgreSQL, including a deliberately mixed batch — valid, own, and
already-decided ids in one request — and the resulting `lifetimePoints` seen through
`GET /api/auth/me`.
