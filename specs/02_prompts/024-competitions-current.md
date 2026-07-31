## Task

[24] Add competitions current-standing endpoint: `GET /api/households/{id}/competitions/current`,
triggers settlement of any newly-closed period.

## Spec

From `api-design.md`:

```
GET /api/households/10/competitions/current
→ 200 {
  "periodType": "Daily", "periodStart": "…", "periodEnd": "…",
  "myPoints": 15, "partnerPoints": 10, "settled": false, "voided": false,
  "unopenedLootBox": null
}
```

and, when a period has closed since the last check:

```
"unopenedLootBox": { "competitionId": 55, "periodType": "Daily", "won": true, "isWinWin": false }
```

### The live standing must reuse settlement's scoring, not reimplement it

This endpoint shows the in-progress period; task [23] scores closed ones. If the two computed
points differently — a different timestamp, a different status filter, the chore's current points
instead of the snapshot — the dashboard would show one number all day and the settled result would
show another. That is the kind of discrepancy users notice immediately and trust never recovers
from.

So `ICompetitionSettlementService` gains a public `GetStandingAsync`, and both paths go through it.
The scoring rule exists once.

### `settled` is always false here

The response describes the period _in progress_, which by definition has not closed. The field is
kept because `api-design.md` documents it, and because a client that switches on it should not have
to special-case its absence — but nothing can make it true on this endpoint. Recorded rather than
quietly emitted.

### `unopenedLootBox` — narrow reading, with the ambiguity flagged

Populated when the caller has a **box they have not opened**: a settled period where they won
outright or it was a win-win, that is not voided, and for which they have no `CompetitionClaim`.

That makes `won` always `true` in practice, which is a redundancy worth naming rather than hiding.
The alternative reading — populate it for losses too, so the dashboard can say "Sam won yesterday",
which `wireframes.md` does show as a moment — would make `won` meaningful but stretches both the
field name and `CompetitionClaim`, which task [11] defined as _opening a box_, not acknowledging an
outcome.

Taking the narrow reading here because it matches the documented field name and invents no
semantics. **Flagged for task [25]/[53]**: if the loss reveal needs server support, it wants either
a separate field or a widened claim concept, and that is a decision for the task that builds the
reveal.

### Trigger

`SettleDueAsync(householdId, now)` runs first, so any period that closed since the last visit is
settled before the standing is computed. That is the whole of "lazy settlement" — no scheduler, and
the first request after a boundary pays for it.

### Period selection

Daily by default, matching the documented `"periodType": "Daily"`. An optional `?periodType=`
accepts Weekly or Monthly, since settlement already handles all three and the same widget could show
a weekly duel. Additive to the documented shape.

### Access control

The household id is in the route, so membership is checked and a non-member gets **404** — same
reasoning as task [16], where distinguishing "not yours" from "does not exist" would let ids be
enumerated.

## A second gap in the task decomposition, flagged not filled

`GET /api/households/{id}/competitions/history` is in `api-design.md`'s quick reference and has no
task. Unlike `/mine` in log `019`, this one looks **deliberately** absent: `wireframes.md` defers
"monthly/yearly stats review (chore frequency, win/loss charts)" to a later phase, and no frontend
task consumes history. So the endpoint's only consumer is already out of scope.

Recorded so the omission is visibly a decision. If it should ship, it belongs beside [24] as a
sibling; otherwise `api-design.md`'s quick reference is slightly ahead of v1's scope, which is worth
a line in the README's self-reflection rather than a scramble to build it.

## Test requirement

**`CompetitionsCurrentTests`**:

1. Returns the current daily period's bounds and `periodType`.
2. **`myPoints` and `partnerPoints` swap when the other partner asks** — the perspective flip, and
   the assertion a single-caller test cannot make.
3. Only approved logs inside the period count.
4. Live scoring matches what settlement records for the same data — the two paths must agree.
5. `voided` is true when a pausing reward was redeemed in the period.
6. `settled` is false.
7. `unopenedLootBox` is null when nothing has closed.
8. **A win in a closed period surfaces a box for the winner and not for the loser.**
9. **A win-win surfaces a box for both partners.**
10. A voided period surfaces no box for either.
11. Claiming removes the box from the response.
12. **Calling the endpoint settles a newly-closed period** — the lazy trigger, asserted by the
    competition row appearing.
13. A non-member gets `NotAMember`.
14. `?periodType=Weekly` returns the weekly window.
