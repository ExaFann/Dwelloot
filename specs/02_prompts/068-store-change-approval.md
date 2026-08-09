> **Reconstructed.** This task ran through the same spec-first workflow as the rest, but its working
> document was never split out from the task ledger. This file was written up from that ledger
> afterwards. The decisions and their reasoning are the ledger's, recorded at the time; the
> retrospective half is omitted, as it is in every file here.

## Task

[68] Every add, re-price and delete in the Store becomes a **proposal** that takes effect only when
the other partner approves it.

This replaces an earlier proposal of mine — "price changes take effect at the next day boundary" —
which the owner declined, correctly.

## The hole it closes

Either partner can re-price any reward at any time. So: make it cheap → redeem it → put the price
back. The Store is the only place Coins are spent, which makes this the one economic exploit in the
app, and it needs no collusion and leaves no trace.

The day-boundary idea was worse than it looked. It cannot say which of several same-day edits wins,
and it breaks the ordinary case — someone fixes a typo in a reward name and does not see it change.

## Decisions

**1. Approval, not a new mechanism.** The whole app already runs on *the other partner approves*: a
chore is worth nothing until it is. Routing store edits through the same gate introduces no new
concept for the user, and reuses a queue, a rule and a screen that already exist.

**2. The rules.**

- A household of **one** applies changes immediately. There is nobody to ask, and freezing the Store
  before pairing would make the app unusable for a new user.
- A household of **two** needs approval for **add, edit and delete alike.** I proposed exempting
  *add*, since a new reward cannot be used to launder an existing purchase; the owner declined.
  Consistency is worth more than the saved taps — *"some changes need approval"* is a rule nobody can
  predict, and an unpredictable rule gets read as a bug.
- **While a request is pending, the reward keeps its current values.** A change that took effect
  before approval would make the approval decorative.
- **Self-approval is refused three ways**, exactly as `activity_logs` does it: the queue excludes your
  own, the endpoint returns 403, and a database check constraint refuses it.

**3. A separate `reward_change_requests` table, not status columns on `rewards`.** This is the
decision worth arguing, because status columns look cheaper and are not.

A **create** has no row to hang `pending_*` columns on, so it would need a reward that exists but is
not visible. Every existing reader would then have to learn to exclude it: the Store list, the store
query, the redemption path, and the loot box's prize lookup. Two of those readers are already
required **not** to filter archived rows — so a second invisible state multiplies exactly the trap
that rule exists to flag. The failure mode is a silently wrong prize lookup, and it would not surface
until somebody won a box.

A separate table leaves `rewards` meaning precisely what it means today — the live catalogue — so
**no existing query changes at all.** That is the whole argument.

It also lands on a shape this codebase already has. `reward_change_requests` is `activity_logs` with
a different payload: household-scoped, requested by one member, decided by the other, Pending →
Approved/Rejected. The service mirrors `ActivityLogService`, the Notices tab grows a fourth section,
and the pending count gains a second source.

Shape: `{ id, household_id, requested_by_user_id, kind (Create|Update|Delete), reward_id (null for
Create), proposed_title, proposed_coin_cost, proposed_pauses_competition, status,
decided_by_user_id, decided_at, reject_reason }`.

**4. The proposed values are snapshot columns**, copied at request time — the same rule as
`activity_logs.points_awarded` and `redemptions.coins_spent`. Approving applies **what was proposed
and shown**, not whatever the reward happens to say by the time the other person looks.

**5. One open request per reward**, enforced by a service guard *and* a filtered unique index. A
second concurrent request on the same reward returns **409** rather than queuing, so "approve" never
has to mean "approve which one". A `Create` has no reward id and is therefore unconstrained.

Both layers are needed: the test database is EF Core in-memory, which enforces neither check
constraints nor unique indexes, so the index alone would be untested and the guard alone would lose a
race.

**6. The response must say which happened.** Applied, or queued — **200 vs 202**. The UI shows
"Saved" or "Sent to your partner", and must not infer it from a member count it may have cached.

Interacts with [69]: the pausing reward is undeletable but still re-priceable, so its price change
goes through this queue like any other.

## Test requirement

**Backend** — `RewardChangeRequestServiceTests`:

1. Solo household: create/update/delete apply immediately, and **write no request row**.
2. Paired household: each of the three kinds writes a Pending request and leaves the reward
   **unchanged**.
3. Approving applies the **snapshot**, not the reward's current values — mutate the reward between
   proposal and approval and assert the proposed value wins.
4. Rejecting leaves the reward unchanged and records the reason.
5. The requester approving their own request is **403**, and the queue for that user excludes it.
6. A second open request for the same reward is **409**; one for a different reward is not.
7. Deleting an already-archived reward, and approving a request whose reward vanished meanwhile.

**Frontend** — the Notices tab renders the fourth section, the pending count sums both sources, and
the editor distinguishes the 200 and 202 paths in what it tells the user.
