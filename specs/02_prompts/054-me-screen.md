## Task

`wireframes.md` §5, in full:

> **Me** — Profile: Coins, lifetime Points, win streak, badge grid. Household settings: invite code,
> rename, leave. No ranking/leaderboard section — redundant with the Dashboard's head-to-head widget
> in a 2-person household.

That sentence is one screen and three plan tasks: [54] is the badge grid, [55] the stats, [56] the
household settings. `api-design.md` §5 lists exactly these endpoints together — `GET /api/auth/me`,
`GET /api/badges`, and the household details/rename/leave trio.

**Merged**, on the rule the owner set during [47] and applied since to [46a]/[47a], [48]/[49]/[50]
and [51]/[52]: *a screen is the unit of work.* A Me screen with a badge grid and no way to leave a
household is the "looks finished, is not" state that got [46] and [47] sent back.

[55] also owns **the final placement of the sign-out control**, which landed early in [43] under the
`/me` placeholder because no task owned it and without it the only exit from a session was waiting
out the 60-minute token.

---

## 1. What the API does

Probed against the running API before writing anything. These bodies are the test fixtures.

```
GET /api/badges
→ { "items": [ { "id": 1, "name": "First chore",
                 "criteria": "Get your first logged chore approved.",
                 "unlocked": true, "unlockedAt": "2026-08-03T10:06:59.98747Z" },
               { "id": 2, "name": "3-day win streak", "criteria": "…",
                 "unlocked": false, "unlockedAt": null } ] }

GET   /api/households/45 → { id, name, inviteCode, members: [ {id,name}, … ] }
PATCH /api/households/45  {"name":"The Nest"}       → 200 { "id": 45, "name": "The Nest" }
PATCH /api/households/44  (not mine)                → 404 { "error": "Household not found." }
```

Three findings that changed the build:

**The household name cap is 60, not 80.** Chores and rewards are capped at 80 (`choreValidation`,
`rewardValidation`); this one answers *"Name must contain at least one visible character and be at
most **60** characters once surrounding and repeated whitespace is removed."* Copying the 80 across
would have produced a client that lets through a name the server rejects. Confirmed from both sides —
60 characters is a 200, 81 is a 400.

**`name: null` is a *clean* field error here, unlike `points: null` and `coinCost: null`.**

| Payload | Response |
|---|---|
| `{"name": null}` | `{"Name":["The Name field is required."]}` — on the field, presentable |
| `{"points": null}` (log `047`) | `{"$.points":["…could not be converted to API.Dtos…"]}` — the DTO leak |

The difference is the CLR type, not the API's care: `Name` is a `string`, so JSON deserialisation
succeeds and model validation runs. `Points` and `CoinCost` are non-nullable `int`s, so `null` fails
*before* validation and the reply names the request type. **So the leak is specific to value-typed
fields** — worth stating, because the rule this project has been carrying since [47] is "validate
client-side because the server's rejection is unpresentable", and here it simply is not. The rename
form still validates client-side for the round trip and for the 60-character cap, but not because of
a leak.

**Renaming returns `{ id, name }` only**, not the full household — so `Household` has to be
invalidated rather than the response being merged into the cache.

### Leave, and the one thing this task will not do live

`POST /api/households/{id}/leave` has two branches (log `015`):

- **One of two leaves** — `household_id` cleared for the leaver, `is_full` reset so the remaining
  partner can pair with someone new.
- **The last member leaves** — the household row is **deleted**, and its activities, rewards,
  competitions and claims cascade with it.

Both were verified end to end against real PostgreSQL in [16]. **This task does not exercise leave
live**: doing so would dismantle household 45, which is the fixture every remaining frontend task
depends on. Built, unit-tested, and stopped at the confirmation — recorded in §5 rather than implied.

---

## 2. Decisions

**1. The leave warning is derived from `members.length`, and says which branch will happen.** With a
partner: *"Sam stays, and can pair with someone new."* Alone: *"the household and everything in it —
chores, rewards, history — is deleted."* The second is irreversible and nothing else in the app tells
the user so. Same principle as the `pausesCompetition` disclosure in [51]: state the consequence at
the point of the decision, derived from data rather than assumed.

**2. Leaving does not navigate.** It invalidates `Me`; `householdId` goes null and **`AuthGate`
redirects to `/pairing`**. Handover §3: the gate owns every identity-driven routing decision, and
`LoginPage` already proved what a second mechanism costs — it raced the gate and silently discarded
the destination.

It also invalidates every household-scoped tag, because every one of them is now unreadable: a
departed member gets 404 from `GET /api/households/{id}` immediately (verified in [16]).

**3. Badges are not yellow.** `design-tokens.md` §2.1 reserves yellow for **Coins, loot and pending**,
and `project-plan.md`'s terminology table is explicit that *"Points and Badges aren't called loot —
loot specifically means 'came out of a box'"*. So an unlocked badge wears purple, the user's own
colour. Getting this wrong would quietly undo a distinction the whole vocabulary rests on.

**4. `criteria` is rendered from the response, never from a local copy.** Log `027` recorded this as
an obligation on this task: the column exists to be the badge grid's "how do I earn this" line, log
`026` pins the unlock thresholds against that same seeded text, and a second copy in the client would
be free to drift from the rule that actually fires. A locked badge with no criteria is a grey square
that tells the user nothing.

**5. The grid never reorders.** The endpoint sorts by id and log `027` chose that over
unlocked-first *"because a badge grid that reshuffles itself when you unlock something is a worse
grid"*. The client preserves the server's order rather than re-sorting.

**6. Three stats, and the streak is the current one.** `/api/auth/me` returns `currentWinStreak` and
no longest — `users.longest_win_streak` exists but is not exposed. The wireframe asks for "win
streak" and that is satisfied; the absence is recorded rather than worked around.

---

## 3. Test requirement

**`householdValidation.test.ts`** — blank and whitespace-only names, the **60**-character boundary
from both sides, and that trimming is measured rather than the raw length.

**`badgeDisplay.test.ts`** — the pure module: an unlocked badge reports its unlock time, a locked one
reports its criteria as the thing to do, and the count is "N of M unlocked" read from the list rather
than hard-coded to six.

**`MePage.test.tsx`**
1. The three stats come from `/api/auth/me`.
2. **All six badges render, locked ones included, each with its `criteria`** — the reason `criteria`
   is in the payload.
3. Unlocked and locked are distinguishable by **text**, not only by colour.
4. **The order is the server's** — asserted against a response deliberately returned out of id order,
   so a client-side sort fails.
5. The household name, invite code and both members render.
6. **Renaming sends the trimmed name and nothing is sent for an invalid one** — asserted on the fetch
   spy, both directions.
7. **The leave warning names the consequence, and differs between one member and two.**
8. **Nothing is sent until leaving is confirmed.**
9. Leaving does **not** navigate — asserted as the absence of a redirect, with `Me` invalidated
   instead.
10. Sign out is present.

Then a live pass — everything except actually leaving.
