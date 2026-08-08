> **Reconstructed.** See the note in [`068-store-change-approval.md`](068-store-change-approval.md)
> — this file was written up from the task ledger after the task was built.

## Task

[70] `POST /api/households/join` moves a caller who is **alone** in a household into another one, in
a single transaction, deleting the household they leave.

Owner's report: two people who had each created their own household had no way to pair up
afterwards. The guard refused every caller who already belonged to one, and the pairing screen is
only reachable *before* you have joined anything — so both of them were stuck with an app that
requires two people and offered no route to a second person.

## Decisions

**1. In the service, as one transaction — not leave-then-join from the client.** `POST /leave`
deletes a household whose last member walks out, cascading its chores, rewards, competitions and
history. Two sequential calls would therefore delete the caller's household and *then* discover the
invite code was a typo. Done server-side, a bad code or a full target returns **before anything is
written**, so a wrong code costs nothing.

**2. Solo callers only. A household of two is still refused (409).** Leaving evicts you from
somewhere another person lives, and their chore history goes with it. That is Leave's job, it should
be a deliberate act, and it should not be reachable by pasting a code.

**3. The emptied household is deleted, not left orphaned.** It is what Leave already does with the
last member, and a household with no members is not a state any query is written to expect.

**4. Frontend: `JoinInstead` on the Me screen, shown only while `members.length < 2`.** The
capability has to be visible from where the stuck user actually is. Putting it behind the pairing
screen is what caused the problem in the first place.

## Test requirement

1. Solo caller + valid code → moved; the old household **and its rows** are gone; the target has two
   members.
2. Paired caller + valid code → **409**, and **nothing is written** — assert the old household still
   exists, which is the half that would have been destroyed by a client-side leave-then-join.
3. Invalid code → error, and the caller's household is **untouched**. This is the regression that
   motivated doing it in the service; assert it explicitly.
4. Target already full → refused, both households intact.
5. Frontend: `JoinInstead` renders for a solo household and **not** for a paired one.
