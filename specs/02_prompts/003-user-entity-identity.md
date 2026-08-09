## Task

[4] Add User entity with Identity integration: `User` extending `IdentityUser` (or custom
Identity-compatible class) + EF configuration.

Scope boundary: this task adds the **entity and its schema**. Registration/login wiring and
proving password hashing works end to end is task **[13]** — that is where Identity's services
get configured and where the security advanced-requirement evidence actually gets produced.

## Spec

Source material: `relational-model.md`
(`users(id, name, email, password_hash, lifetime_points, coins, current_win_streak,
longest_win_streak, *household_id)`), `er-diagram.md` (`USER { int id PK ... }`),
`api-design.md` (`GET /api/auth/me` response), and `project-plan.md`'s User attribute list plus
its "no Role field" decision.

### Three decisions this task has to make

**1. `IdentityUser<int>`, not `IdentityUser`.** Identity's default key type is `string` holding a
GUID. Every foreign key pointing at a user in `relational-model.md` is an `int`
(`logged_by_user_id`, `approved_by_user_id`, `winner_user_id`, `redemptions.user_id`,
`user_badges.user_id`), and `er-diagram.md` says `int id PK`. Taking the default would silently
turn all five of those into GUID columns and put the code at odds with both design documents
before the second entity is even finished. `User : IdentityUser<int>` keeps the documented shape.

**2. `IdentityUserContext<User, int>`, not `IdentityDbContext`.** `project-plan.md` removed RBAC
deliberately — two symmetric partners, no owner/member hierarchy — and `relational-model.md` has
no roles table. `IdentityDbContext` would create `roles` and `user_roles` tables that nothing in
the application ever reads. `IdentityUserContext` is the same thing minus the role stores.

**3. `HouseholdId` is nullable.** `relational-model.md` lists `*household_id` without marking
nullability, but `api-design.md` settles it: `GET /api/auth/me` returns `"householdId": null` and
that value is what drives routing — "no household yet → pairing screen, household set → main app".
A user necessarily exists before they create or join a household, so the column must be nullable.

### Entity

`API/Entities/User.cs`, extending `IdentityUser<int>`:

| Property                                                          | Source    | Notes                                                                                                                               |
| ----------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `Id`, `Email`, `PasswordHash`                                     | inherited | The relational model's `id` / `email` / `password_hash` are satisfied by the base class — no need to redeclare them.                |
| `Name`                                                            | new       | Display name ("Alex", "Sam"), distinct from Identity's `UserName`. Task [13] sets `UserName` to the email, since login is by email. |
| `HouseholdId`                                                     | new       | `int?`, FK. Null until the user creates or joins a household.                                                                       |
| `Household`                                                       | new       | Reference navigation.                                                                                                               |
| `LifetimePoints`, `Coins`, `CurrentWinStreak`, `LongestWinStreak` | new       | `int`, all default 0.                                                                                                               |

`Household.Members` — the collection navigation deferred out of task [3] because `User` did not
exist yet — gets added here, completing `HOUSEHOLD ||--o{ USER`.

### EF configuration

`API/Data/Configurations/UserConfiguration.cs`:

- `Name` required, `HasMaxLength(60)`, matching `Household.Name`.
- The four counters default to 0 in the database, not just in C#.
- Relationship: `User.Household` ↔ `Household.Members`, FK `HouseholdId`, with
  **`DeleteBehavior.SetNull`**. This is the one behavioural choice here. `POST /households/{id}/leave`
  deletes the household once the last member leaves (`api-design.md`); cascade would delete the
  people along with it. Set-null instead means a deleted household leaves its members intact and
  unpaired, ready to create or join another — which is exactly what leaving is supposed to mean.

### Table naming

Identity's defaults (`AspNetUsers`, `AspNetUserClaims`, …) become `asp_net_users` under the
snake_case convention from task [3], which does not match `relational-model.md`'s `users`. The
four tables are renamed to `users`, `user_claims`, `user_logins`, `user_tokens`.

The three non-`users` tables are Identity infrastructure rather than domain entities, so their
renames go in `OnModelCreating` next to the `base` call rather than in `Data/Configurations`,
which is reserved for entities in the ER diagram.

**This is a real divergence from `relational-model.md`**, which documents nine tables and does not
mention claims/logins/tokens. They are unused by v1 (no external logins, no password-reset tokens
yet) but come with `IdentityUserContext` and removing them would mean writing custom stores — a
poor trade for three empty tables. `relational-model.md` gets a note recording their existence so
the document stays accurate rather than quietly wrong.

### Email uniqueness

Worth stating because it looks absent otherwise: no explicit unique index on email is added.
Identity already puts a unique index on `NormalizedUserName`, and task [13] sets `UserName` to the
user's email address, so email uniqueness is enforced by that existing index. Task [13] will also
set `RequireUniqueEmail`, giving a clean validation error before the database constraint is ever
reached.
