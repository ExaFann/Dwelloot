using API.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace API.Data.Configurations;

public class BadgeConfiguration : IEntityTypeConfiguration<Badge>
{
    /// <summary>
    /// Seeded as real rows, unlike the Activity/Reward templates. Badges are a global catalog
    /// nobody edits, so the leak that forces copy-on-creation there cannot happen here — and
    /// <c>user_badges.badge_id</c> is a foreign key, so these must exist as rows regardless.
    /// </summary>
    /// <remarks>
    /// Ids are the <see cref="BadgeCode"/> contract: every entry takes its id from the matching
    /// enum member, and ids 2 and 3 are additionally pinned by the <c>GET /api/badges</c> example
    /// in <c>api-design.md</c>. Every criterion is checkable against columns that already exist,
    /// so task [26] needs no schema changes to evaluate them.
    /// </remarks>
    private static readonly Badge[] SeedRows =
    [
        new()
        {
            Id = (int)BadgeCode.FirstChore,
            Name = "First chore",
            Criteria = "Get your first logged chore approved."
        },
        new()
        {
            Id = (int)BadgeCode.ThreeDayWinStreak,
            Name = "3-day win streak",
            Criteria = "Win the daily duel three days in a row."
        },
        new()
        {
            Id = (int)BadgeCode.FirstRedemption,
            Name = "First redemption",
            Criteria = "Spend Coins in the Store for the first time."
        },
        new()
        {
            Id = (int)BadgeCode.SevenDayWinStreak,
            Name = "7-day win streak",
            Criteria = "Win the daily duel seven days in a row."
        },
        new()
        {
            Id = (int)BadgeCode.Century,
            Name = "Century",
            Criteria = "Earn 100 lifetime Points."
        },
        new()
        {
            Id = (int)BadgeCode.BigSpender,
            Name = "Big spender",
            Criteria = "Redeem five rewards."
        }
    ];

    public void Configure(EntityTypeBuilder<Badge> builder)
    {
        builder.HasKey(b => b.Id);

        // Declares in the DDL that ids 1..SeedRows.Length are reserved for the seed, so the table
        // definition itself says where runtime ids begin. Derived from the array's length so
        // adding a badge cannot leave the two out of step.
        //
        // This is documentation, not a fix: Npgsql already emits a setval alongside the seed
        // INSERTs that advances the sequence past MAX(id), so a runtime insert would not have
        // collided either way. Kept because START WITH is visible in the schema while the setval
        // is a one-time side effect of the migration - but do not re-derive a bug from its
        // absence if it is ever removed.
        builder.Property(b => b.Id)
            .UseIdentityByDefaultColumn()
            .HasIdentityOptions(startValue: SeedRows.Length + 1);

        builder.Property(b => b.Name)
            .IsRequired()
            .HasMaxLength(Badge.NameMaxLength);

        builder.Property(b => b.Criteria)
            .IsRequired()
            .HasMaxLength(Badge.CriteriaMaxLength);

        builder.HasData(SeedRows);
    }
}
