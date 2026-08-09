## Task

[78] Owner feedback round, eight items.
Eight fixes from one review of the running app. Chinese swept out of the code comments; the
dashboard's delete control moved from an always-visible cross to a hover-revealed trigger that asks
before it acts; the prize feed's wrong avatar root-caused (the prop was optional, so the call site
written after it silently fell back to the generated identicon, and `Avatar.avatarKey` became
**required** so the type catches the next one); the Log tab gained sorting and a capped search box;
the Me screen's stat labels became `sr-only sm:not-sr-only` rather than hidden, so a screen reader
still hears them.

Its full specification is in `ui-exp02-design-review-rounds.md`, round D — that file
consolidates the consecutive design-review rounds, because they cut across many tasks at once
and reading them one at a time loses the argument that connects them.

Numbered file kept rather than deleted so the numbering has no silent gap.
