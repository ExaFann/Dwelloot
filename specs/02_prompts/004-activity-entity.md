## Task

[5] Add Activity entity: class + EF configuration. `HouseholdId` is required (not nullable) —
every row belongs to exactly one household; defaults are copied in at household-creation time
(task [14]), not stored as shared null-household rows. Define the default template list
(name, points, category) as a static/code-level list here, ready for [14] to copy from.

## Spec

Source material: `relational-model.md` (`activities(id, title, points, category, *household_id)`
plus its "Default catalog seeding is copy-on-household-creation" note), `er-diagram.md`,
`api-design.md` (`GET /api/activities`), `wireframes.md` (screens 1 and 2), and `project-plan.md`.

### A naming reminder, since it bites here

The entity and route stay `Activity` / `/api/activities`; user-facing copy says **Chores**. Per
`wireframes.md` that is deliberate — one flexible table rather than a table per category — and the
mismatch is invisible to users. The default templates below are therefore chores, even though the
type is called `Activity`.

### Entity

`API/Entities/Activity.cs`:

| Property      | Type               | Notes                                                                   |
| ------------- | ------------------ | ----------------------------------------------------------------------- |
| `Id`          | `int`              | Surrogate PK.                                                           |
| `Title`       | `string`           | Required, max 80. "Wash dishes".                                        |
| `Points`      | `int`              | Awarded on approval. Must be positive — see the check constraint below. |
| `Category`    | `ActivityCategory` | Enum, stored as a string column.                                        |
| `HouseholdId` | `int`              | **Required**, not nullable.                                             |
| `Household`   | `Household`        | Reference navigation.                                                   |

### `Category` is an enum stored as a string

`er-diagram.md` types this as `string`, and `api-design.md` filters on `?category=Chore`. A raw
`string` property would leave every comparison open to typos that only surface as an empty result
set. A C# enum with `.HasConversion<string>()` gives compile-time safety in code while the column
stays the readable `category` string the ER diagram describes — and stays queryable by the API's
category filter without a lookup table.

The enum gets exactly one member, `Chore`. `project-plan.md` says the field "exists for later"
with "together"/"wellbeing" explicitly deferred; adding those values now would be dead code
against a UI that cannot produce them. String storage means adding them later is additive and
needs no migration of existing rows.

### EF configuration

`API/Data/Configurations/ActivityConfiguration.cs`:

- `Title` required, `HasMaxLength(80)`.
- `Category` required, converted to string, `HasMaxLength(20)`, defaulting to `Chore`.
- `HouseholdId` required, `OnDelete(DeleteBehavior.Cascade)` — stated explicitly rather than left
  to EF's default for a required FK. Deleting a household should take its chore catalog with it;
  contrast `User`, which is set-null in task [4] precisely because people outlive the household.
- **A `points > 0` check constraint.** Worth taking, on the same reasoning as the unique index on
  `invite_code` in task [3]: this is an integrity rule the database can express portably (unlike
  the max-2-members rule, which would need to count related rows). Rejecting negative point values
  is also named explicitly in `project-plan.md` as part of the Security advanced requirement, so
  having it enforced at the storage layer — not only in the task [32] validation layer — is the
  difference between a claim and a guarantee.

No collection navigation is added on `Household`. `Household.Members` exists because
`GET /households/{id}` returns members and the ER diagram models that relationship directly;
activities are only ever fetched through the paginated `GET /api/activities`, never as a nested
household object. An unused `Household.Activities` would mostly serve as a way to accidentally
load a whole catalog.

### Default chore templates

`API/Data/Defaults/DefaultActivities.cs` — a static, code-level list, **not** a database seed.
`relational-model.md` is emphatic about why: a shared default row is the _same row_ every
household sees, so one household editing "Mow the lawn" would change it for everyone. These
templates are copied into each household's own rows by task [12], invoked from [14].

Shape: `record ActivityTemplate(string Title, int Points, ActivityCategory Category)`, exposed as
a static read-only collection. Task [7] adds the reward equivalent alongside it.

Twelve chores, points scaled roughly by effort (5 for a two-minute job, 25 for a real one). Twelve
is not arbitrary — `api-design.md`'s worked example shows `GET /api/activities` returning
`"total": 12` for a household that has not customised anything, so the documented example stays
literally true. "Wash dishes" at 10 points and "Vacuum" are fixed by that same example; "Mow the
lawn" appears because `project-plan.md` uses it as the worked case for deleting a default that
does not apply to your home.
