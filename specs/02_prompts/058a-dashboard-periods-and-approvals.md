## Task

[58a] Week and month on the dashboard, day-boundary chore clearing, an approval prompt and a nav
badge. Owner-requested, raised after reviewing the running app and slotted in before [59].

Four changes, and they turn out to be one story: **a pending chore is worth nothing until it is
approved**, so the app has to stop hiding that fact.

## Spec

### 1. Week and month — no backend work at all

`GET .../competitions/current` has accepted `?periodType=Daily|Weekly|Monthly` since [24]; settlement
covered all three from [23]. Confirmed against the running API before writing anything:

```
Daily    → 0–0      (2026-08-05T12:00Z … 08-06T12:00Z)
Weekly   → 120–5    (08-02 … 08-09)
Monthly  → 120–5    (07-31 … 08-31)
?periodType=Yearly  → 400 {"periodType":["The value 'Yearly' is not valid."]}
```

That first line is also the bug in §2, sitting in the data: **the day had reset to 0–0 while the
chore columns still listed yesterday.**

**Shape.** The card was one period. It becomes identity + activity at the top (avatars, names, each
partner's chores) and **three period panels** below — day, week, month — each with its own score,
rope and verdict. The big per-person number moves into the panels, because with three periods a
single number beside a name could only ever be one of them.

**Swipe on a phone, all three at once from `lg`.** A horizontal snap-scroller that becomes a
three-column grid. Scroll snapping is the browser's own gesture, so there is no touch handler to get
wrong and keyboard and trackpad scrolling keep working; a swipe library would have been a dependency
to reimplement momentum badly.

Each panel is a `role="group"` labelled with its period, so the three verdicts are distinguishable to
a screen reader — "you won by 25" is ambiguous when three panels each carry one.

### 2. The chore columns clear at the day boundary

The head-to-head is about the current period, but the columns were "the last N logs, ever". At a day
boundary the scores reset to 0–0 while the columns still showed yesterday's approved chores — so the
card said *nothing logged today* directly above a list of things.

`choresForPeriod` keeps two things:

1. **Anything from this period**, whatever its status — it is what the score is made of.
2. **Anything still `Pending`, however old** — it has not been dealt with, and it is precisely what is
   holding up a settled result. Clearing it would hide the only thing left to act on.

Approved and rejected chores from earlier periods go; they belong to a duel that is over.

`periodStart` is a UTC instant at *local* midnight, so both sides are compared **as instants** — no
date-string slicing, which would report the wrong day in NZ (log `045`).

### 3. A prompt on the dashboard, and a badge on the tab

Both read one hook, `usePendingCount`, because the failure worth preventing is the two disagreeing.

**The prompt states the consequence rather than nagging**: points only count once approved, so the
duel cannot be settled — and no loot box can be won — while chores are outstanding. That is measured
behaviour, not a guess: [48] watched `partnerPoints` go 0 → 10 the moment a log was approved.

**It is a card, not a modal.** The owner asked for a prompt (提示框); this is a prominent card at the
top of the dashboard rather than a dialog over it, because the dashboard is the first screen after
every sign-in and a modal there would be a thing to dismiss every morning — the fastest way to teach
someone to dismiss it unread. It sits directly above the standing it is explaining.

**The badge rides the icon**, not the tab, so it sits in the same place whether the nav is a bottom
bar or a left rail. It caps at `9+`. The number is also in the tab's accessible name — *"Notices, 1
waiting on you"* — so a screen reader gets the count without a second live region, rather than a bare
red dot that says only "something".

Red is the destructive colour in this palette, and a notification badge is the one conventional
exception: users read a red count as *attention*, not as *danger*. Flagged rather than assumed.

## Test requirement

The two hazards here are both stub hazards, and both have bitten this project before.

1. **`HeadToHeadCard`'s `fetch` stub must route by `periodType`, not by pathname.** Matching on the
   path alone returns the same body for all three panels, so `getByText('25')` finds three nodes and
   a card that rendered the day three times would pass. Include a direct assertion that the **week's
   number is not present in the day's panel**.
2. **`routes.test.tsx`'s catch-all must be a 404, not the `/me` body.** Putting `usePendingCount` in
   `BottomNav` means **every screen** now requests `/api/activity-logs`; a stub that answers a path it
   was never told about will make `data.items` undefined, throw inside the hook, and render the route's
   error element. It fails **only under full-suite load** and passes in isolation, because the
   assertion is a static `h1` — so whether it passes depends on whether it beats the crash. Stub the
   queue path *and* make the fallback a 404.
3. **`choresForPeriod`**, both rules and both directions: an approved chore from the previous period
   is **gone**; a `Pending` chore from the previous period **survives**; comparison is by instant, with
   a fixture whose local date and UTC date differ so date-string slicing would fail.
4. **`usePendingCount` is the single source** — the prompt's count and the badge's count come from one
   hook, asserted together so the two cannot drift.
5. The badge caps at `9+`, is absent at zero, and the count appears in the tab's **accessible name**.
6. Each period panel is a `role="group"` with its period in the label.

Then a live pass with one pending chore staged on the partner account: badge `1`, accessible name
*"Notices, 1 waiting on you"*, prompt *"1 chore is waiting on you"*, and the three panels reading the
day, week and month scores independently. Two consecutive full-suite runs, because the flake this
task can reintroduce is load-dependent.
