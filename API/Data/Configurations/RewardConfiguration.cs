using API.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace API.Data.Configurations;

public class RewardConfiguration : IEntityTypeConfiguration<Reward>
{
    public void Configure(EntityTypeBuilder<Reward> builder)
    {
        builder.HasKey(r => r.Id);

        builder.Property(r => r.Title)
            .IsRequired()
            .HasMaxLength(Reward.TitleMaxLength);

        builder.Property(r => r.PausesCompetition)
            .HasDefaultValue(false);

        // Cascade, same as Activity: a store catalog has no meaning without its household.
        builder.HasOne(r => r.Household)
            .WithMany()
            .HasForeignKey(r => r.HouseholdId)
            .IsRequired()
            .OnDelete(DeleteBehavior.Cascade);

        // Same reasoning as ck_activities_points_positive: a portable row-level rule, and
        // validating Coin costs is named in the project plan as part of the Security advanced
        // requirement. A zero-cost reward would also be infinitely redeemable.
        builder.ToTable(t => t.HasCheckConstraint("ck_rewards_coin_cost_positive", "coin_cost > 0"));
    }
}
