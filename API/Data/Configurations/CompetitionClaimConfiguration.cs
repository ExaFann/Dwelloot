using API.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace API.Data.Configurations;

public class CompetitionClaimConfiguration : IEntityTypeConfiguration<CompetitionClaim>
{
    public void Configure(EntityTypeBuilder<CompetitionClaim> builder)
    {
        builder.HasKey(c => c.Id);

        builder.Property(c => c.OpenedAt)
            .IsRequired();

        // Cascade: a claim is meaningless without its competition, and competitions already
        // cascade from households, so restricting here would break household deletion.
        builder.HasOne(c => c.Competition)
            .WithMany()
            .HasForeignKey(c => c.CompetitionId)
            .IsRequired()
            .OnDelete(DeleteBehavior.Cascade);

        // Restrict, consistent with every other user FK.
        builder.HasOne(c => c.User)
            .WithMany()
            .HasForeignKey(c => c.UserId)
            .IsRequired()
            .OnDelete(DeleteBehavior.Restrict);

        // A partner opens a given box once. This is what makes POST .../open-box idempotent at
        // the storage layer, not just in task [25]'s code.
        builder.HasIndex(c => new { c.CompetitionId, c.UserId })
            .IsUnique();
    }
}
