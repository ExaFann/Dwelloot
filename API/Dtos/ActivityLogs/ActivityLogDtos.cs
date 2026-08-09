using System.ComponentModel.DataAnnotations;
using API.Entities;
using API.Validation;

namespace API.Dtos.ActivityLogs;

/// <remarks>
/// Minimal by design: <c>project-plan.md</c> cut the note field and there is no date picker, so the
/// only thing a client chooses is which chore was done. Who logged it and when both come from the
/// server.
/// </remarks>
public record CreateActivityLogRequest(
    [Range(1, int.MaxValue)]
    int ActivityId);

/// <summary>
/// Shape of <c>POST /api/activity-logs</c>'s 201 response, matching <c>api-design.md</c>.
/// </summary>
public record ActivityLogResponse(
    int Id,
    int ActivityId,
    ActivityLogStatus Status,
    DateTime CompletedAt);

/// <summary>
/// Item shape for the approval queue, <c>GET /api/activity-logs</c>.
/// </summary>
/// <remarks>
/// Two fields go beyond <c>api-design.md</c>'s worked example, both deliberately:
/// <c>Status</c>, because making the status filter optional leaves an item ambiguous without it,
/// and <c>PointsAwarded</c>, so the approval UI can show what it is approving — that value is a
/// snapshot taken at log time (task [19]) and is therefore not derivable from the chore's current
/// points.
/// </remarks>
public record PendingLogResponse(
    int Id,
    string ActivityTitle,
    int PointsAwarded,
    int LoggedByUserId,
    ActivityLogStatus Status,
    DateTime CompletedAt);

public record RejectActivityLogRequest(
    [Required, CleanText(ActivityLog.RejectReasonMaxLength)]
    string Reason);

/// <summary>
/// Shape of both <c>PATCH .../approve</c> and <c>PATCH .../reject</c>.
/// </summary>
/// <remarks>
/// <c>api-design.md</c> shows reject returning only <c>{ id, status }</c>. One record with a
/// nullable <c>ApprovedAt</c> is used instead of two types differing by a single field, so reject
/// returns <c>"approvedAt": null</c> and a client parses one shape for both outcomes.
/// </remarks>
public record ActivityLogDecisionResponse(int Id, ActivityLogStatus Status, DateTime? ApprovedAt);

public record BulkApproveRequest(
    [Required, MinLength(1), MaxLength(BulkApproveRequest.MaxIds)]
    IReadOnlyList<int> Ids)
{
    /// <summary>
    /// An unbounded array is a cheap way to make the server do arbitrary work — same reasoning as
    /// the page-size cap.
    /// </summary>
    public const int MaxIds = 100;
}

/// <summary>Why one id in a bulk request was not approved.</summary>
public record SkippedLogResponse(int Id, string Reason);

/// <summary>
/// Shape of <c>POST /api/activity-logs/bulk-approve</c>.
/// </summary>
/// <remarks>
/// <c>api-design.md</c> documents <c>approved</c> only. <c>Skipped</c> is additive: silently
/// dropping ids from a select-all is worse than useless, since the user sees "approved" and cannot
/// tell that two of their five did not go through.
/// </remarks>
public record BulkApproveResponse(
    IReadOnlyList<int> Approved,
    IReadOnlyList<SkippedLogResponse> Skipped);

/// <summary>Query options for the approval queue.</summary>
public record ActivityLogQuery
{
    /// <summary>
    /// Optional. <c>Pending</c> is the documented approval queue; omitting it returns the
    /// partner's logs at every status, which is what the dashboard feed wants.
    /// </summary>
    public ActivityLogStatus? Status { get; init; }

    public int? Page { get; init; }

    public int? PageSize { get; init; }
}

/// <summary>Query options for own history.</summary>
public record MyActivityLogQuery
{
    public ActivityLogStatus? Status { get; init; }

    /// <summary>
    /// Documented in <c>api-design.md</c> as <c>?take=5</c>. Treated as a page size — "the first 5"
    /// is exactly <c>page=1&amp;pageSize=5</c> — so the dashboard's documented call works while the
    /// Notices list can still page. <see cref="PageSize"/> wins if both are supplied, being the
    /// more specific of the two.
    /// </summary>
    public int? Take { get; init; }

    public int? Page { get; init; }

    public int? PageSize { get; init; }

    public int? EffectivePageSize => PageSize ?? Take;
}

/// <summary>
/// Item shape for <c>GET /api/activity-logs/mine</c>, covering both documented call sites: the
/// dashboard's recent feed wants <c>status</c> and <c>completedAt</c>, the Notices tab's
/// approved-list wants <c>approvedAt</c>.
/// </summary>
/// <remarks>
/// <c>RejectReason</c> goes beyond the worked examples deliberately. Task [21] made it mandatory
/// on input and nothing could ever read it back, which makes a required field pure ceremony — a
/// rejected log in your own history is exactly where the user needs to know why.
/// <c>PointsAwarded</c> matches the approval queue's shape so the feed can show what each entry
/// earned.
/// </remarks>
public record MyActivityLogResponse(
    int Id,
    string ActivityTitle,
    int PointsAwarded,
    ActivityLogStatus Status,
    DateTime CompletedAt,
    DateTime? ApprovedAt,
    string? RejectReason);
