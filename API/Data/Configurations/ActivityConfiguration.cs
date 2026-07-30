using API.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace API.Data.Configurations;

public class ActivityConfiguration : IEntityTypeConfiguration<Activity>
{
    public void Configure(EntityTypeBuilder<Activity> builder)
    {
        builder.HasKey(a => a.Id);

        builder.Property(a => a.Title)
            .IsRequired()
            .HasMaxLength(Activity.TitleMaxLength);

        // Stored as its name rather than an ordinal, so the column reads as the string the ER
        // diagram describes and new members can be added without migrating existing rows.
        builder.Property(a => a.Category)
            .IsRequired()
            .HasConversion<string>()
            .HasMaxLength(20)
            .HasDefaultValue(ActivityCategory.Chore);

        // Cascade, unlike User's set-null: a household's chore catalog has no meaning without
        // the household, whereas the partners themselves outlive it.
        builder.HasOne(a => a.Household)
            .WithMany()
            .HasForeignKey(a => a.HouseholdId)
            .IsRequired()
            .OnDelete(DeleteBehavior.Cascade);

        // Enforced in the database, not only in the task [32] validation layer. Rejecting
        // negative point values is in project plan as part of the Security advanced
        // requirement, and a zero-point chore cannot influence a competition anyway.
        builder.ToTable(t => t.HasCheckConstraint("ck_activities_points_positive", "points > 0"));

        // A blank title is a single-row rule, so it belongs here - the same boundary that puts
        // points > 0 in the database and the affordability check in code (SS 3.14). Task [32]'s
        // attribute guards HTTP callers and the service guards every other caller; this is the line
        // that holds whatever reaches the database.
        builder.ToTable(t => t.HasCheckConstraint("ck_activities_title_not_blank", "btrim(title) <> ''"));

    }
}
