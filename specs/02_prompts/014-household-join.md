## Task

[15] Add household join endpoint: `POST /api/households/join`, rejects once a household already
has 2 members.

## Spec

From `api-design.md`:

```
POST /api/households/join
{ "inviteCode": "7F3K9Q" }
→ 200 { "id": 10, "isFull": true }
→ 409 { "error": "This household already has 2 members" }
```

Note the response is deliberately thinner than create's — id and `isFull` only, no name or invite
code — and it is a **200, not a 201**: joining does not create a resource. Both are followed
exactly.

### This endpoint owns the app's central invariant

`relational-model.md` is explicit that the two-member cap lives here rather than in the database:
a `CHECK` constraint counting related rows is not portable, so "max 2 users per household" is
"validated in the household-join endpoint instead". Everything else in the app — the head-to-head
widget, peer approval, win/lose settlement — assumes exactly two people. This is the single place
that assumption is defended.

### Check the member count, not the `is_full` flag

`households.is_full` is denormalised: it caches a fact that actually lives in `users.household_id`.
Gating on the cache means a drifted flag silently admits a third member, and drift is plausible —
task [16]'s leave endpoint has to remember to clear it, and any future bug there breaks this
endpoint rather than its own.

So the guard counts actual members (`COUNT(users WHERE household_id = X) >= 2`) and `is_full` is
maintained as a consequence. The check then validates the invariant itself rather than a
bookkeeping field, and a drifted flag becomes cosmetic instead of a security hole.

### The residual race, stated rather than glossed

Two people submitting the same code simultaneously could both pass the count check before either
commits, producing three members. Honest assessment: the check narrows this to a window of a few
milliseconds, and it requires two different people to redeem the same code at the same instant in a
two-person app.

Whether it can be closed for free is checked during implementation — marking `is_full` as an EF
concurrency token would make the race produce a clean 409 rather than a third member, at the cost
of the model snapshot changing. If that forces a migration it is not worth one at this task, and
the residual race gets documented instead. Recorded either way rather than left as an unexamined
"it's fine".

### Rules and their status codes

| Condition                          | Response                                                                                     |
| ---------------------------------- | -------------------------------------------------------------------------------------------- |
| Not authenticated                  | 401                                                                                          |
| Caller already has a household     | 409 — you cannot join a second one, and this also makes "join your own household" impossible |
| No household with that invite code | 404                                                                                          |
| Household already has 2 members    | 409, with `api-design.md`'s exact message                                                    |
| Otherwise                          | 200 `{ id, isFull }`                                                                         |

### Invite code normalisation

The input is uppercased and trimmed before lookup. The alphabet is uppercase (task [14]), but this
code is read off one screen and typed into another, so accepting `7f3k9q` costs one call and
removes a failure mode that would look like a broken code rather than a typo.

## Test requirement

**`HouseholdServiceTests`**, extending the suite from task [14]:

1. A user with no household joins successfully; `user.HouseholdId` points at the household.
2. The joined household becomes `IsFull = true`.
3. **A third user is rejected with `HouseholdFull`** — the headline rule, and the assertion also
   checks the third user's `HouseholdId` is still null, since a rejection that half-applied would
   be worse than one that failed outright.
4. Rejects a caller who already has a household.
5. Rejects an unknown invite code.
6. Lowercase and whitespace-padded codes still match.
7. **Joining does not copy the catalog again** — the household must still have exactly one set of
   defaults afterwards. Easy to get wrong by reusing the create path, and the symptom would be a
   store showing every reward twice.
8. The rejected-third-user case leaves the household's member count at exactly two.

Then end-to-end against real PostgreSQL: create a household with user A, join with user B, confirm
the 200 shape and `isFull: true`, confirm a third user gets 409 with the documented message, and
confirm `GET /api/auth/me` reports the same `householdId` for both partners.
