---
name: explain-flow
description: Explains how one Dwelloot feature works end to end (screen → client → API → service → database and back) in plain English, with a small diagram, keywords, analogies and interview lines, then saves it as a study note in docs/learning/. Use when the user asks how a feature or flow works.
argument-hint: "Which feature or flow? e.g. 'logging a chore', 'opening a loot box'"
---

<!--
Custom skill. The tracing order (entry point → layers → data → back) borrows the method of the
official feature-dev plugin's code-explorer agent (anthropics/claude-plugins-official). No text
is copied from it.
-->

Explain one feature so a non-specialist can understand it and say it out loud in an interview.
The reader makes design decisions but doesn't write code, and English is their second language.

## 1. Trace the real code first; never explain from memory

Follow one user action through the layers, and note `file:line` for each step:

1. **Screen:** the route in `client/src/app/routes.tsx` → the page → the component the user
   touches.
2. **Client data:** the RTK Query endpoint (`injectEndpoints`), its cache tags, and whether it
   uses `liveQueryOptions` (polling).
3. **API:** the controller action, then the `I*Service` method, then the status enum it returns.
4. **Rules and data:** the business rules in the service, the entities and tables touched, and
   any snapshot, archive or settlement logic.
5. **Back to the screen:** what the response contains, which cache tags are invalidated, and what
   the user sees. Include how the partner sees it (polling).

If a step isn't there, say so. Don't invent one. Read nearby code comments and any `docs/adr/`
for the *why*.

## 2. Explain it in this format

```markdown
# How <feature> works

**In one sentence:** <what happens, from the user's point of view>

## The flow
<a text diagram with at most about 8 boxes, for example:>
[Tap "Done"] → LogActivityPage → createActivityLog (RTK Query) → POST /api/activity-logs
   → ActivityLogsController → ActivityLogService.CreateAsync → activity_logs table
   ← 201 + new log ← cache tag refreshed ← list re-renders; the partner sees it within 20 s

## Step by step
| # | Where | What happens (plain English) |
|---|---|---|
| 1 | `path/File.tsx:42` | ... |

## Key ideas
**<Keyword>** = <one-line definition>. *Like* <everyday analogy>.
(Pick 2–4 ideas this flow really uses, such as snapshotting, lazy settlement, cache
invalidation or polling.)

## Why it's built this way
- <a design choice> → <the reason, from a comment or ADR> (say "my inference" if not written down)

## Interview lines
- "<one or two sentences you could say out loud>"

## Check yourself
1. <a question whose answer is in this note>
2. <a "what would happen if..." question>
```

Rules:
- Use short sentences, and explain jargon the first time it appears.
- Show the big picture. Code snippets only when a line is the key idea, and at most 3 lines.
- Every claim about the code needs a `file:line`. Mark guesses as "my inference".

## 3. Save it as a study note

- Write the same content to `docs/learning/<feature-in-kebab-case>.md`. Create the folder if
  needed.
- Add a first line: `> Explained on <YYYY-MM-DD> at commit <short hash>. Code may have changed
  since.`
- If the note already exists, update it, and say what changed.
- Show the explanation in chat as well, then give the file path.
