## Task

[16] Add household details, rename, and leave endpoints: `GET /api/households/{id}`,
`PATCH /api/households/{id}`, `POST /api/households/{id}/leave`.

## Spec

From `api-design.md`:

```
GET /api/households/10
→ 200 { "id": 10, "name": "Our place", "inviteCode": "7F3K9Q",
        "members": [ { "id": 1, "name": "Alex" }, { "id": 2, "name": "Sam" } ] }

PATCH /api/households/10
{ "name": "The Nest" }
→ 200 { "id": 10, "name": "The Nest" }

POST /api/households/10/leave
→ 200 { "left": true }
```

All three are "either partner". Note the rename response is deliberately just `{ id, name }`, not
the full details object — followed exactly.

### Access control is the security-relevant part here

These are the first endpoints that take a resource id from the caller. Every one must verify the
caller is actually a member of the household they named, or the id becomes an
insecure-direct-object-reference: `GET /api/households/11` would hand a stranger another
household's invite code, which is the credential for joining it (task [14]).

**A non-member gets 404, not 403.** Both "no such household" and "not your household" return the
same 404, so the endpoint cannot be used to probe which ids exist. Same reasoning as the single
generic login failure in task [13]: distinguishing the two cases is only useful to someone
enumerating.

The service reports `HouseholdNotFound` and `NotAMember` separately and honestly; collapsing them
is the controller's job, since that is a decision about the HTTP surface rather than about the
domain.

### Leave

`api-design.md`'s quick reference: "leave (frees the household or deletes it if last member)". So:

- **Last member leaves** → the household row is deleted. Its activities, rewards, competitions and
  claims cascade with it (tasks [5]–[11]); `users.household_id` is `ON DELETE SET NULL`, so people
  survive the household they were in.
- **One of two leaves** → `household_id` cleared for the leaver, and `is_full` set back to false so
  the remaining partner can pair with someone else.

That second branch is the one this task owes task [15]: log `014` deliberately stopped trusting
`is_full` as the join guard _because_ this endpoint has to remember to clear it. The guard there
counts real members, so a bug here stays cosmetic — but it should still be correct.

### Leave interacts with the concurrency token

`is_full` became an EF concurrency token in task [15]. That has a consequence here worth working
through rather than discovering in production.

If both partners leave simultaneously, both read two members and both take the "clear `is_full`"
branch. The token means only one `UPDATE ... WHERE is_full = true` matches; the other raises
`DbUpdateConcurrencyException`. Without handling, the second leaver sees an error while still being
in the household.

Handled with a single retry: on a concurrency failure, re-read and re-evaluate. The second attempt
now finds one member, takes the delete branch, and the household is cleaned up properly instead of
being orphaned with zero members still holding an invite code.

Bounded at one retry — a second failure means genuine contention beyond what two people can
produce, and returning a conflict is better than looping.

### Rename

Only `name` is patchable. `invite_code`, `is_full` and membership are not client-editable, so the
request record carries a single field rather than accepting a partial household and filtering it —
a body that cannot express an unwanted change is better than one that is sanitised afterwards.

## Test requirement

**`HouseholdServiceQueryTests`** — details and rename:

1. A member gets the household back with both members.
2. **A non-member gets `NotAMember`**, not the household. The IDOR test.
3. An unknown household id gets `HouseholdNotFound`.
4. A user with no household gets `NotAMember` for someone else's household.
5. Rename changes the name and persists it.
6. **A non-member cannot rename** — and the name is unchanged afterwards, since a rejected write
   that partially applied would be worse than a clean refusal.

**`HouseholdServiceLeaveTests`** — the branchy one:

7. One of two leaves: `household_id` cleared, household still exists, **`is_full` back to false**.
8. The remaining partner is untouched.
9. Last member leaves: the household row is **deleted**.
10. Deleting the household **takes its catalog with it** — activities and rewards gone. Verifies
    the cascade actually fires rather than assuming.
11. The leaver survives the household deletion, with `household_id` null.
12. A non-member cannot leave a household they are not in.
13. **After both partners leave, no household rows remain** — the end-to-end version of the
    two-step drain.
14. **A freed household can be joined by someone new** — the real point of resetting `is_full`, and
    the assertion that would fail if this task forgot to clear it.

Then end-to-end against real PostgreSQL, where the cascade is genuinely exercised: create, join,
read details, rename, leave with both partners, and confirm a stranger gets 404 rather than 403.
