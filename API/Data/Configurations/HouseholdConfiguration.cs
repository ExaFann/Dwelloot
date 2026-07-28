using API.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace API.Data.Configurations;

public class HouseholdConfiguration : IEntityTypeConfiguration<Household>
{
    public void Configure(EntityTypeBuilder<Household> builder)
    {
        builder.HasKey(h => h.Id);

        builder.Property(h => h.Name)
            .IsRequired()
            .HasMaxLength(Household.NameMaxLength);

        builder.Property(h => h.InviteCode)
            .IsRequired()
            .HasMaxLength(Household.InviteCodeLength)
            .IsFixedLength();

        // Enforced in the database rather than only in code: joining resolves a household
        // by invite code alone, so a duplicate would silently pair someone with the wrong
        // household. That is an integrity rule, not just a validation nicety.
        builder.HasIndex(h => h.InviteCode)
            .IsUnique();

        builder.Property(h => h.IsFull)
            .HasDefaultValue(false);
    }
}
