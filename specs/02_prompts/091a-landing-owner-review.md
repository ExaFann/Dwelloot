## Task

1. "What's in the box" → **"What you're playing for"**.
2. The economy row's chest and label are too small; make them bigger.
3. **The row stacks far too late.** Three stacked blocks is the *phone* layout. At tablet width the
   screenshot shows Points and Coins each eating a full row, which the owner called ugly — at that
   width the whole Points → box → Coins sequence has to read across in one line.
4. **The win streak is never mentioned anywhere on the landing page**, though it is a real mechanic
   with its own mark and two badges. Add it — the owner suggests under the four steps of "How a duel
   works".
5. Wherever the project says *streak*, it must be unambiguous that it is a **win** streak, said from
   the positive side: winning starts it, winning again grows it.

## What the streak actually is — checked before writing a word about it

`ProgressionService` walks the daily results newest-first and:

```csharp
if (day.IsVoided || day.IsWinWin || day.WinnerUserId is null) continue;   // skipped, not broken
if (day.WinnerUserId == member.Id) current++;
else break;                                                              // someone else won
```

So the rule has a detail worth getting right rather than glossing: **a quiet day does not break the
run.** A tie, a voided day and a day nobody won are *skipped* — the comment in the service says this
is "what lets a run survive a quiet Sunday". The streak only ends when **the other person wins a
day**.

That kills the obvious copy. "Miss a day and it resets" would be **false**, and it is exactly what
anyone would write from the word "streak" alone. The line has to say that losing ends it, not that
resting does.

## Decisions

**1. The copy: `Win days back to back and your win streak climbs. A quiet day won't break it — only
losing one will.`** Positive first, accurate second, and the second half is the part that would
otherwise be guessed wrong.

Placed under the four steps as an unboxed line with `StreakMark`, not as a fifth tile: the loop is
four steps, and a fifth box would make the streak a stage you pass through rather than something
that accumulates across days.

**2. `StandingTotals`' label becomes "Win streak".** It rendered `Streak`, which is the ambiguity the
owner is pointing at — a bare "Streak" in a chore app reads as *days you logged something*, which is
a different and more common mechanic, and it is not what this number is. The field behind it has
always been `currentWinStreak`; only the label was vague.

This is one edit for both people's cards, because [84] made that row a single module. Worth naming as
the rule paying for itself rather than as a coincidence.

**3. The row's breakpoint moves to `md` (768), and the layout is tightened to make that honest.**
[90] measured `lg` because at 768 the cards fell to 253px and the Coins body ran to four lines — but
that measurement was of the *existing* padding and type. The owner is right that the answer is not
"stack until 1024"; it is "make it fit at 768". So the padding steps up rather than being constant
(`p-4` → `p-6` at `lg`), and the result is measured rather than assumed.

**4. Bigger, but measured against what it sits between.** The chest and the arrows grow; the point is
the *proportion* to the two cards, so the numbers are chosen after looking at the measurements, not
before.

## Test requirement

1. The heading is "What you're playing for" and the old one is gone. The band-order test in [91]
   keys off this string and is **updated, not deleted**.
2. The streak line renders, says **"win streak"** in those words, and carries `StreakMark`.
3. The streak line does **not** claim a quiet day breaks the run — assert the absence of
   reset-on-missed-day phrasing, since that is the plausible wrong copy this replaces.
4. `StandingTotals` renders "Win streak", not "Streak"; both existing `MePage` assertions are updated.
5. The economy row's breakpoint is asserted at the class level in jsdom (it cannot evaluate media
   queries) and **measured in the browser** at phone, tablet and desktop widths.
