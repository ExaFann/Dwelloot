## Task

[23] Add competition settlement service + unit tests: lazy, on-request settlement logic covering
win/lose/win-win (including the "both must have ≥1 approved log" rule) and the "day off" void case,
tested against fabricated period data **before wiring to any endpoint**.

`project-plan.md` calls this the riskiest piece, and the task explicitly forbids wiring it up. No
controller in this task — task [24] does that.

## Spec

### Four decisions the plan does not make

**1. Which timezone defines a "day".**

`relational-model.md` and log `007` both flag that the calendar day of a timestamp is part of the
scoring rules, and both defer the boundary itself to this task.

UTC is the tempting default and is wrong for the users. This is an NZ assessment; NZ is UTC+12/+13,
so a UTC day boundary falls at **noon or 1pm local**. Chores done after lunch would count toward
tomorrow, and the evening dishes would decide the _next_ day's duel. That is not a subtle edge case
— it is most of the day, every day.

No timezone column exists on `Household` or `User`, and adding one is a migration plus a UI this
task has no business introducing. So: a single application-level timezone in configuration,
`Competition:TimeZone`, defaulting to `Pacific/Auckland`. Days, weeks and months are computed in
that zone and converted to UTC for storage and querying.

Per-household timezones are the correct long-term answer and are recorded as such — this is a
deliberate simplification for a two-person app with one deployment, not an oversight.

Weeks start **Monday** (ISO, and the NZ norm). Months are calendar months.

**2. Which timestamp decides period membership: `CompletedAt`.**

A log belongs to the period it was _done_ in, not the one it was approved in. Approval can lag by a
day; the work did not move.

**3. Settlement must wait for pending approvals — a grace period.**

This follows directly from decision 2 and is the failure the plan does not mention. Sam logs at
23:00 Monday; Alex approves at 09:00 Tuesday. If anyone opens the app at 08:00 Tuesday, Monday
settles with Sam's log still `Pending`, it counts for nothing, and Alex wins a day he did not win.
That is not an edge case, it is the normal rhythm of a chores app.

So a closed period is **not settled while it still contains pending logs**, up to a grace of 48
hours after the period ends. After that it settles with whatever was approved — otherwise a partner
who never decides could freeze the competition indefinitely.

**4. Settlement does not roll the loot box.**

Log `009` assumed the roll would happen here, so that `open-box` could be idempotent by simply
revealing a stored value. That assumption predates `competition_claims` (task [11]), which now
provides idempotency directly — a partner who has claimed has a row, and re-opening reads it back.

The task description for [23] lists win/lose/win-win and the void case and says nothing about
rolling; task [25] is explicitly "weighted random Coins/bonus-reward roll". So the roll belongs to
[25]. Settled rows leave `CoinsAwarded` at 0 and `BonusRewardId` null until then. Log `009`'s note
is corrected rather than left to mislead [25].

### The rules

For one period of one household:

1. **Fewer than two members → do not settle.** A competition needs two people. A household mid-way
   through a partner change has no meaningful duel, and inventing a winner would be worse than
   waiting.
2. **Void (daily only).** If either partner redeemed a `PausesCompetition` reward whose
   `RedeemedAt` falls inside the period, the period settles with `IsVoided = true`, no winner and no
   win-win. Per `project-plan.md` this applies to the **daily** period only — weekly and monthly are
   independent Points sums, not tallies of daily results, so a paused day simply contributes fewer
   points to them.
3. **Scores** are the sum of `PointsAwarded` over each partner's `Approved` logs whose
   `CompletedAt` falls in the period. The snapshot column from task [19], never the chore's current
   points.
4. **Win-win** requires equal scores **and both partners having at least one approved log**. The
   second half is the loophole `project-plan.md` names: without it, a day where neither partner did
   anything would settle as a mutual win and hand out two loot boxes for nothing.
5. **A win** is simply the higher score. One partner doing a single chore while the other does
   nothing is a win, not a win-win — the ≥1 rule gates the _tie_, not winning.
6. **Equal and not both active** (in practice 0–0) settles with no winner and no win-win. The row
   is still written, so the period is not re-examined forever.

### Shape

Two services, so the timezone arithmetic is testable without touching the database:

- `PeriodCalculator` — given an instant and a period type, produce the period containing it and
  enumerate closed periods. Pure, no EF.
- `CompetitionSettlementService` — the rules above, plus idempotency against the unique index on
  `(household_id, period_type, period_start)`.

## Test requirement

This is the task the task decomposition singles out for tests, so they are the deliverable rather than a
formality.

**`PeriodCalculatorTests`** — the arithmetic, in isolation:

1. A daily period runs local midnight to local midnight, expressed in UTC.
2. **An evening chore in NZ belongs to that day, not the next** — the exact bug UTC boundaries would
   cause, asserted directly.
3. Weeks start Monday and run seven days.
4. Months are calendar months, including a 28-day February and a 31-day month.
5. Closed-period enumeration returns the periods that have ended and not the one in progress.
6. Daylight-saving transition days still produce contiguous, non-overlapping periods.

**`CompetitionSettlementTests`** — the rules, against fabricated period data:

7. A clear win records the winner, both scores, and no win-win.
8. **Equal scores with both partners active is a win-win**, with a null winner.
9. **Equal scores with neither partner active is not a win-win** — the loophole.
10. One partner active and the other not is a win, not a win-win.
11. Only `Approved` logs count; pending and rejected are ignored.
12. Only logs inside the period count — one immediately before and one immediately after are both
    excluded.
13. Scores use `PointsAwarded`, not the chore's current points.
14. **A `PausesCompetition` redemption in the period voids the daily competition** — no winner, no
    win-win.
15. **The same redemption does not void the week or month containing it.**
16. A redemption of an ordinary reward voids nothing.
17. A household with one member is not settled.
18. **Settlement is idempotent** — settling twice yields one row and the same result.
19. **A period with pending logs inside the grace window is not settled.**
20. The same period settles once the grace has passed.
21. Approving the pending log inside the grace window lets it settle, and the points count.
