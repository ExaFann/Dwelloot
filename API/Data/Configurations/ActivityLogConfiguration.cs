using API.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace API.Data.Configurations;

public class ActivityLogConfiguration : IEntityTypeConfiguration<ActivityLog>
{
    public void Configure(EntityTypeBuilder<ActivityLog> builder)
    {
        builder.HasKey(l => l.Id);

        builder.Property(l => l.Status)
            .IsRequired()
            .HasConversion<string>()
            .HasMaxLength(20)
            .HasDefaultValue(ActivityLogStatus.Pending);

        builder.Property(l => l.CompletedAt)
            .IsRequired();

        builder.Property(l => l.RejectReason)
            .HasMaxLength(ActivityLog.RejectReasonMaxLength);

        // Cascade is forced by the delete graph, not just preferred: households cascade to their
        // activities, so restricting here would make deleting a household fail on its own
        // cascade. Losing logs loses the audit trail only - LifetimePoints is a stored running
        // total and settled competitions persist their own results, so no score is recomputed.
        builder.HasOne(l => l.Activity)
            .WithMany()
            .HasForeignKey(l => l.ActivityId)
            .IsRequired()
            .OnDelete(DeleteBehavior.Cascade);

        // Restrict on both user FKs: v1 never deletes a user (leaving a household only nulls
        // household_id). If account deletion is added later it has to decide deliberately what
        // happens to logged and approved history, rather than inheriting a cascade that would
        // quietly erase the other partner's approval record too.
        builder.HasOne(l => l.LoggedBy)
            .WithMany()
            .HasForeignKey(l => l.LoggedByUserId)
            .IsRequired()
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(l => l.ApprovedBy)
            .WithMany()
            .HasForeignKey(l => l.ApprovedByUserId)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.Restrict);

        // Serves all three reads this table gets: the pending approval queue (status, excluding
        // own logs), GET /activity-logs/mine (user + status), and competition settlement in task
        // [23] (one user's approved logs within a period range).
        builder.HasIndex(l => new { l.LoggedByUserId, l.Status, l.CompletedAt });

        // Storage backstop for the rule documented on the entity: nobody approves their own log.
        // Unlike the max-2-members rule, this needs no counting of related rows - it compares two
        // columns of the same row, so it is portable and free. The IS NULL branch keeps pending
        // and rejected rows legal.
        builder.ToTable(t => t.HasCheckConstraint(
            "ck_activity_logs_no_self_approval",
            "approved_by_user_id IS NULL OR approved_by_user_id <> logged_by_user_id"));
    }
}
