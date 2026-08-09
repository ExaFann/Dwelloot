## Task

[2] Add EF Core packages and DbContext skeleton: install EF Core + provider packages; add an
empty `AppDbContext` and connection string configuration. No entities yet.

## Spec

- Add NuGet packages: `Microsoft.EntityFrameworkCore`, `Microsoft.EntityFrameworkCore.Design`,
  and the chosen provider package. Pin down and record the provider choice here (e.g. SQL Server
  vs PostgreSQL vs SQLite) since `project-plan.md` only said "a SQL database" — this is the first
  commit where that decision becomes concrete.
- Create `AppDbContext : DbContext` under `Data/`, empty for now — no `DbSet<T>` properties yet;
  those arrive alongside each entity in tasks [3]–[10].
- Add a connection string under `ConnectionStrings:Default` in `appsettings.json` (and
  `appsettings.Development.json` if local dev uses a different one).
- Register the context in `Program.cs` via `AddDbContext<AppDbContext>(...)`.
- Do not create a migration yet — that's task [11], once every entity exists.
