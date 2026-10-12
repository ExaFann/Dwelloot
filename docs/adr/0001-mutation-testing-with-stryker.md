# 0001: Mutation testing with Stryker, and Vitest pinned to 4.x

Date: 2026-10-12

## Context

The backend tests use EF in-memory and the frontend has about 1,000 Vitest tests. Passing tests
show that the code ran, not that the tests would notice if it broke. AI-written tests make this
gap more likely: a test can pass while asserting nothing that matters. We wanted a check that
plants small bugs and confirms the tests catch them.

## Options

1. **Thinking-only check.** The tester asks itself "would a test fail if this line were wrong?"
   It's free and fast, but it is Claude judging Claude's own tests.
2. **Stryker** (StrykerJS for the client, Stryker.NET for the API). It's the standard
   open-source mutation-testing tool for both stacks, and it really runs the tests against each
   planted bug. A full run takes hours, so it has to be scoped to the changed files.
3. **No mutation testing.** We rely on code review to spot weak tests.

## Decision

Option 2, run only through the `mutation-check` skill and only on changed source files.

- StrykerJS 10 (`@stryker-mutator/core`, `@stryker-mutator/vitest-runner`) is a client dev
  dependency. Its config is `client/stryker.config.json`.
- `client/vitest.stryker.config.ts` reads `STRYKER_TESTS` so each run only executes the related
  test files. Without it, one small file took over 10 minutes; with it, about 90 s, then about
  12 s on repeat runs.
- Stryker.NET 5.0.0 is a local dotnet tool (`dotnet-tools.json`) and runs from `Tests/`.
- **Vitest stays on 4.x.** The Stryker Vitest runner has open bugs with Vitest 5.
- npm `overrides` forces `qs` ^6.16.0 under `typed-rest-client`, a Stryker dependency that pins
  a vulnerable `qs` 6.15.1. That keeps `npm audit` at 0.

## Consequences

- **Don't upgrade Vitest to 5** until the Stryker Vitest runner supports it. Check
  stryker-mutator/stryker-js before upgrading. `^4.1.11` in `package.json` already stops
  `npm update` from crossing the major version.
- Remove the `qs` override once `typed-rest-client` (or Stryker) stops pinning the old version.
  Check with `npm ls qs`.
- Backend runs need the API stopped first, because Windows locks its build output.
- About 49 project-wide mutants fail to compile under Stryker.NET. This is a known tool
  limitation, and they are skipped.
- `npm audit fix` crashes on npm 10.9 for this project ("reading 'edgesOut'"). Use
  `npx npm@11 ...` for dependency fixes.
