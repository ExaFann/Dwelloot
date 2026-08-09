## Task

[45] Add dashboard head-to-head widget wired to the API: pulls from `competitions/current`.

`wireframes.md` §1: *"Head-to-head 'tug' widget: both partners' current-period Points side by side
(**not a leaderboard — a duel**)."* That parenthesis is the design brief. Two names, two numbers, and
a bar that visibly leans.

## Scope

The tug widget only. The wireframe's other dashboard pieces — streak flame, Coins balance, quick-add
row, recent feed — are [46] and [53], **except** for one that has no owner; see the flag at the end.

## What the API actually returns

Probed before writing anything, as every task since [41] has.

```
GET /api/households/45/competitions/current
→ { "periodType": "Daily", "periodStart": "2026-08-02T12:00:00Z", "periodEnd": "2026-08-03T12:00:00Z",
    "myPoints": 10, "partnerPoints": 0, "settled": false, "voided": false, "unopenedLootBox": null }
```

**The perspective mirrors.** The same period fetched as the other partner returns
`myPoints: 0, partnerPoints: 10`. So the widget never has to match user ids — "me" is always the
caller. Confirmed by fetching as both accounts.

### Finding 1 — a solo household is indistinguishable from a quiet one

A household with one member returns a perfectly ordinary payload: `0–0`, `settled: false`,
`voided: false`. There is **no field that says "you have no partner yet"**.

That state is reachable and common: `AuthGate` lets anyone with a household onto the dashboard, and
creating a household then waiting for your partner to join is the normal path out of [44]. Showing
that user a duel scoreboard reading "0 – 0, tied" is wrong — per handover §4.8 fewer than two members
is *not a contest*, and that 0–0 will never settle into anything.

`GET /api/households/{id}` is what distinguishes them — it returns `members: [{ id, name }]`. So the
widget needs it, and gets the partner's **name** from the same request, which the wireframe wants
anyway ("Alex vs Sam" rather than "You vs Partner"). One extra request, two things it is needed for.

### Finding 2 — period boundaries are UTC instants at local midnight, so naive date formatting is off by a day

`periodStart` is `2026-08-02T12:00:00Z`. New Zealand is UTC+12, so that instant **is** local midnight
on the **3rd**. Settlement runs in `Competition:TimeZone` (handover §4.6), not UTC.

| | Value |
|---|---|
| `periodStart.slice(0, 10)` — the obvious thing | `2026-08-02` ❌ |
| Formatted in `Pacific/Auckland` | `3/08/2026, 12:00 am` ✓ |

Monthly is worse: a period starting 1 August is `2026-07-31T12:00:00Z`, so the naive slice reports
**July**. `toISOString()`, `getUTCDate()` and `slice(0,10)` are all wrong here, and wrong in a way
that looks plausible.

This widget sidesteps it — the period is rendered as **"Today" / "This week" / "This month"** from
`periodType`, which is better copy than a date range anyway. Recorded because [46] onward render real
timestamps (`completedAt`) and will hit exactly this.

### Decisions

**1. The standing is computed by a pure function, not inside the component.** `describeStanding` takes
the payload plus whether a partner exists and returns a discriminated result. Every rule below is then
testable without rendering anything, and the component becomes a renderer.

**2. Win-win is deliberately *not* derived.** A settled, equal, non-zero period **is** a win-win under
§4.8, and it is tempting to infer that from `settled && myPoints === partnerPoints && myPoints > 0`.
Not done: that duplicates a settlement rule the payload does not state, so if the server's definition
ever moved the UI would disagree silently — the handover's §5.1 "expectation derived from a duplicated
query" in production form. A settled tie says **"Tied"**, which is true under every definition.
`unopenedLootBox` is what actually tells a user they won something, and [53] renders it.

**3. `unopenedLootBox` is read but not rendered.** [53] owns the reveal. The widget must not break
when the field is populated, and a test covers that.

**4. The bar is `aria-hidden`.** Every number and every judgement it encodes is already in the text
beside it, so exposing a decorative div to assistive technology would only duplicate. The alternative
— `role="img"` with a generated label — restates what the adjacent text says.

**5. A 0–0 bar splits 50/50** rather than collapsing to nothing. Zero-width segments read as a broken
component, and "even" is the honest depiction of a tie.

## Test requirement

`describeStanding` first, as a table — every state, with literal expectations:

| State | Condition |
|---|---|
| No partner | household has fewer than 2 members |
| Nothing logged | both zero, live |
| Leading / trailing | by a margin, both directions |
| Tied with points | equal and non-zero, live |
| Voided | `voided: true` — must override ahead/behind |
| Settled | `settled: true`, each of won / lost / tied |

Both directions throughout: leading and trailing are separate cases, not one assertion with the
arguments swapped, because a function that ignored its inputs and always said "ahead" would pass a
single-sided test.

Share arithmetic gets its own cases: `10/0 → 100/0`, `0/0 → 50/50`, `5/15 → 25/75`, and a large-number
case to catch integer rounding drifting the two shares off 100.

Then the component: loading, error, and each state rendering the right text — plus the **absence**
checks that matter, namely that a voided period does not also claim someone is ahead, and that a
populated `unopenedLootBox` renders nothing about a loot box.

Finally an end-to-end pass against the running API with two real accounts.

