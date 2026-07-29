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
}
