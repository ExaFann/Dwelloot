using API.Dtos;
using API.Dtos.ActivityLogs;
using API.Extensions;
using API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

[ApiController]
[Authorize]
[Route("api/activity-logs")]
public class ActivityLogsController(IActivityLogService logs) : ControllerBase
{
    /// <summary>
    /// The approval queue: the <em>partner's</em> logs in this household. Never the caller's own —
    /// see <see cref="IActivityLogService.ListForApprovalAsync"/>.
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<PagedResponse<PendingLogResponse>>> List(
        [FromQuery] ActivityLogQuery query,
        CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var result = await logs.ListForApprovalAsync(userId.Value, query, ct);

        return result.Status switch
        {
            ActivityLogStatusCode.Ok => Ok(result.Page),

            ActivityLogStatusCode.NoHousehold =>
                Conflict(new { error = "You are not in a household yet." }),

            _ => Unauthorized()
        };
    }

    /// <summary>
    /// The caller's own logged history — the complement of <see cref="List"/>.
    /// </summary>
    [HttpGet("mine")]
    public async Task<ActionResult<PagedResponse<MyActivityLogResponse>>> Mine(
        [FromQuery] MyActivityLogQuery query,
        CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var result = await logs.ListMineAsync(userId.Value, query, ct);

        return result.Status switch
        {
            ActivityLogStatusCode.Ok => Ok(result.Page),

            ActivityLogStatusCode.NoHousehold =>
                Conflict(new { error = "You are not in a household yet." }),

            _ => Unauthorized()
        };
    }

    [HttpPost]
    public async Task<ActionResult<ActivityLogResponse>> Create(
        CreateActivityLogRequest request,
        CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var result = await logs.CreateAsync(userId.Value, request.ActivityId, ct);

        return result.Status switch
        {
            ActivityLogStatusCode.Ok =>
                Created($"/api/activity-logs/{result.Log!.Id}", result.Log),

            ActivityLogStatusCode.NoHousehold =>
                Conflict(new { error = "You are not in a household yet." }),

            // Covers "no such chore", "someone else's chore" and "archived chore" alike, so the
            // endpoint cannot be used to discover which ids exist.
            ActivityLogStatusCode.ActivityNotFound =>
                NotFound(new { error = "Chore not found." }),

            _ => Unauthorized()
        };
    }

    [HttpPatch("{id:int}/approve")]
    public async Task<ActionResult<ActivityLogDecisionResponse>> Approve(int id, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var result = await logs.ApproveAsync(userId.Value, id, ct);

        return result.Status == ActivityLogStatusCode.Ok
            ? Ok(result.Log)
            : MapDecisionFailure(result.Status);
    }

    [HttpPatch("{id:int}/reject")]
    public async Task<ActionResult<ActivityLogDecisionResponse>> Reject(
        int id,
        RejectActivityLogRequest request,
        CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var result = await logs.RejectAsync(userId.Value, id, request.Reason, ct);

        return result.Status == ActivityLogStatusCode.Ok
            ? Ok(result.Log)
            : MapDecisionFailure(result.Status);
    }

    /// <summary>
    /// Approves several logs at once, skipping any the caller may not decide.
    /// </summary>
    /// <remarks>
    /// Best-effort: the response reports which ids were approved and which were skipped, and why.
    /// See <see cref="IActivityLogService.BulkApproveAsync"/>.
    /// </remarks>
    [HttpPost("bulk-approve")]
    public async Task<ActionResult<BulkApproveResponse>> BulkApprove(
        BulkApproveRequest request,
        CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var result = await logs.BulkApproveAsync(userId.Value, request.Ids, ct);

        return result.Status == ActivityLogStatusCode.Ok
            ? Ok(result.Response)
            : MapDecisionFailure(result.Status);
    }

    /// <remarks>
    /// The asymmetry is deliberate. Another household's log is a 404 so ids cannot be enumerated;
    /// the caller's own log is a <b>403</b>, because they created it and know perfectly well that
    /// it exists — a 404 there would confuse rather than protect.
    /// </remarks>
    private ActionResult MapDecisionFailure(ActivityLogStatusCode status) => status switch
    {
        ActivityLogStatusCode.NoHousehold =>
            Conflict(new { error = "You are not in a household yet." }),

        ActivityLogStatusCode.LogNotFound =>
            NotFound(new { error = "Log not found." }),

        ActivityLogStatusCode.SelfApproval =>
            StatusCode(
                StatusCodes.Status403Forbidden,
                new { error = "You cannot approve or reject a chore you logged yourself." }),

        ActivityLogStatusCode.NotPending =>
            Conflict(new { error = "This log has already been decided." }),

        ActivityLogStatusCode.Conflict =>
            Conflict(new { error = "This log was decided just now. Refresh and try again." }),

        _ => Unauthorized()
    };
}
