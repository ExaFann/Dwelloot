## Task

[3] Add Household entity: `Household` class + EF configuration (fluent API or attributes).

## Spec

Source material: `relational-model.md` (`households(id, name, invite_code, is_full)`),
`er-diagram.md` (`HOUSEHOLD ||--o{ USER : "has (max 2)"`), `api-design.md` (the
`POST /api/households` response shape), and `project-plan.md`'s Household attribute list.

### Entity

`API/Entities/Household.cs`:

| Property     | Type     | Notes                                                                                                                                            |
| ------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Id`         | `int`    | Surrogate PK, identity. Every table in `relational-model.md` uses one.                                                                           |
| `Name`       | `string` | Required. Household display name — "Our place", "The Nest".                                                                                      |
| `InviteCode` | `string` | Required, fixed 6 characters. The one-time code the second partner enters to join. `api-design.md` shows `"7F3K9Q"` — 6 uppercase alphanumerics. |
| `IsFull`     | `bool`   | Defaults false; set true once the second member joins.                                                                                           |

No navigation property to `User` yet — `User` does not exist until task [4], which is where the
`Household.Members` side of that relationship gets added.

### EF configuration

`API/Data/Configurations/HouseholdConfiguration.cs`, as an `IEntityTypeConfiguration<Household>`
rather than inline `OnModelCreating` code. Nine entities are coming ([3]–[10]); one configuration
class each keeps `AppDbContext` from growing into a single unreadable method, and
`ApplyConfigurationsFromAssembly` picks them all up automatically as they arrive.

- `Name` required, `HasMaxLength(60)`.
- `InviteCode` required, `HasMaxLength(6)`, `IsFixedLength()`.
- **Unique index on `InviteCode`.** This is the one constraint here that is load-bearing rather
  than cosmetic: `POST /api/households/join` looks a household up _by code alone_, so two
  households sharing a code would silently join someone to the wrong home. Enforced in the
  database, not just in code, because it is a genuine integrity rule the database can express.
- `IsFull` default `false`.

Max lengths are exposed as `const` fields on the entity so task [32]'s validation layer can
reference the same numbers instead of restating them.

Deliberately **not** enforced in the database: the "max 2 members per household" rule. Per
`relational-model.md`, a `CHECK` constraint counting related rows is not portable across SQL
engines, so it stays an application-level check in the join endpoint (task [15]). A code comment
on the entity records this so the absence looks deliberate rather than forgotten.

### Cross-cutting decision made here: snake_case naming convention

`relational-model.md` describes the schema in snake_case (`invite_code`, `is_full`), which is
also the PostgreSQL norm. EF Core's default would instead produce PascalCase identifiers, so the
real database would contain `"Households"."InviteCode"` while the submitted relational model
says `households(invite_code)` — the code and the design document would disagree in a way a
marker could see.

Fix: add `EFCore.NamingConventions` 10.0.1 and chain `.UseSnakeCaseNamingConvention()` onto the
existing `UseNpgsql(...)` call. One line, applied globally, so all nine entities stay consistent
without per-property `HasColumnName` calls.

This belongs in task [3] specifically because it is only cheap right now. No migration exists yet
(task [11] creates the first one) and only one entity is configured, so the decision is currently
free to reverse. Making it after tasks [4]–[10] would mean revisiting every configuration; making
it after [11] would mean a rename migration across nine tables.

### DbContext

`AppDbContext` gains `DbSet<Household> Households` and an `OnModelCreating` override calling
`ApplyConfigurationsFromAssembly`. No migration — task [11] still owns the first one.
