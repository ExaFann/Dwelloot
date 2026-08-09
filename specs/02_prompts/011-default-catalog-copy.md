## Task

[12] Add default Activity/Reward template copy logic: a service method that, given a household ID,
copies the code-level default templates from [5]/[7] into that household's own `Activity`/`Reward`
rows. Not a DB seed of shared rows — this runs per-household, invoked by [14].

## Spec

### The service

`API/Services/DefaultCatalogCopier.cs`, with an `IDefaultCatalogCopier` interface for DI and
testability.

Deliberately **not** named "seeder": `relational-model.md` is emphatic that this is not a database
seed, and naming it one would invite exactly the shared-row model the design rejects.

### Divergence from the task wording: takes the household, not its id

The task decomposition says "given a household ID". The signature is instead:

```csharp
void CopyDefaultsTo(Household household);
```

Reason: a household's id does not exist until after it has been inserted, so an id-based signature
forces task [14] into two round trips — save the household, read back its id, then save the
catalog. If the second save fails, the household exists with an empty catalog, which is a state no
part of the app expects and nothing repairs.

Taking the entity lets the copier attach the new rows through the navigation property, so [14]
creates the household _and_ its twenty catalog rows in a single `SaveChanges` — atomic by
construction rather than by remembering to open a transaction. EF resolves the foreign keys on
insert.

The method is therefore synchronous and touches no database: it stages entities on the change
tracker and the caller owns the unit of work. That also makes it trivially testable without
mocking a save.

### What it copies

- Every `ActivityTemplate` in `DefaultActivities.All` → an `Activity` carrying `Title`, `Points`,
  `Category`.
- Every `RewardTemplate` in `DefaultRewards.All` → a `Reward` carrying `Title`, `CoinCost`,
  `PausesCompetition`.

No filtering, no partial copies. Counts are read from the source lists rather than hard-coded, so
editing a template list cannot silently leave the copier behind.

### Test project — created here

`Tests/Dwelloot.Tests.csproj`, xUnit, added to the solution.

Provider choice for tests: `Microsoft.EntityFrameworkCore.InMemory`. The alternative, SQLite
in-memory, is more faithful for relational behaviour but has to build a schema from a model
carrying Npgsql-specific annotations (`UseIdentityByDefaultColumn`, `HasIdentityOptions`) and
PostgreSQL check constraints. For a test about _which rows get created and to whom_, the extra
fidelity buys nothing and the translation risk is real.

Worth stating the limit plainly, since it matters for later tasks: **InMemory does not enforce the
database constraints this schema relies on** — no `points > 0`, no no-self-approval check, no
unique indexes. Any test whose subject is a constraint rather than logic needs a real PostgreSQL
database, not this provider. Task [23]'s settlement tests compute over fabricated data and are fine
here; a test asserting that self-approval is rejected at the storage layer would not be.

`FluentAssertions` is deliberately not used — version 8 moved to a paid licence for commercial use,
which is not a dependency worth attaching to a portfolio project. Plain xUnit assertions instead.

### What the tests assert

The valuable test is household isolation, because that is the entire reason this design exists
rather than shared default rows. `relational-model.md`'s argument is that a shared row is the _same
row_ every household sees, so one household's edit leaks into every other. The test reproduces that
scenario directly: copy into two households, mutate one household's row, assert the other's is
untouched.

Planned cases:

1. **Copies every activity template**, count read from `DefaultActivities.All`, not a literal.
2. **Copies every reward template**, same.
3. **All copied rows belong to the target household.**
4. **Activity values are carried faithfully** — title, points and category all survive.
5. **`PausesCompetition` survives the copy** — the only non-default boolean in either list, and the
   one whose loss would silently disable the "day off" mechanic rather than causing a visible error.
6. **Two households receive independent rows** — the isolation test above.
7. **A household with no templates would copy nothing** — guards the empty case rather than
   assuming a non-empty list.

Counts are derived from the source lists throughout, so these tests assert "all of them were
copied" rather than "twelve were copied", and stay correct when a template is added or removed.
