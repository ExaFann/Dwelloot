using System.ComponentModel.DataAnnotations;
using API.Entities;

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
    [Required, StringLength(ActivityLog.RejectReasonMaxLength, MinimumLength = 1)]
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
