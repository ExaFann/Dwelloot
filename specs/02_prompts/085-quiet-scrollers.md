## Task

[85] Conditional edge fades, and a scroll area worth sharing.
Inner scrollbars hidden rather than styled, since [83] proved the platform ignores the styling. The
edge fade became per-edge and conditional, because a permanent fade over the top of a scroller covers
the most-read line in order to say something untrue. A new `ScrollArea` owns overflow, scrollbar and
fade together so the behaviour is not retyped in five places.

Its full specification is in `ui-exp02-design-review-rounds.md`, round E — that file
consolidates the consecutive design-review rounds, because they cut across many tasks at once
and reading them one at a time loses the argument that connects them.

Numbered file kept rather than deleted so the numbering has no silent gap.
