## Task

[53] Add loot box reveal UI: triggers when a settled competition hasn't been opened yet.

`project-plan.md`'s terminology table: *"Loot box — the reveal event when a competition period closes
and you (or both of you, on a win-win) won. Not a purchasable mechanic — only earned."* This is the
one place in the app where the name Dwelloot pays off, and it is the last unbuilt piece of the
economy: [51] spends Coins, and this is where they come from.

---

## 1. What the API does, and the three constraints it puts on the copy

```
GET /api/households/45/competitions/current
→ … "unopenedLootBox": { "competitionId": 453, "periodType": "Daily",
                          "won": true, "isWinWin": false }

POST /api/households/45/competitions/453/open-box
→ 200 { "competitionId": 453, "result": "coins", "coinsAwarded": 22, "reward": null }
  or  { "competitionId": 55,  "result": "bonusReward", "coinsAwarded": null,
        "reward": { "id": 7, "title": "Foot massage" } }
```

The coins shape is a body captured live in [51]. The bonus shape is from `LootBoxDtos.cs`, where
**`CoinsAwarded` is `int?`** — so a bonus result carries `coinsAwarded: null` rather than 0.

**Constraint 1: the box payload carries no dates.** `unopenedLootBox` has `competitionId`,
`periodType`, `won` and `isWinWin` — nothing else. So the reveal cannot say *"you won yesterday"*,
and it must not try: log `045` established that period instants are UTC at **local** midnight, so
every naive date read is off by a day. The copy is derived from `periodType` alone — *"the daily
duel"* — and `periodLabel` from `standing.ts` is deliberately **not** reused, because it returns
"Today"/"This week" for the period *in progress* and this box is always from a period that has
closed.

**Constraint 2: `won` is always true, and losers get no box at all.** Log `025` settled it in review:
*"only winners, and both partners on a win-win, get the reveal. Losers get nothing"* — so
`unopenedLootBox` staying null for a loss is correct rather than a gap, and there is no losing state
to build. The handover's deferred-debt table says the same: *"Losers get nothing; no 'reward since
removed' state is needed."*

**Constraint 3: boxes queue, oldest first.** `UnopenedLootBoxAsync` orders by `PeriodStart` and takes
the first, so *"a partner returning after several days works through them in order rather than
seeing the most recent and silently losing the rest."* The reveal therefore has to handle **opening
one box and finding another underneath** — which falls out of invalidating `Competition`, and is
worth a test because it is the behaviour a returning user actually meets.

### Two more facts that shape the screen

**Opening is idempotent and rolls once** (log `025`): the first open rolls, stores the result on the
competition, writes a claim and credits; a repeat returns the stored result and credits nothing. So
the client does not need to defend against a double-open for correctness — but the button is still
disabled in flight, because two identical results appearing is a confusing thing to show.

**A bonus reward is already claimed.** Opening a bonus box writes a **zero-cost `Redemption`**, which
is what makes the prize real rather than a label on a competition row. The copy has to say so, or a
user will go to the Store and try to buy the thing they just won.

---

## 2. Decisions

**1. `result` is the discriminator, never the shape of the payload.** `coinsAwarded` is nullable and
`reward` is nullable, so "which kind of prize is this" is answerable two ways — and only one of them
is the contract. Reading `coinsAwarded !== null` would be a second source of truth that agrees with
the first until the day it does not. Same rule as [51]'s disclosure reading the flag rather than the
title.

**2. Its own component, not a section of `HeadToHeadCard`.** The card is about the period in
progress; this is about a period that has finished. They share one query, and RTK Query dedupes it —
`LootBoxReveal` mounting alongside the card costs no extra request.

**3. It sits above the head-to-head card.** A prize waiting to be opened outranks today's score, and
it is transient: once opened it disappears, and the dashboard returns to its usual shape.

**4. Opening invalidates `Me`, `Competition`, `Reward`, `Redemption` and `Badge`** — all five, and
each for a reason rather than by reflex. `Me` is the Coin balance. `Competition` is what surfaces the
next queued box or clears the card. `Reward` because `?affordable=` is computed server-side from the
balance ([51]'s finding). `Redemption` and `Badge` because a bonus prize writes a redemption, which
is what the Notices feed lists and what First-redemption counts.

Unlike [51]'s redeem, this one is unconditional: `Competition` invalidation is not a cost here, it is
the mechanism.

**5. The animation is a pop, and it obeys `prefers-reduced-motion`.** One `@utility` beside `spark`
in `theme.css`, using `scale`/`rotate` in the keyframes and never `transform`, because log `045`
found that baking positioning into an animation leaves the element stranded when reduced motion
switches the animation off. No glow and no gradient — `design-tokens.md`'s flat-fill rule holds even
for the one celebratory moment in the app.

**6. The prize is a live region.** `role="status"` on the revealed prize, so opening the box
announces what was in it rather than silently replacing the button.

---

## 3. Test requirement

**`lootBoxCopy.test.ts`** — the pure module.
1. Each `periodType` produces its own sentence.
2. **Win-win says both of you**, and a solo win does not.
3. A coins prize reads as the amount from the response; a bonus prize reads as the reward's title.
4. **The discriminator is `result`** — a `bonusReward` payload that also carries `coinsAwarded` still
   reads as the reward, and a `coins` payload with a non-null `reward` still reads as Coins. This is
   the assertion that fails against a component sniffing the nullable fields.

**`LootBoxReveal.test.tsx`**
5. **Nothing renders when `unopenedLootBox` is null** — both directions, against the same component
   that renders when it is present.
6. The invitation names the period and does not claim a date.
7. **Nothing is sent until Open is pressed**, asserted on the fetch spy.
8. The coins amount comes from the response, not from anything the client knew beforehand.
9. A bonus prize shows the title **and** says it is already claimed.
10. **Opening reveals the next queued box** — the returning-partner case.
11. The balance is refetched.
12. A server refusal is shown in its own words.

Then a live pass: household 45 has an unopened box (competition 453) staged by approving a pending
chore, which is how a period settles.
