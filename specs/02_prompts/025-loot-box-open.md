## Task

[25] Add loot box open endpoint + unit tests: `POST .../open-box` — weighted random Coins/bonus-reward
roll, idempotent on repeat calls.

## Spec

From `api-design.md`:

```
POST /api/households/10/competitions/55/open-box
→ 200 { "competitionId": 55, "result": "coins", "coinsAwarded": 18 }
  or  { "competitionId": 55, "result": "bonusReward", "reward": { "id": 7, "title": "Foot massage" } }
```

### The ambiguity from log `024` is resolved

Log `024` flagged that `won` is always true, and asked whether losers should get a reveal. **Answered
in review: only winners, and both partners on a win-win, get the reveal and the opening flow. Losers
get nothing** — no animation, no box — with a loss animation left as possible later work.

So this endpoint refuses the loser outright, `CompetitionClaim` keeps its task [11] meaning of
"opened a box", and `unopenedLootBox` staying null for a loss (task [24]) is correct rather than a
gap.

### Idempotency, and where the roll actually happens

Task [23] deliberately did not roll — settled rows leave `CoinsAwarded` at 0 and `BonusRewardId`
null. The roll happens here, on the **first** open:

1. First opener: roll, store the result on the `Competition`, write a `CompetitionClaim`, credit
   their Coins.
2. Any repeat call by the same partner: their claim already exists, so return the stored result
   without re-rolling and without crediting again.
3. On a win-win, the second partner: no claim of their own yet, but the competition already carries
   a result — so **reuse it** rather than rolling again, write their claim, and credit them the same
   amount.

Point 3 is the behaviour confirmed in review earlier: a win-win produces **one prize, received by
both**. Rolling separately per partner remains possible later by moving `CoinsAwarded` and
`BonusRewardId` onto `competition_claims`, which is exactly why the claim became a table in task
[11].

The unique index on `(competition_id, user_id)` is the storage-level backstop: even if two requests
raced past the claim check, only one insert can win.

### The weighted roll

`project-plan.md`: "most of the time it contains a randomized number of Coins, and there's a small
chance of a bonus reward (an item pulled straight from the Store)."

- **10% bonus reward, 90% Coins.** "Small chance" made concrete.
- **Coins scale with the period**, because a monthly win should not be worth the same as a Tuesday:
  Daily 10–25, Weekly 30–60, Monthly 80–150. Calibrated against the store, where rewards cost 15–80
  — so a couple of daily wins buys something cheap, and a monthly win buys the best item outright.
- Randomness is injected, so tests are deterministic and the distribution itself is testable rather
  than assumed.

### Bonus rewards exclude the "day off"

The pool is the household's own non-archived rewards, **minus any with `PausesCompetition`**.

Winning a free "full chore day off" sounds like the best possible prize, and it is precisely the one
that must not be handed out automatically: redeeming it voids that day's competition (task [23]), so
a loot box could silently cancel the very competition the user is standing in. Excluded, and the
reason recorded — this is a rule about the mechanic, not squeamishness about generosity.

If the pool is empty (a household that deleted its rewards), the roll falls back to Coins.

### A won reward becomes a real redemption

Storing `BonusRewardId` alone would leave the user holding a label with nothing to claim. So opening
a bonus-reward box also writes a `Redemption` at zero cost.

That makes the prize real, gives it a place in the partner's Notices feed alongside ordinary
redemptions, and needs no new concept. It is also why excluding pausing rewards matters: without
that exclusion, this redemption would trigger the day-off void as a side effect.

### `result` is `"coins"` / `"bonusReward"` — camelCase, unlike `status`

`api-design.md` uses PascalCase for log status (`"Pending"`) and camelCase here. The global
`JsonStringEnumConverter` handles the former; `[JsonStringEnumMemberName]` names these two members
individually rather than switching the policy globally and breaking every documented status string.

### Rules

| Condition                                      | Response                                   |
| ---------------------------------------------- | ------------------------------------------ |
| Not authenticated                              | 401                                        |
| Not a member of the household in the route     | 404                                        |
| Competition not found, or not this household's | 404                                        |
| Voided period                                  | 409 — no box was awarded                   |
| Caller neither won nor drew                    | **403** — they know the competition exists |
| Otherwise                                      | 200, rolling or replaying as above         |

403 for the loser follows task [21]'s precedent: hiding a resource the caller can plainly see on
their own dashboard would confuse rather than protect.

## Test requirement

**`LootBoxRollerTests`**:

1. A seeded roll is reproducible.
2. Coins land inside the period's band, for each of the three period types.
3. **Bonus rewards are rare** — over many rolls the rate sits near 10%, not 0% and not 50%.
4. **The pool never offers a `PausesCompetition` reward.**
5. An empty pool falls back to Coins.

**`LootBoxOpenTests`**:

6. The winner opens and receives Coins, credited to their balance.
7. **Opening twice returns the identical result and credits once** — the idempotency requirement.
8. **On a win-win both partners open, both are credited, and both get the same prize.**
9. The loser is refused, and their balance is untouched.
10. A voided competition is refused.
11. Another household's competition is not found.
12. A bonus-reward roll writes a `Redemption` and credits no Coins.
13. A bonus-reward replay does not write a second `Redemption`.
14. Opening clears `unopenedLootBox` on the current-standing endpoint — the two features agree.
