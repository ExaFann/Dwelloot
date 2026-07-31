## Task

[31a] Add household redemption feed endpoint: `GET /api/redemptions?scope=household&excludeMine=true`,
the data source for the Notices tab's partner-achievements section.

## Spec

From `api-design.md`, which introduces it in its opening paragraph as the fix for a real gap — the
earlier draft used `/redemptions/mine` for this section, "which is the wrong data source":

```
GET /api/redemptions?scope=household&excludeMine=true
→ 200 { "items": [ { "id": 40, "userId": 2, "rewardTitle": "Takeout of choice",
                     "redeemedAt": "2026-07-28T20:00:00Z" } ] }
```

`wireframes.md` screen 3, section 2: "Partner's recent redemptions and achievements — highlighted, meant
to spark competitive awareness ('they just redeemed X')."

This is the sibling of task [31] and shares its service, controller, paging vocabulary and ordering. The
differences are the scope, the `excludeMine` filter, and one field.

### Scoping through the reward, which matters more here than in [31]

Household membership is reached through **`reward.household_id`**, never through the redeemer's
`user.household_id` — §3.15's rule, restated in `RedemptionConfiguration` and in log `007`.

In [31] that was mostly hygiene, because the caller's own row was the one being filtered. Here it is
load-bearing and has a visible failure mode: `users.household_id` is **nullable and cleared on
leaving**, so a feed joined that way would make a departed partner's entire redemption history vanish
from the household's feed the moment they left. Rewards are permanently household-owned, so joining
through them keeps history stable regardless of who is currently a member.

That is the one behaviour here a test must be able to fail on, and it needs a fixture where a redeemer
has actually left — see the test requirement.

### `scope` is validated, not ignored

`household` is the only value implemented. Two things follow.

It is **optional**: `GET /api/redemptions` with no scope means the household's redemptions, which is the
plain reading of the route and the only thing this endpoint does. The documented call sends
`scope=household` explicitly and works unchanged.

Any **other** value is a **400**, not a silent fallback. This follows the sort-field precedent from log
`016`, but the reason is stronger here than "surface a frontend typo": the fallback direction is
dangerous. A client that mistypes `scope` or `excludeMine` and gets a silent full-household listing has
been handed _more_ data than it asked for. When the failure modes are "return less" and "return more",
the parameter should be strict.

A single-valued parameter is not automatically dead code — that was the reasoning that removed
`?category=all` in log `006`, and the difference is that `category` had **no column behind it**, whereas
`scope` selects between two genuinely different row sets, one of which (`mine`) is already served by its
own route. If `scope=mine` is ever wanted here, it is one switch arm.

### `excludeMine`

A plain `bool`, default **false**. Omitted means the whole household's redemptions, including the
caller's — the honest meaning of an unfiltered household query. The Notices feed sends `true`.

`excludeMine=true` and `GET /api/redemptions/mine` must be a **partition** of the household's
redemptions: every row appears in exactly one of them. Log `022` asserted the same property between the
approval queue and own-log history, and it is the assertion that catches an inverted filter, which
"excludes my rows" alone would not.

### Item shape

`{ id, userId, rewardId, rewardTitle, coinsSpent, redeemedAt }` — two fields beyond the worked example.

- **`coinsSpent`.** The snapshot from task [30]. Without it the feed would have to read the reward's
  _current_ price, which is precisely the drift the column exists to prevent — "they redeemed the day
  off" reads very differently at 80 Coins than at the 8 it might be repriced to later. It is also what
  gives the section the competitive weight `wireframes.md` asks of it.
- **`rewardId`.** So a feed entry naming a catalog item carries its identifier rather than forcing the
  client to match on title. Title-matching is the fragility task [28] avoided by returning
  `pausesCompetition` instead of letting [51] recognise the day off by name.

`userName` is deliberately absent: the client already has both members from `GET /api/households/{id}`,
and duplicating a name into every feed row invites it going stale.

Archived rewards are included, as in [31] — the purchase happened, and the title still resolves because
task [29] archives rather than deletes.

| File                                       | Change                                                                             |
| ------------------------------------------ | ---------------------------------------------------------------------------------- |
| `API/Dtos/Redemptions/RedemptionDtos.cs`   | Add `HouseholdRedemptionQuery`, `HouseholdRedemptionResponse`, `RedemptionScopes`. |
| `API/Services/RedemptionService.cs`        | Add `ListForHouseholdAsync`; add `InvalidScope` to the status enum.                |
| `API/Controllers/RedemptionsController.cs` | Add `GET /api/redemptions`.                                                        |
| `Tests/Services/RedemptionFeedTests.cs`    | New.                                                                               |

## Test requirement

`Tests/Services/RedemptionFeedTests.cs`, with the standing countermeasures: a **decoy household first**,
**both directions** wherever "the partner's" is the claim, ties constructed so the ordering test can
fail, and page-size assertions seeded **past** the cap.

1. Returns the household's redemptions with the documented fields.
2. **`excludeMine=true` excludes the caller's and keeps the partner's — both directions.** Alex's view
   and Sam's view are each checked, since asserting one side would pass against a filter that dropped
   the wrong user's rows.
3. Omitting `excludeMine` returns both partners' rows.
4. **`excludeMine=true` and `/mine` partition the household's redemptions** — union equals the whole set,
   intersection is empty, neither side empty.
5. Another household's redemptions never appear.
6. **A departed partner's redemptions still appear in the feed.** The §3.15 rule, and the only test that
   can fail if the join goes through `user.household_id`. Built through real service calls: Sam redeems,
   Sam leaves (Alex stays so the household survives), Alex's feed must still show it.
7. Redemptions of archived rewards are included, with titles intact.
8. `coinsSpent` is the stored snapshot, not the reward's current price.
9. **Newest first, ties broken by descending id** — ties inserted with explicit ids **ascending**, so
   insertion order and expected order disagree and the tiebreaker becomes observable (logs `027`,
   `028`, `031`).
10. `take` limits the page while `total` stays the unpaginated count; `pageSize` wins over `take`.
11. Page size capped, seeded past the cap; `page` below 1 clamps.
12. Paging through the feed yields every row exactly once.
13. An unrecognised `scope` returns `InvalidScope`; `scope=household` and an omitted scope both succeed;
    the comparison is case-insensitive.
14. No household → `NoHousehold`; unknown user → `UserNotFound`.
15. A household where nobody has redeemed anything → empty page, `total: 0`.

Then mutation testing and an end-to-end pass against real PostgreSQL — which, unlike every previous
task, can now build its own Coin balance through the API.
