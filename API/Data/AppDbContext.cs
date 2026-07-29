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
    public DbSet<Activity> Activities => Set<Activity>();
    public DbSet<ActivityLog> ActivityLogs => Set<ActivityLog>();
    public DbSet<Reward> Rewards => Set<Reward>();
    public DbSet<Redemption> Redemptions => Set<Redemption>();
    public DbSet<Badge> Badges => Set<Badge>();
    public DbSet<UserBadge> UserBadges => Set<UserBadge>();
    public DbSet<Competition> Competitions => Set<Competition>();
    public DbSet<CompetitionClaim> CompetitionClaims => Set<CompetitionClaim>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // Identity's own tables, renamed off their AspNet* defaults to match the names in
        // relational-model.md. These are framework plumbing rather than entities in the ER
        // diagram, which is why they are configured here instead of in Data/Configurations.
        //
        // This must run BEFORE ApplyConfigurationsFromAssembly. Foreign key constraint names
        // are derived from the principal table's name, so any configuration declaring an FK to
        // users while it is still called AspNetUsers bakes that into the constraint name -
        // producing fk_activity_logs_asp_net_users_logged_by_user_id against a table called
        // users. ApplyConfigurationsFromAssembly gives no ordering guarantee, so relying on
        // UserConfiguration happening to run first is not a fix.
        modelBuilder.Entity<User>().ToTable("users");
        modelBuilder.Entity<IdentityUserClaim<int>>().ToTable("user_claims");
        modelBuilder.Entity<IdentityUserLogin<int>>().ToTable("user_logins");
        modelBuilder.Entity<IdentityUserToken<int>>().ToTable("user_tokens");

        // Picks up every IEntityTypeConfiguration in this assembly, so entities added in
        // later tasks register themselves without this method having to grow.
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(AppDbContext).Assembly);
    }
}
