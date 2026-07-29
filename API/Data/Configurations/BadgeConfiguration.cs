using API.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace API.Data.Configurations;

public class BadgeConfiguration : IEntityTypeConfiguration<Badge>
{
    public void Configure(EntityTypeBuilder<Badge> builder)
    {
        builder.HasKey(b => b.Id);

        builder.Property(b => b.Name)
            .IsRequired()
            .HasMaxLength(Badge.NameMaxLength);

        builder.Property(b => b.Criteria)
            .IsRequired()
            .HasMaxLength(Badge.CriteriaMaxLength);

        // Seeded as real rows, unlike the Activity/Reward templates. Badges are a global catalog
        // nobody edits, so the leak that forces copy-on-creation there cannot happen here - and
        // user_badges.badge_id is a foreign key, so these must exist as rows regardless.
        //
        // Ids are the BadgeCode contract: every value below must match its enum member, and ids
        // 2 and 3 are additionally pinned by the GET /api/badges example in api-design.md.
        // Every criterion is checkable against columns that already exist, so task [26] needs no
        // schema changes to evaluate them.
        builder.HasData(
            new Badge
            {
                Id = (int)BadgeCode.FirstChore,
                Name = "First chore",
                Criteria = "Get your first logged chore approved."
            },
            new Badge
            {
                Id = (int)BadgeCode.ThreeDayWinStreak,
                Name = "3-day win streak",
                Criteria = "Win the daily duel three days in a row."
            },
            new Badge
            {
                Id = (int)BadgeCode.FirstRedemption,
                Name = "First redemption",
                Criteria = "Spend Coins in the Store for the first time."
            },
            new Badge
            {
                Id = (int)BadgeCode.SevenDayWinStreak,
                Name = "7-day win streak",
                Criteria = "Win the daily duel seven days in a row."
            },
            new Badge
            {
                Id = (int)BadgeCode.Century,
                Name = "Century",
                Criteria = "Earn 100 lifetime Points."
            },
            new Badge
            {
                Id = (int)BadgeCode.BigSpender,
                Name = "Big spender",
                Criteria = "Redeem five rewards."
            });
    }
}
