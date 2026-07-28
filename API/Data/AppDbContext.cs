using API.Entities;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace API.Data;

/// <summary>
/// EF Core context for Dwelloot. Entities arrive one per task across [3]–[10], each with
/// its own <see cref="IEntityTypeConfiguration{TEntity}"/> under <c>Data/Configurations</c>;
/// the first migration lands in [11].
/// </summary>
/// <remarks>
/// Derives from <see cref="IdentityUserContext{TUser, TKey}"/> rather than
/// <c>IdentityDbContext</c>: the app has no RBAC to model (two symmetric partners, no
/// hierarchy), so the role stores would only add tables nothing
/// reads.
/// </remarks>
public class AppDbContext(DbContextOptions<AppDbContext> options)
    : IdentityUserContext<User, int>(options)
{
    public DbSet<Household> Households => Set<Household>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // Picks up every IEntityTypeConfiguration in this assembly, so entities added in
        // later tasks register themselves without this method having to grow.
        //
        // Runs before the Identity renames below on purpose: UserConfiguration renames the
        // users table, and foreign key constraint names are derived from the principal
        // table's name. Renaming users afterwards would leave the child tables carrying
        // constraints called fk_user_claims_asp_net_users_user_id.
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(AppDbContext).Assembly);

        // Identity's own tables, renamed off their AspNet* defaults to match the names in
        // relational-model.md. These are framework plumbing rather than entities in the ER
        // diagram, which is why they are configured here instead of in Data/Configurations.
        modelBuilder.Entity<IdentityUserClaim<int>>().ToTable("user_claims");
        modelBuilder.Entity<IdentityUserLogin<int>>().ToTable("user_logins");
        modelBuilder.Entity<IdentityUserToken<int>>().ToTable("user_tokens");
    }
}
