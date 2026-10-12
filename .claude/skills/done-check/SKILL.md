---
name: done-check
description: Use before saying a Dwelloot task is done, fixed or passing, and before committing. Runs the Definition of Done checks for the parts that changed, confirms new behaviour has tests, and checks that README, CLAUDE.md and ADRs still match the code. Evidence before claims.
---

# Done check

**The rule comes from `verification-before-completion.md` in this folder: no "done" without
fresh evidence.** Read it if you haven't this session. This skill applies that rule to Dwelloot.

## 1. What changed?

`git status --short` and `git diff --stat`. If the work is already committed, use
`git diff --stat main...HEAD`. Sort the files into: **API** (`API/`, `Tests/`), **client**
(`client/`), **docs or config only**.

## 2. Run the checks for each part that changed

Run each command now, in this session, and read the result. A run from earlier doesn't count.

| Part changed | Commands | Pass means |
|---|---|---|
| API | `dotnet test` | 0 failed |
| client | `npm --prefix client run lint` · `npm --prefix client test` · `npm --prefix client run build` | each one exits 0 |
| docs or config only | Nothing to run, but still do steps 4 and 5 | — |

- `dotnet test` fails with "file is locked by: Dwelloot" while the API is running. Stop the API
  if you started it. Otherwise ask the user to stop it. This isn't a test failure.
- Don't repeat the lint-on-stop hook's job by hand-checking style. Run the commands.

## 3. Does new or changed behaviour have tests?

- For each changed source file, find the test that covers the new behaviour. Name it.
- No test → not done. Write one, or delegate to the `tester` agent.
- A rule that depends on a database check constraint or unique index needs a **service-layer
  guard** with a test. EF in-memory tests can't prove the database rule itself; say so.
- A test was deleted, skipped or loosened → not done, unless the user asked for it.

## 4. Do the docs still match the code? (docs drift)

Check only the docs the change could affect:

| If the change touched... | Check |
|---|---|
| commands, scripts, ports, setup steps | CLAUDE.md "Commands" and "Local setup", and README |
| request flow, errors, settlement, auth, caching, polling, theming | CLAUDE.md "Architecture" lines. Is each one still true? |
| a new dependency, tool or service | README stack list, and whether CLAUDE.md should mention it |
| a design choice with real alternatives | Is an ADR needed? `docs/adr/NNNN-short-title.md` with Context, Options, Decision, Consequences. Create `docs/adr/` if it doesn't exist. |

- Don't edit `specs/` or `project-state-handover.md`. They're history.
- Fix small drift directly, like a wrong command or port. For anything bigger, list it for the
  user.

## 5. Report

```markdown
### Done check: <task>
| Check | Command | Result |
|---|---|---|
| API tests | dotnet test | ✅ 677 passed |
| ... | ... | ... |

**Tests for new behaviour:** <test names> (or ❌ missing: ...)
**Docs:** ✅ still match / ✏️ fixed: ... / ⚠️ needs you: ...
**Verdict:** DONE, or NOT DONE because <reason>
```

Say "done" only if every row passed. Otherwise give the real status and its evidence.
