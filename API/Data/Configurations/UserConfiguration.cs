using API.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace API.Data.Configurations;

public class UserConfiguration : IEntityTypeConfiguration<User>
{
    public void Configure(EntityTypeBuilder<User> builder)
    {
        // The users table rename lives in AppDbContext.OnModelCreating, not here: it has to
        // happen before any other configuration declares a foreign key to users, and the order
        // ApplyConfigurationsFromAssembly runs configurations in is not guaranteed.

        // Identity names these two explicitly ("UserNameIndex" / "EmailIndex"), so the
        // snake_case convention leaves them alone and they end up as the only quoted,
        // PascalCase identifiers in the schema. Renamed for consistency with every other index.
        // UserNameIndex stays unique — task [13] sets UserName to the email address, so this
        // is what actually enforces one account per email.
        builder.HasIndex(u => u.NormalizedUserName).HasDatabaseName("ix_users_normalized_user_name");
        builder.HasIndex(u => u.NormalizedEmail).HasDatabaseName("ix_users_normalized_email");

        builder.Property(u => u.Name)
            .IsRequired()
            .HasMaxLength(User.NameMaxLength);

        builder.Property(u => u.LifetimePoints).HasDefaultValue(0);
        builder.Property(u => u.Coins).HasDefaultValue(0);
        builder.Property(u => u.CurrentWinStreak).HasDefaultValue(0);
        builder.Property(u => u.LongestWinStreak).HasDefaultValue(0);

        // Whether a purchase is affordable compares users.coins against rewards.coin_cost - two
        // tables - so it stays in application code (task [30]). But "a balance is never negative" is a
        // single-row rule, so by the same boundary it belongs here: a backstop against any single write
        // path that would overdraw, including a future refactor that skips the application check.
        //
        // It deliberately does NOT close the concurrent double-redeem race. EF writes absolute values,
        // so two simultaneous redemptions of a 30-Coin balance both write coins = 0 and neither goes
        // negative. That race is recorded as deferred debt in log 030 along with why each fix for it
        // was rejected - do not read this constraint as covering it.
        builder.ToTable(t => t.HasCheckConstraint("ck_users_coins_not_negative", "coins >= 0"));

        // SetNull, not Cascade: leaving a household deletes it once the last member is gone
        // (POST /households/{id}/leave). Cascading would delete the partners along with it;
        // set-null leaves them intact and unpaired, free to create or join another household.
        builder.HasOne(u => u.Household)
            .WithMany(h => h.Members)
            .HasForeignKey(u => u.HouseholdId)
            .OnDelete(DeleteBehavior.SetNull);
    }
}
