namespace API.Entities;

/// <summary>
/// One occurrence of a partner doing a chore, and its trip through peer approval.
/// </summary>
/// <remarks>
/// <para>
/// <b>A log may never be approved by the person who logged it.</b>
/// <see cref="ApprovedByUserId"/> must differ from <see cref="LoggedByUserId"/>. In
/// er-diagram this is why <c>logs</c> and <c>approves</c> are
/// drawn as two separate relationships between USER and ACTIVITYLOG rather than one — they are
/// always different people. Without the rule the whole competition is meaningless, since either
/// partner could rubber-stamp their own Points.
/// </para>
/// <para>
/// Enforced in the approve/reject endpoints (tasks [21], [22]), which is where a violation can be
/// turned into a proper API error. A database check constraint backs that up so no code path can
/// persist a self-approval — see <c>ActivityLogConfiguration</c>.
/// </para>
/// <para>
/// There is no Note field: cut deliberately, since partners living together can just talk to
/// each other.
/// </para>
/// </remarks>
public class ActivityLog
{
    public const int RejectReasonMaxLength = 200;

    public int Id { get; set; }

    public int ActivityId { get; set; }

    public Activity Activity { get; set; } = null!;

    /// <summary>The partner who did the chore.</summary>
    public int LoggedByUserId { get; set; }

    public User LoggedBy { get; set; } = null!;

    /// <summary>
    /// The partner who approved it; null while pending, and also on rejection. Nothing records
    /// who rejected a log because in a two-person household that is always the partner who did
    /// not log it, and so is derivable from <see cref="LoggedByUserId"/>.
    /// </summary>
    public int? ApprovedByUserId { get; set; }

    public User? ApprovedBy { get; set; }

    public ActivityLogStatus Status { get; set; } = ActivityLogStatus.Pending;

    /// <summary>When the chore was done. Set server-side at creation — there is no date picker.</summary>
    public DateTime CompletedAt { get; set; }

    public DateTime? ApprovedAt { get; set; }

    /// <summary>
    /// Why the partner rejected it. Required by the UI when rejecting, but nullable here because
    /// it is absent for every other status.
    /// </summary>
    public string? RejectReason { get; set; }
}
