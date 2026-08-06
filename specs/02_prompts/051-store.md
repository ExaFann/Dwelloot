## Task

The Store tab. `wireframes.md` §4:

> Reward catalog (global defaults + custom), sort/filter/search/pagination, cost shown in Coins not
> Points, Redeem disabled if balance is insufficient. No house-board tab.

**Merged from two plan tasks, and carrying a third.** [52] ("redeem button, balance check,
confirmation state") is a control on this screen, not a screen of its own — the same call the owner
made when `[46a]` and `[47a]` were folded back and when [49]/[50] were absorbed into [48]. A store
you cannot buy from is the "looks finished, is not" state that got [46] and [47] sent back.

**Rewards CRUD ([29]) lands here too**, exactly as chore CRUD landed in [47]. Log `047` said so at
the time — *"the mirror gap — rewards CRUD from [29] — belongs inside the Store screen ([51]) the
same way"* — and the handover's deferred-debt table assigns it here. `POST`, `PATCH` and `DELETE
/api/rewards` were built in [29] and this is their only consumer; without them the wireframe's
"defaults **+ custom**" is unreachable and a household is stuck with the eight seeded rewards.

So this screen owns: the catalogue with all four of sort/filter/search/pagination, the Coin balance,
redeeming with a confirmation, the `pausesCompetition` disclosure, and full reward CRUD.

---

## 1. What the API actually does

Everything below was probed against the running API (household 45, Alex, balance 0) before any code
was written. The fixtures in the tests are these bodies verbatim.

### The catalogue

```
GET /api/rewards
→ { "items": [ { "id": 361, "title": "Foot massage", "coinCost": 25,
                 "pausesCompetition": false } ], "total": 8 }

GET /api/rewards?sort=coinCost&descending=true   → 80,45,40,35,30,25,20,15
GET /api/rewards?sort=nonsense                   → 400 "Unknown sort field. Valid values: title, coinCost."
GET /api/rewards?search=MASSAGE                  → 2 items, case-insensitive
GET /api/rewards?affordable=true    (balance 0)  → { "items": [], "total": 0 }
GET /api/rewards?affordable=false   (balance 0)  → all 8
GET /api/rewards?page=3&pageSize=3               → the last 2 of 8, "total": 8 (unpaginated)
GET /api/rewards?page=0                          → clamped to page 1
```

The two valid sort fields come from the API's own 400 rather than from a guess, as in [47].

**All three affordability states are honoured**, which is why the filter offers three and not two.
Log `028` argued the point when it built them: a client that can send `true` but not `false` makes
the complement branch dead code, and "what am I saving for" is a view the screen should have.

### Redeeming

```
POST /api/redemptions {"rewardId": 361}   (balance 0) → 400 {"error":"Not enough Coins."}
POST /api/redemptions {"rewardId": 99999}            → 404 {"error":"Reward not found."}
POST /api/redemptions {"rewardId": <archived>}       → 404 {"error":"Reward not found."}, byte-identical
```

A success returns `{ id, rewardId, coinsSpent, coinsRemaining, redeemedAt }`. **`coinsRemaining` is
the authoritative post-spend balance** and the screen must render *that*, not `balance − cost`. This
is [48]'s lesson in a second place: a UI that does its own arithmetic is guessing, and it is wrong
whenever the cached balance was stale — which in a two-person app with one shared economy is an
ordinary situation, not an edge case.

### Managing rewards — and the exact defect [47] shipped, waiting in a second place

```
POST   /api/rewards {"title":"  Probe reward  ","coinCost":12,"pausesCompetition":true}
                                              → 201 {"id":375,"title":"Probe reward",…}   (trimmed)
PATCH  /api/rewards/375 {"title":"Probe renamed"}   → 200, coinCost untouched
DELETE /api/rewards/375                             → 204;  again → 404 "Reward not found."
```

The finding that matters:

| Payload | Response |
|---|---|
| `POST` `coinCost: 0` | `{"CoinCost":["The field CoinCost must be between 1 and 2147483647."]}` — clean, on the field |
| `POST` `coinCost: null` | `{"request":[…]}` + `{"$.coinCost":["The JSON value could not be converted to **API.Dtos.Rewards.CreateRewardRequest**…"]}` |

That is the `API.Dtos…` leak from log `047`, byte-for-byte the same shape, one DTO along. `CoinCost`
is a non-nullable `int`, so `null` fails **JSON deserialisation** before model validation runs, and
neither returned key is a form field — so both land in the unclaimed-error list and are rendered
verbatim to the user. `rewardValidation.ts` mirrors the server's rules so neither payload is ever
sent, and the tests assert **on the fetch spy that no request goes out**, because "shows an error"
and "did not call the server" are different claims and only the second prevents the leak.

**An asymmetry worth recording:** `PATCH` with `coinCost: null` is a clean **200** and means "leave
this field alone" (`PatchRewardRequest.CoinCost` is `int?`). So the *same* empty box, encoded the
same way, is a harmless no-op when editing and an unpresentable leak when creating. The editor sends
both fields in both modes and validates before either, so the difference never reaches a user — but
it is exactly the kind of asymmetry that makes "it worked when I tested editing" a false negative.

Title rules match chores: required, ≤ 80 characters after whitespace normalisation, trimmed
server-side. Both 400s captured above.

---

## 2. Decisions

**1. `coinsRemaining` from the response, never client arithmetic.** Above. Asserted with a stub whose
`coinsRemaining` deliberately disagrees with `balance − cost`, so a UI doing its own sum fails.

**2. Redeeming asks first.** Spending is the only irreversible user action in the app — there is no
`DELETE /api/redemptions`, the same absence that made [46] invent the undo window. A confirmation is
the honest equivalent here: undo cannot exist, so the decision point moves in front of the request.
It also narrows the **double-redeem race** (backend debt from log `030`, still open) by removing the
double-click path — the button that fires the request is not the button the user was already
double-tapping, and it is disabled while in flight. **This mitigates, it does not fix**; two devices
can still race, and only the backend can close that.

**3. The `pausesCompetition` disclosure is derived from the flag, in two places.** A always-visible
tag on the card, and the full sentence inside the confirmation — *"nobody wins today and neither of
you gets a loot box"*. Four separate documents require this copy at the point of redemption
(`Reward.PausesCompetition`'s remarks, `DefaultRewards`, `api-design.md` §4, log `028`), and [28]
added the field to `GET /api/rewards` specifically so this screen would not have to match on the
title *"Full chore day off"*. Nothing here reads the title.

**4. Redeeming invalidates `Competition` only when the reward pauses it.** `invalidatesTags` is a
function of the argument. A pausing redemption voids that day's duel, so the standing genuinely
changes; an ordinary one cannot move a score. This is [46]'s reasoning applied again —
`competitions/current` runs **lazy settlement on every call** (§4.7), so a needless invalidation is
real server work for a guaranteed no-op. Asserted in both directions.

`Me` (the balance), `Reward` (because `?affordable=` is computed server-side from that balance) and
`Redemption` (the Notices feed) are always invalidated. `Badge` too — redeeming unlocks First
redemption and Big spender (log `030`). Nothing subscribes to `Badge` until [54]; it costs nothing
and is correct now rather than a thing [54] has to remember.

**5. Page size 6, not 20.** The rows here are taller than the Log tab's — each carries a cost, an
action and sometimes a disclosure — so six already overfills a 375px screen. It also means the
**default** eight-reward household pages 6 + 2, so the control is exercised by the ordinary case
rather than only by a household that has added three custom rewards. A page size that hides the
pagination on every real household would make "pagination is built" a claim no one could see.

**Changing the search, sort or filter returns to page 1.** Without it, narrowing a filter while on
page 2 shows an empty list that looks like "no results".

**6. A native `<select>` for sort and toggle chips for the filter.** Radix is this project's planned
source of accessible primitives, but it is for the primitives the platform does *not* give you
(dialog, tabs, combobox). A native select is already accessible, already keyboard-operable and
already themed by `color-scheme`; installing a dependency to reproduce it would add bundle for no
behaviour. The filter is three chips with `aria-pressed`, matching the selection idiom the Log and
Notices tabs already use.

**7. Editing is reached from a visible button on each card.** The Log tab reaches its editor through
selection, because there the row *is* a toggle. Here the row is not a button — it carries its own
Redeem — so selection would mean nothing, and the pencil the owner rejected in [47] was rejected for
being an icon that did not look or behave like a control inside a row that did. This one is a real
bordered `pressable-sm` button with an `aria-label` naming its reward. **"+ New reward" sits under
the list**, the placement `design/prototype.dc.html` uses and [47] followed.

**8. No default-vs-custom distinction**, for the third time: copy-on-creation means a household owns
its copies of the eight defaults and `GET /api/rewards` carries no such field (§4.1). The prototype's
All/Defaults/Custom chips are as unimplementable here as they were in [47]. The filter axis is
affordability, settled in [28].

---

## 3. Test requirement

Real test files. Three units and one page.

**`rewardValidation.test.ts`** — mirrors `choreValidation.test.ts`: blank and whitespace-only titles,
the 80-character boundary from both sides, a missing cost, a non-integer cost, zero and negative.

**`storeQuery.test.ts`** — the pure module turning UI state into a query string. Every sort option
maps to the `sort`/`descending` pair the API accepts; `affordable` is sent for both `true` **and**
`false` and omitted for "all"; an empty search is omitted rather than sent as `search=`.

**`RewardEditor.test.tsx`** — create, rename, re-price, the `pausesCompetition` checkbox round-tripping
in both directions, remove behind a confirmation, and **no request sent for any invalid draft**,
asserted on the fetch spy.

**`StorePage.test.tsx`**
1. Lists the catalogue with each cost in Coins.
2. The balance is shown, from `/api/auth/me`.
3. **Redeem is disabled when the balance is short and enabled when it is not** — both directions, so
   a blanket-disabled screen fails.
4. **Nothing is sent until the confirmation is confirmed** — asserted on the fetch spy.
5. **The success message uses `coinsRemaining` from the response**, with a stub whose value
   disagrees with `balance − cost`.
6. The `pausesCompetition` disclosure appears for the flagged reward and **not** for the others.
7. **A pausing redemption refetches `competitions/current`; an ordinary one does not.**
8. Search, sort and the three filter states each send the right query, and each returns to page 1.
9. Pagination pages through and reports position from `total`, not from the page's own length.
10. The 400 "Not enough Coins." is surfaced as the server's sentence.
11. Empty states: no rewards, no search matches, and nothing affordable.

Then a live pass against the running API with both accounts.
