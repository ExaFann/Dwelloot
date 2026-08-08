## Task

[87] The avatar picker never showed what you had picked.
The selected tile was drawn with `border-ink-accent` and the others with `border-ink`. Those are the
same black in light mode, so the chosen tile was identical to its seven neighbours. The file had
claimed "selection is a tick, not a colour" since [72] and had shipped a colour swap instead. It also
had no tests at all, which is how it survived fifteen tasks.

Its full specification is in `ui-exp02-design-review-rounds.md`, round F — that file
consolidates the consecutive design-review rounds, because they cut across many tasks at once
and reading them one at a time loses the argument that connects them.

Numbered file kept rather than deleted so the numbering has no silent gap.
