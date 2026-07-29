using API.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace API.Data.Configurations;

public class CompetitionConfiguration : IEntityTypeConfiguration<Competition>
{
    public void Configure(EntityTypeBuilder<Competition> builder)
    {
        builder.HasKey(c => c.Id);

        builder.Property(c => c.PeriodType)
            .IsRequired()
            .HasConversion<string>()
            .HasMaxLength(20);

        builder.Property(c => c.PeriodStart).IsRequired();
        builder.Property(c => c.PeriodEnd).IsRequired();

        // Not nullable: a row exists only because settlement ran, so there is no unsettled state
        // to represent. See the remarks on the entity.
        builder.Property(c => c.SettledAt).IsRequired();

        builder.Property(c => c.WinnerPoints).HasDefaultValue(0);
        builder.Property(c => c.LoserPoints).HasDefaultValue(0);
        builder.Property(c => c.CoinsAwarded).HasDefaultValue(0);
        builder.Property(c => c.IsWinWin).HasDefaultValue(false);
        builder.Property(c => c.IsVoided).HasDefaultValue(false);

        builder.HasOne(c => c.Household)
            .WithMany()
            .HasForeignKey(c => c.HouseholdId)
            .IsRequired()
            .OnDelete(DeleteBehavior.Cascade);

        // Restrict, consistent with every other user FK. Nullable because "no winner" is a normal
        // outcome - win-win or voided - not a missing value.
        builder.HasOne(c => c.Winner)
            .WithMany()
            .HasForeignKey(c => c.WinnerUserId)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.Restrict);

        // SetNull, and it is forced rather than preferred: rewards cascade from households, so
        // Restrict would make deleting a household fail on its own cascade, while Cascade would
        // delete competition history because a prize was later removed from the store. SetNull
        // keeps the competition. Task [29] should render the resulting null as "a bonus reward
        // (since removed)" rather than assuming it is always present.
        builder.HasOne(c => c.BonusReward)
            .WithMany()
            .HasForeignKey(c => c.BonusRewardId)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.SetNull);

        // Guards a real race, not a theoretical one. Settlement is lazy, and this app has exactly
        // two users who both open the dashboard in the morning: two concurrent requests after a
        // period boundary would each find the period unsettled and each try to settle it. Without
        // this, that is two rows for one period - two loot boxes and doubled Coins. With it, one
        // insert wins and task [24] catches the violation and re-reads.
        builder.HasIndex(c => new { c.HouseholdId, c.PeriodType, c.PeriodStart })
            .IsUnique();
    }
}
