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

        // Snapshot of the reward's price at redemption time, constrained the same way
        // activity_logs.points_awarded is. A single-row rule, so it belongs in the database (task [30]).
        builder.Property(r => r.CoinsSpent)
            .IsRequired();

        builder.ToTable(t => t.HasCheckConstraint("ck_redemptions_coins_spent_positive", "coins_spent > 0"));

        // Cascade, forced by the delete graph the same way ActivityLog -> Activity is: households
        // cascade to rewards, so restricting here would make deleting a household fail on its own
        // cascade.
        //
        // Task [29] made that cascade unreachable through the API: DELETE /api/rewards/{id} archives
        // instead of deleting, precisely because losing these rows would let one partner un-void a day
        // the other had paid to pause, and set their badge progress back. Only deleting the household
        // still cascades, and that takes the competitions with it too.
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
