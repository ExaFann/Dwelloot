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
