using API.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace API.Data.Configurations;

public class UserBadgeConfiguration : IEntityTypeConfiguration<UserBadge>
{
    public void Configure(EntityTypeBuilder<UserBadge> builder)
    {
        builder.HasKey(ub => ub.Id);

        builder.Property(ub => ub.UnlockedAt)
            .IsRequired();

        // Restrict, consistent with every other user FK: v1 never deletes a user.
        builder.HasOne(ub => ub.User)
            .WithMany()
            .HasForeignKey(ub => ub.UserId)
            .IsRequired()
            .OnDelete(DeleteBehavior.Restrict);

        // Cascade, consistent with the catalog-parent pattern: an unlock record is meaningless
        // without its badge, so retiring a badge should take its unlock records with it.
        builder.HasOne(ub => ub.Badge)
            .WithMany()
            .HasForeignKey(ub => ub.BadgeId)
            .IsRequired()
            .OnDelete(DeleteBehavior.Cascade);

        // A badge unlocks once per user. Task [26] re-checks criteria on every settlement, so
        // without this a fourth consecutive win would insert a second "3-day win streak" row and
        // the badge grid would show duplicates. User first also serves GET /api/badges, which
        // looks up one user's unlocks to mark each badge locked or unlocked.
        builder.HasIndex(ub => new { ub.UserId, ub.BadgeId })
            .IsUnique();
    }
}
