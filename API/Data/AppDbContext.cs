using Microsoft.EntityFrameworkCore;

namespace API.Data;

/// <summary>
/// EF Core context for Dwelloot. Intentionally empty at this stage — entity
/// <see cref="DbSet{TEntity}"/> properties and their configuration arrive one
/// per entity in tasks [3]–[10], and the first migration in [11].
/// </summary>
public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
}
