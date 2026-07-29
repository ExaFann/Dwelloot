I'm building Dwelloot, a full-stack web app (.NET 10 Web API + EF Core backend, React + TypeScript + Redux Toolkit frontend) for the MSA 2026 Phase 2 assessment. It's a household chore app for exactly 2 people who turn splitting chores into a friendly competition: they log chores, earn Points, and whoever contributes more in a period wins a loot box (mostly Coins, small chance of a bonus reward) — spendable only in the Store.

All the planning is already done and lives in `/specs`:

## Workflow — one task per session turn, then stop

`task-decomposition.md` has the full task list. Task [1] is already done (initial solution scaffold, already committed). Start at task [2] and go in order — don't skip ahead or batch multiple tasks together.

For each task:

1. Write `NNN-task-description.md` (matching numbering to the task) with: the task description, a concrete spec for what you're about to build (informed by `api-design.md`, `relational-model.md`, `er-diagram.md`, and `wireframes.md`), and the test requirement — if the task has real logic to assert against, note that you'll add an actual unit/integration test file to the project
2. Implement the task.
3. Write and run the tests you specified. Iterate until they pass.
4. **Stop.** Do not run `git add` or `git commit` — I review and commit manually after each task. Tell me what you did, what you verified, and wait for me.

Don't move on to the next task until I tell you to.

One more thing: if implementation diverged from the spec in `api-design.md` or `relational-model.md`, note the divergence there rather than silently leaving the spec files stale.
