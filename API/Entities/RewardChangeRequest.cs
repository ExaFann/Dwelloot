namespace API.Entities;

/// <summary>What a pending change would do to the store.</summary>
public enum RewardChangeKind
{
    /// <summary>Add a new reward. <see cref="RewardChangeRequest.RewardId"/> is null.</summary>
    Create,

    /// <summary>Rename or re-price an existing reward.</summary>
    Update,

    /// <summary>Archive an existing reward.</summary>
    Delete
}

/// <summary>Where a proposed change has got to.</summary>
public enum RewardChangeStatus
{
    /// <summary>Proposed, waiting on the other partner. The store is unchanged.</summary>
    Pending,

    /// <summary>The partner approved it, and it has been applied.</summary>
    Approved,

    /// <summary>The partner refused it. The store is unchanged.</summary>
    Rejected
}

/// <summary>
/// A proposed change to the household's store, waiting on the other partner.
/// </summary>
/// <remarks>
/// <b>The hole this closes.</b> Either partner could re-price any reward at any moment, so the
/// sequence "make it cheap → redeem it → put the price back" was free money. Owner's report,
/// 2026-08-07. An earlier proposal of mine — price changes take effect at the next day boundary —
/// was rejected for two good reasons: it cannot say which of several same-day edits wins, and it
/// breaks the ordinary case where somebody edits a reward and expects to see the change.
/// <para>
/// <b>Why a queue rather than a rule.</b> The whole app already runs on "the other partner
/// approves": a chore is worth nothing until it is. Routing store edits through the same gate adds
/// no new concept for the user, and reuses a queue, a rule and a screen that already exist. This
/// entity is deliberately <see cref="ActivityLog"/> with a different payload — same household
/// scoping, same requested-by/decided-by pair, same Pending → Approved/Rejected progression, and
/// the same three layers of no-self-approval.
/// </para>
/// <para>
/// <b>Why a separate table rather than columns on <see cref="Reward"/>.</b> Pending columns
/// (<c>pending_title</c>, <c>pending_coin_cost</c>, …) look cheaper and are not. A <b>create</b> has
/// no row to hang them on, so it would need a reward that exists but is invisible — and every
/// existing reader would have to learn to exclude it: the store list, the redemption path, and the
/// loot box's prize lookup. <see cref="Reward.ArchivedAt"/> already records that two of those
/// readers must <em>not</em> filter archived rows; a second invisible state multiplies exactly the
/// trap that rule exists to flag, and a wrong prize lookup stays silent until somebody wins a box.
/// A separate table leaves <c>rewards</c> meaning precisely what it means today — the live
/// catalogue — so no existing query changes at all.
/// </para>
/// <para>
/// <b>A household of one applies changes immediately.</b> There is nobody to ask, and freezing the
/// store before pairing would make the app unusable for its first user. A household of two needs
/// approval for <em>all</em> of add, edit and delete — the owner declined an exemption for add,
/// because "some changes need approval" is a rule nobody can predict.
/// </para>
/// </remarks>
public class RewardChangeRequest
{
    public const int RejectReasonMaxLength = 200;

    public int Id { get; set; }

    public int HouseholdId { get; set; }

    public Household Household { get; set; } = null!;

    public int RequestedByUserId { get; set; }

    public User RequestedBy { get; set; } = null!;

    public RewardChangeKind Kind { get; set; }

    /// <summary>
    /// The reward being changed, or null for <see cref="RewardChangeKind.Create"/>.
    /// </summary>
    /// <remarks>
    /// <see cref="Microsoft.EntityFrameworkCore.DeleteBehavior.Cascade"/>: if the reward row ever
    /// goes, a request to change it is meaningless. Archiving does not delete the row, so an
    /// approved delete leaves its own request intact as history.
    /// </remarks>
    public int? RewardId { get; set; }

    public Reward? Reward { get; set; }

    /// <summary>
    /// The proposed title, or null when the change does not touch it.
    /// </summary>
    /// <remarks>
    /// <b>A snapshot, copied at request time</b> — the same rule as
    /// <see cref="ActivityLog.PointsAwarded"/> and <see cref="Redemption.CoinsSpent"/>. Approving
    /// applies what was proposed and shown to the partner, not whatever the reward happens to say by
    /// then. Without this, editing a reward while a change to it was pending would silently alter
    /// what the partner is being asked to agree to.
    /// </remarks>
    public string? ProposedTitle { get; set; }

    /// <summary>The proposed price in Coins, or null when the change does not touch it.</summary>
    public int? ProposedCoinCost { get; set; }

    /// <summary>
    /// No proposed <c>PausesCompetition</c>, deliberately.
    /// </summary>
    /// <remarks>
    /// Task [69] removed that flag from every client request: voiding a day belongs to one seeded
    /// special prize, and ordinary rewards can never acquire it. A change request that could propose
    /// it would put the field straight back, through a door nobody was watching.
    /// </remarks>
    public RewardChangeStatus Status { get; set; } = RewardChangeStatus.Pending;

    public DateTime RequestedAt { get; set; }

    /// <summary>The partner who approved or rejected it. Null while pending.</summary>
    public int? DecidedByUserId { get; set; }

    public User? DecidedBy { get; set; }

    public DateTime? DecidedAt { get; set; }

    /// <summary>Why it was refused. Null unless <see cref="RewardChangeStatus.Rejected"/>.</summary>
    public string? RejectReason { get; set; }
}
