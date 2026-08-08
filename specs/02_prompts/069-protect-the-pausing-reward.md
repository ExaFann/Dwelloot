> **Reconstructed.** See the note in [`068-store-change-approval.md`](068-store-change-approval.md)
> — this file was written up from the task ledger after the task was built.

## Task

[69] `pausesCompetition` stops being a checkbox in the reward editor. The one seeded pausing reward
("Full chores day off") becomes a special prize: **not deletable, but its price can still be
changed.** Ordinary rewards can never acquire the flag.

## Decisions

**1. The flag becomes server-owned.** It is removed from every client request — create and patch
alike. A user-settable "this redemption voids the day's competition" is an attach-anything primitive:
put it on a back rub and the duel can be cancelled for the price of a back rub.

**2. The feature stays.** The owner wants it for a possible holiday mode. It stops being something a
user can attach by accident; it does not stop existing.

**3. Undeletable, but re-priceable — and the asymmetry is the point.** Deleting it removes a
mechanic from the household permanently, which is not a store operation. **Price is the abuse gate**:
if the pausing reward is too easy to reach, raising its cost is the correct remedy and it is one both
partners can agree on. So `DELETE` returns **409** with a reason, and `PATCH` of the price is
ordinary — routed through [68]'s approval queue like every other change.

**4. The card's disclosure is derived from the flag, never from the title.** This was already the
rule, and it is worth restating here because the only pausing reward is *called* "Full chores day
off" — a component that matched on the title would pass every test while being wrong. A second
pausing reward with an unrelated name belongs in the fixtures for exactly that reason.

## Test requirement

1. `pausesCompetition` sent on create or patch is **ignored**, not honoured and not an error — an
   older client must not be able to set it, and must not break.
2. `DELETE` on the pausing reward is **409**; on any other reward it archives as before.
3. `PATCH` of its `coinCost` succeeds (via the [68] path appropriate to the household size).
4. A reward that does not pause never gains the flag through any request shape.
5. The disclosure renders from the flag: a fixture with a **differently named** pausing reward must
   still show it, and one named like it without the flag must not.
