using API.Dtos;
using API.Dtos.Activities;
using API.Extensions;
using API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

[ApiController]
[Authorize]
[Route("api/activities")]
public class ActivitiesController(IActivityService activities) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<PagedResponse<ActivityResponse>>> List(
        [FromQuery] ActivityQuery query,
        CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var result = await activities.ListAsync(userId.Value, query, ct);

        return result.Status switch
        {
            ActivityQueryStatus.Ok => Ok(result.Page),

            ActivityQueryStatus.NoHousehold =>
                Conflict(new { error = "You are not in a household yet." }),

            // 400 rather than a silent fallback, so a frontend typo surfaces immediately instead
            // of quietly returning mis-ordered data.
            ActivityQueryStatus.InvalidSort =>
                BadRequest(new
                {
                    error = $"Unknown sort field. Valid values: {string.Join(", ", ActivitySortFields.All)}."
                }),

            _ => Unauthorized()
        };
    }
}
