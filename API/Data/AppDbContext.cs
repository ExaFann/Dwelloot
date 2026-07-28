using API.Entities;
using Microsoft.EntityFrameworkCore;

namespace API.Data;

/// <summary>
/// EF Core context for Dwelloot. Entities arrive one per task across [3]–[10], each with
/// its own <see cref="IEntityTypeConfiguration{TEntity}"/> under <c>Data/Configurations</c>;
/// the first migration lands in [11].
/// </summary>
public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Household> Households => Set<Household>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // Picks up every IEntityTypeConfiguration in this assembly, so entities added in
        // later tasks register themselves without this method having to grow.
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(AppDbContext).Assembly);
    }
}
