> **Reconstructed.** See the note in [`068-store-change-approval.md`](068-store-change-approval.md)
> — this file was written up from the task ledger after the task was built.

## Task

[71] `DELETE /api/activity-logs/{id}` — the endpoint whose *absence* shaped the dashboard.

With no way to unsend a log, undo had to mean "not sent yet", which is `useDeferredLog`'s five-second
window. That window stays; this is what happens after it closes.

## Decisions

**1. Own logs, Pending only.**

- An **approved** log has already moved the score and may sit inside a settled period. Unwinding it
  means reversing points across a closed competition — the invariant settlement is built on.
- A **rejected** log is the record of a decision the other person made. It is not the logger's to
  erase.
- Someone else's log is a **404**, byte-identical to one that does not exist. The API does not
  confirm that other people's rows exist.

**2. A hard delete, checked rather than assumed.** Everything downstream reads `Approved` only, so
removing a pending row moves no score. The one reader that sees pending logs is settlement's
"is anything still waiting" check — which means deleting a mis-tapped chore **lets a blocked period
settle**. That is what the person deleting it wants, and it is the behaviour to assert in both
directions rather than to hope for.

**3. The mutation is owned by `HeadToHeadCard`, not by the column that renders the ×.** Calling the
hook inside `RecentChoresColumn` makes a presentational component unrenderable without a Redux
Provider, and breaks six tests that have every right to render it bare. The card owns the data, so
the card owns the mutation and passes a callback down.

**4. The regression test belongs at the card level.** This shipped broken once — only the solo branch
got the callback wired, and the owner found it in the running app. A test on the column would not
have caught it, because the column was correct. Test where the bug was: the card, both branches.

## Test requirement

**Backend:**

1. Own + Pending → deleted.
2. Own + Approved → refused; own + Rejected → refused.
3. Another member's log → **404**, same shape as a nonexistent id.
4. **Settlement, both ways**: a period with one pending log reports `AwaitingApprovals`; delete that
   log and the same period settles. This is the load-bearing assertion.

**Frontend:**

5. The × appears on your own pending rows and on **no** others.
6. Clicking it calls the mutation — asserted in **both** the solo and the paired branch of
   `HeadToHeadCard`, because that asymmetry is the bug this test exists for.
