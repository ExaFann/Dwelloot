using API.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace API.Data.Configurations;

public class RedemptionConfiguration : IEntityTypeConfiguration<Redemption>
{
    public void Configure(EntityTypeBuilder<Redemption> builder)
    {
        builder.HasKey(r => r.Id);

        builder.Property(r => r.RedeemedAt)
            .IsRequired();

        // Cascade, forced by the delete graph the same way ActivityLog -> Activity is: households
        // cascade to rewards, so restricting here would make deleting a household fail on its own
        // cascade. Deleting a reward therefore erases its redemption history, which refunds
        // nobody - User.Coins is a stored running total, not recomputed from these rows.
        builder.HasOne(r => r.Reward)
            .WithMany()
            .HasForeignKey(r => r.RewardId)
            .IsRequired()
            .OnDelete(DeleteBehavior.Cascade);

        // Restrict, consistent with both user FKs on ActivityLog: v1 never deletes a user, and
        // this forces any later account-deletion feature to decide what happens to spend history.
        builder.HasOne(r => r.User)
            .WithMany()
            .HasForeignKey(r => r.UserId)
            .IsRequired()
            .OnDelete(DeleteBehavior.Restrict);

        // Serves GET /api/redemptions/mine including its reverse-chronological ordering. The
        // automatic FK index on reward_id serves the join task [23] uses to find paused days.
        builder.HasIndex(r => new { r.UserId, r.RedeemedAt });
    }
}
