## Task

[84] One implementation per idea.
The most instructive task in the build. The chore-status notation changed in one component, the whole
suite stayed green, and the landing page still showed the old version, because three other surfaces
each held their own copy of the same idea and each copy was tested against itself. The fix was
structural rather than textual: those ideas now live in one module each and everything else consumes
them. The test of whether it worked is to break the shared module and count how many **files** turn
red. That number went from one to four.

Its full specification is in `ui-exp02-design-review-rounds.md`, round D — that file
consolidates the consecutive design-review rounds, because they cut across many tasks at once
and reading them one at a time loses the argument that connects them.

Numbered file kept rather than deleted so the numbering has no silent gap.
