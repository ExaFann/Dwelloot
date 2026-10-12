---
name: mutation-check
description: Checks whether tests would actually catch bugs, by running Stryker (mutation testing) on changed source files only, then sorting the surviving mutants into real gaps, equivalent mutants and low-value ones. Use after writing or changing tests for a code change.
---

# Mutation check

Stryker plants small bugs ("mutants") in source code, like `>` becoming `>=`, a string becoming
`""`, or a block emptied, and reruns the tests. A **killed** mutant means a test noticed. A
**survived** one means no test noticed.

**Always scope a run to the changed source files.** A full run takes hours.

## 1. Pick the files

- Mutate **source files only**, never test files: the files the change touched (`git diff --name-only`).
- Five files or more: ask the caller before running.

## 2. Run it

### Frontend (`client/src`)

1. Find the tests for each file: same-folder `*.test.ts(x)`, plus any test that imports it
   (`grep -rl "<moduleName>" client/src --include=*.test.*`).
2. Run from `client/`, listing those tests in `STRYKER_TESTS` (comma-separated, relative to
   `client/`). Without that list, every mutant reruns most of the ~1000 tests:

   ```bash
   cd client && STRYKER_TESTS="src/a/x.test.ts,src/a/y.test.tsx" npx stryker run --mutate "src/a/x.ts" --concurrency 4
   ```

   Repeat `--mutate` for each file. One file takes about 10–90 s. Repeat runs are faster,
   because `incremental` skips mutants already tested.
3. Report: `client/reports/mutation/mutation.json`.

### Backend (`API/`)

1. **The API must not be running.** Windows locks its files and the build fails with "file is
   locked by: Dwelloot". If it's running, ask the caller to stop it, or stop it yourself if
   you started it, and restart it afterwards.
2. Run from `Tests/`:

   ```bash
   cd Tests && dotnet dotnet-stryker --project Dwelloot.csproj --mutate "**/Services/Foo.cs" --reporter json --reporter html --output StrykerOutput/latest
   ```

   Repeat `--mutate` for each file. Expect about 1–2 minutes, mostly build time. Stryker only
   runs the tests that cover each mutant. About 49 project-wide "CompileError" mutants are a
   known Stryker limitation; ignore them.
3. Report: `Tests/StrykerOutput/latest/reports/mutation-report.json`.

## 3. Read the survivors

```bash
node .claude/skills/mutation-check/survivors.mjs <report.json>
```

This prints the score and each survivor with its line and the replacement.

## 4. Sort every survivor into one of three kinds

| Kind | Meaning | Action |
|---|---|---|
| **Real gap** | The behaviour changed and no test noticed | Add or sharpen a test that fails on that exact change |
| **Equivalent** | The mutant can't change behaviour. Example: `isThemeMode` dropping `'system'` still ends in `'system'`, because the caller falls back to it anyway | Explain why in one line. No test. |
| **Low value** | Only text no one relies on changed, like an exception message or a log line | Mention it. No test. |

- Don't chase 100%. Don't write tests that pin implementation details just to kill a mutant.
- After adding tests, rerun the same command. Incremental makes this quick. Confirm the real
  gaps are now killed.

## 5. Report

- The score before and after, as "caught X of Y".
- Each survivor with its kind and the action taken.
- The exact commands you ran.
