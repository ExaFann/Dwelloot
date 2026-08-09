> **Reconstructed.** See the note in [`068-store-change-approval.md`](068-store-change-approval.md)
> — this file was written up from the task ledger after the task was built.

## Task

[74] The dashboard's approval prompt fires only for chores that are genuinely **stuck**.

Two owner-reported bugs, one cause. The yellow card read the same count as the nav badge, so it
(a) appeared the moment the partner logged anything, duplicating both the badge and the Notices tab,
and (b) after [68] it fired for a pending **store change** while rendering the number with the word
"chore" — re-pricing a reward announced itself as *"1 chore is waiting on you"*.

## Decisions

**1. Two hooks, because they answer two different questions.**

| Hook | Question | Surface |
|---|---|---|
| pending count | *Is there anything for me?* | the nav badge |
| overdue approvals | *Is anything actually **stuck**?* | the dashboard prompt |

A badge is ambient; a card that interrupts the dashboard has to earn it. "Your partner logged
something two minutes ago" does not.

**2. "Overdue" means logged before the current daily period began** — which is precisely the thing
that stops settlement closing a period (`SettlementOutcome.AwaitingApprovals`). The prompt is not
about volume; it is about a period that cannot finish until you decide. A chore logged today is the
badge's business.

**3. A store change is never the prompt's business.** Nothing about the competition is blocked by an
unapproved re-price.

**4. The copy says what is true.** "That day is over but can't be settled until you decide" — which
is a claim the code can actually support, unlike the previous wording.

## Instants, never date strings

This is the third sighting of the same trap and it is the reason this section exists.

Period boundaries are **UTC instants at local midnight** in `Pacific/Auckland`. Any comparison via
`slice(0, 10)`, `getUTCDate()` or `toISOString()` reports the wrong day for part of every day.

**Mutation testing caught the suite not enforcing this.** The original fixtures all had UTC dates
that differed from the period start's UTC date, so rewriting the comparison as a `slice(0, 10)`
string comparison passed all ten tests. The discriminating case is a chore from **yesterday evening
New Zealand time**, which shares a UTC calendar date with today's local midnight while being a
different instant. That fixture has to exist, or these tests prove nothing.

## Test requirement

1. A chore logged **before** the current daily period start → prompt fires.
2. A chore logged **today** → no prompt, badge still counts it.
3. A pending **store change** → no prompt, in any combination.
4. **The killing fixture**: a chore logged yesterday evening NZT whose UTC date equals the period
   start's UTC date. Rewriting the comparison as a date-string compare must turn this red.
5. The prompt's copy renders the count with the right noun.
