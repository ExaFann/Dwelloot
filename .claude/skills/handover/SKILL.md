---
name: handover
description: Write or update docs/handover.md, a short note so the next session (after /clear, or another day) can pick up the work quickly. Use at the end of a work session.
argument-hint: "What will the next session focus on? (optional)"
disable-model-invocation: true
---

<!--
Adapted from mattpocock/skills skills/productivity/handoff (commit 49dd158), MIT License,
Copyright (c) 2026 Matt Pocock. Full notice: LICENSE.txt in this folder.
Changes for Dwelloot: saved to a rolling docs/handover.md in the repo instead of the OS temp
folder, with fixed sections (done, state, decisions and why, open problems, next steps).
-->

Write the handover note for the next session. It is a **rolling file**:

- Overwrite `docs/handover.md` each time. Git history keeps the old versions.
- Read the current file first. Carry forward anything still open, and drop what is finished.
- `project-state-handover.md` in the root is the v1 history. Don't edit it.

## Rules (from the original skill)

- **Link, don't copy.** If something is already in a commit, ADR, spec, CLAUDE.md or a file,
  point to it by path or commit hash instead of repeating it.
- **No secrets or personal data.** Leave out passwords, connection strings, tokens, and real
  names or emails. The local test-account file is referred to by its path only.
- If the user gave arguments, treat them as the next session's focus, and shape the note toward it.

## Gather facts first; don't write from memory

- `git status --short`, `git log --oneline -10`, and the current branch.
- Anything still running that you started, such as the dev servers.
- What was asked for in this session, and whether each item is finished.

## Template (keep it under about 60 lines, in plain English)

```markdown
# Handover: <YYYY-MM-DD>

**Next session focus:** <one line, from the arguments or your best suggestion>

## Done this session
- <outcome>: <commit hash or file path>

## Current state
- Branch `<name>`. Uncommitted: <files, or "none">.
- Running: <servers, or "nothing">.

## Decisions and why
- <decision>: <why, plus the alternative that was rejected>. (Link an ADR if one exists.)

## Open problems / risks
- <problem>: <what is known, where to look>

## Next steps (in order)
1. <specific action, naming files or commands>

## Useful for the next session
- Agents/skills: <e.g. `tester`, `debugger`, `/done-check`>
- Read first: <paths>
```

After writing it, tell the user the file path. Remind them to commit it with their work, and
that the next session can start with: "Read docs/handover.md and continue."
