## Task

[26] Add win-streak tracking + badge unlock logic + unit tests: updates
`CurrentWinStreak`/`LongestWinStreak` on settlement, checks badge criteria.

## Spec

### The streak rules

`project-plan.md`:

- "Winning the **daily** competition on consecutive days builds a win streak."
- "A tie (win-win) does not extend or break a win streak; **only an outright win does**."

So the rule is narrow, and stated as one sentence: **only an outright win changes anything.** The
winner's streak grows by one and the other partner's resets to zero. A win-win, a voided day, and a
day nobody won all leave both streaks exactly as they were.

Two consequences worth naming rather than discovering:

- **Weekly and monthly settlements do not touch streaks.** The rule says "the daily competition".
- **A voided day is treated like a tie.** `project-plan.md` describes it as "the same as if that day
  simply didn't run a competition", so it can neither extend nor break.
- **A 0–0 day is also treated like a tie.** It is not a win-win (it fails the both-must-be-active
  rule), but nobody won it either, and "only an outright win does" is the governing sentence.
  Breaking a streak because both partners had a quiet day would punish them for the same thing.

### Streaks are recomputed, not incremented

The obvious implementation increments the winner and zeroes the loser as each competition settles.
That is fragile in a way this codebase has already been bitten by: run it twice for the same
competition and the streak is wrong, permanently, with nothing to detect it.

Instead `CurrentWinStreak` is **derived** from the settled daily competitions, newest first: skip
ties and voided days, count consecutive wins, stop at the first loss. Running it repeatedly gives
the same answer, and a settlement that somehow never triggered progression heals on the next one.

`LongestWinStreak` is kept as `max(stored, current)`. It only ever grows, so it needs no history
walk.

### Badges

The six seeded in task [9], with the criteria their `Criteria` text already promises:

| Badge            | Unlocks when                 |
| ---------------- | ---------------------------- |
| First chore      | The user has ≥1 approved log |
| 3-day win streak | `CurrentWinStreak` ≥ 3       |
| First redemption | The user has ≥1 redemption   |
| 7-day win streak | `CurrentWinStreak` ≥ 7       |
| Century          | `LifetimePoints` ≥ 100       |
| Big spender      | ≥5 redemptions               |

Evaluation is idempotent: already-unlocked badges are skipped, and the unique index on
`(user_id, badge_id)` from task [9] is the backstop.

### Where badge evaluation is triggered — wider than the task says

The task ties badge checking to settlement. Taken literally that breaks "First chore": you log your
first chore, your partner approves it, and nothing happens until a day boundary passes. The badge
whose whole point is to fire on your first action would be the slowest to arrive.

Four of the six criteria are not settlement-driven at all — they depend on approvals and
redemptions. So evaluation is called from every point that can satisfy a criterion:

- **Settlement** (this task) — after streaks are recomputed, for both partners.
- **Approval and bulk-approval** (task [21]/[22], amended here) — where `LifetimePoints` and approved
  log counts change.
- **Redemption** (task [30], not yet built) — recorded as an obligation for that task.

Evaluation is six cheap counts and skips work when everything is already unlocked, so calling it at
each of these is not a cost worth optimising away.

## Test requirement

**`StreakTests`**:

1. An outright win increments the winner and zeroes the loser.
2. **A win-win leaves both streaks untouched.**
3. **A voided day leaves both streaks untouched** — and does not break a run.
4. A 0–0 day leaves both untouched.
5. Consecutive wins accumulate.
6. A loss resets the winner's streak to zero.
7. **A tie in the middle of a run neither extends nor breaks it** — the rule's sharpest edge, with a
   win before and after the tie.
8. `LongestWinStreak` records the high-water mark and never falls back.
9. **Weekly and monthly settlements do not affect streaks.**
10. **Recomputation is idempotent** — applying twice gives the same numbers, which incrementing
    would not.

**`BadgeTests`**:

11. First chore unlocks on the first approved log, and not before.
12. Century unlocks at 100 lifetime points, not at 99.
13. 3-day and 7-day streak badges unlock at their thresholds.
14. First redemption and Big spender unlock at 1 and 5 redemptions.
15. **Unlocking is idempotent** — evaluating repeatedly produces one row per badge.
16. `UnlockedAt` is recorded.
17. **Approving a log unlocks First chore immediately**, without waiting for settlement.
18. Badges are per-user: unlocking for one partner does not unlock for the other.
