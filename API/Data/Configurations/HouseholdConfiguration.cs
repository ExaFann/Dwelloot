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

        // A concurrency token, which costs no schema change - it only adds is_full to the WHERE
        // clause of UPDATEs. That closes the last gap in the two-member rule: two people redeeming
        // the same invite code simultaneously would both pass the service's member-count check,
        // but only one UPDATE can match is_full = false, so the loser gets a clean 409 instead of
        // becoming a third member. The database cannot express "max 2 rows" portably (see
        // relational-model.md), so this is the closest storage-level guard available.
        builder.Property(h => h.IsFull)
            .HasDefaultValue(false)
            .IsConcurrencyToken();

        // A blank name is a single-row rule, so it belongs here - the same boundary that puts
        // points > 0 in the database (SS 3.14). Task [32]'s attribute guards HTTP callers and the
        // service guards every other caller; this holds whatever reaches the database.
        builder.ToTable(t => t.HasCheckConstraint("ck_households_name_not_blank", "btrim(name) <> ''"));

    }
}
