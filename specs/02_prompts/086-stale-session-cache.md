## Task

[86] The 401 that belonged to the previous session.
"Authentication is required" appeared on the dashboard for a few seconds after logging in, then
healed itself. Not a failure: a replayed error. A 60-minute token expires, the store signs the user
out, but nothing empties the query cache, so every errored entry survives and the next login renders
them on the first frame. Fixed with store middleware, because "the identity changed" is a property of
the action rather than of any component. The period ladder was also inverted the right way up here,
reversing [83].

Its full specification is in `ui-exp02-design-review-rounds.md`, round E — that file
consolidates the consecutive design-review rounds, because they cut across many tasks at once
and reading them one at a time loses the argument that connects them.

Numbered file kept rather than deleted so the numbering has no silent gap.
