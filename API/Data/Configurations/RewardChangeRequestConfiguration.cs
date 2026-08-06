using API.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace API.Data.Configurations;

public class RewardChangeRequestConfiguration : IEntityTypeConfiguration<RewardChangeRequest>
{
    public void Configure(EntityTypeBuilder<RewardChangeRequest> builder)
    {
        builder.HasKey(r => r.Id);

        // A concurrency token, exactly as on ActivityLog.Status and for the same reason: reading
        // Pending and then writing leaves a window where two approvals both succeed. Here that
        // would apply the same change twice - harmless for a rename, but a second Create would add
        // a duplicate reward. With the token the loser's UPDATE matches no row.
        builder.Property(r => r.Status)
            .IsRequired()
            .HasConversion<string>()
            .HasMaxLength(20)
            .HasDefaultValue(RewardChangeStatus.Pending)
            .IsConcurrencyToken();

        // Stored as text rather than an int, matching ActivityLogStatus: a migration that reorders
        // the enum cannot then silently reinterpret existing rows.
        builder.Property(r => r.Kind)
            .IsRequired()
            .HasConversion<string>()
            .HasMaxLength(20);

        builder.Property(r => r.ProposedTitle)
            .HasMaxLength(Reward.TitleMaxLength);

        builder.Property(r => r.RejectReason)
            .HasMaxLength(RewardChangeRequest.RejectReasonMaxLength);

        builder.Property(r => r.RequestedAt)
            .IsRequired();

        builder.HasOne(r => r.Household)
            .WithMany()
            .HasForeignKey(r => r.HouseholdId)
            .IsRequired()
            .OnDelete(DeleteBehavior.Cascade);

        // Restrict, matching ActivityLog's two user links: a user row outliving its household must
        // not silently take the record of what they proposed with it.
        builder.HasOne(r => r.RequestedBy)
            .WithMany()
            .HasForeignKey(r => r.RequestedByUserId)
            .IsRequired()
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(r => r.DecidedBy)
            .WithMany()
            .HasForeignKey(r => r.DecidedByUserId)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(r => r.Reward)
            .WithMany()
            .HasForeignKey(r => r.RewardId)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.Cascade);

        // The queue read: one household's pending requests, newest first.
        builder.HasIndex(r => new { r.HouseholdId, r.Status, r.RequestedAt });

        // Third layer of no-self-approval, same shape as ck_activity_logs_no_self_approval. Two
        // columns of one row, so it is portable and free; the IS NULL branch keeps pending rows
        // legal. The service returns 403 and the queue excludes your own - this is the line that
        // holds whatever reaches the database.
        builder.ToTable(t => t.HasCheckConstraint(
            "ck_reward_change_requests_no_self_approval",
            "decided_by_user_id IS NULL OR decided_by_user_id <> requested_by_user_id"));

        // A Create has nothing to point at; an Update or Delete must. Without this, an Update with
        // a null reward_id would be accepted and then fail obscurely at approval time, which is the
        // worst moment to discover it.
        builder.ToTable(t => t.HasCheckConstraint(
            "ck_reward_change_requests_reward_id_matches_kind",
            "(kind = 'Create' AND reward_id IS NULL) OR (kind <> 'Create' AND reward_id IS NOT NULL)"));

        // **One open request per reward.** A filtered unique index rather than a service check,
        // because the check-then-insert version has a race that two taps can win, and the outcome
        // would be two pending changes to one reward - at which point "approve" has to answer
        // "approve which one", a question the UI has no way to ask. A Create is exempt: it has no
        // reward_id, and NULLs do not collide in a unique index anyway.
        builder.HasIndex(r => r.RewardId)
            .IsUnique()
            .HasFilter("status = 'Pending' AND reward_id IS NOT NULL")
            .HasDatabaseName("ux_reward_change_requests_one_open_per_reward");
    }
}
