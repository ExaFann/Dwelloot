## Task

[53a] The loot box reveal becomes a **centre-screen dialog**, and the box is opened before the prize
is named.

As built in [53] it was a panel on the dashboard. That made the one genuinely celebratory moment in
the app compete for attention with the scoreboard directly above it — and, worse, the prize was on
screen at the same instant as the box, so there was nothing to open.

## Decisions

**1. A modal dialog, centred, with the rest of the app dimmed behind it.** This is the only moment in
Dwelloot that is allowed to take over the screen. Everything else is ambient; a won box is an event.

**2. The box opens first. The prize arrives after.** The sequence is the reward, not the number. A
reveal that shows both at once is a notification with an animation attached to it.

**3. The stages overlap in grid cells rather than replacing each other.** Each stage occupies the
same cell of a one-cell grid, so the dialog does not resize between stages and nothing jumps. It also
means `display: none` on a stage strands nothing — which is what makes the reduced-motion answer
possible at all.

**4. Reduced motion hides the stage; it never freezes it.** A transform stopped at 50% is a bug that
looks like a design decision. With overlapping cells, hiding the animated stage leaves the final
state correctly composed.

**5. Opening is still idempotent, and still server-rolled.** Nothing about the presentation changes
the rule that the prize is decided once, on the first open. The dialog can be dismissed and
reopened; it shows the same prize.

## Test requirement

1. The dialog renders only when there is an unopened box, and is a real dialog — focus is trapped,
   Escape closes it, focus returns to what opened it.
2. The prize is **not in the document** during the opening stage, and is after it. Asserting only
   that it eventually appears would pass against the version this task replaces.
3. Reduced motion: the animated stage is `display: none` and the final state is fully rendered.
4. Dismissing and reopening shows the same prize, and issues no second open request.
