using API.Dtos;
using API.Dtos.Rewards;
using API.Extensions;
using API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

[ApiController]
[Authorize]
[Route("api/rewards")]
public class RewardsController(IRewardService rewards) : ControllerBase
{
    /// <summary>
    /// The store catalog for screen 4: this household's own rewards, with sort, search, paging and
    /// an affordability filter.
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<PagedResponse<RewardResponse>>> List(
        [FromQuery] RewardQuery query,
        CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var result = await rewards.ListAsync(userId.Value, query, ct);

        return result.Status switch
        {
            RewardQueryStatus.Ok => Ok(result.Page),

            RewardQueryStatus.NoHousehold =>
                Conflict(new { error = "You are not in a household yet." }),

            // 400 rather than a silent fallback, so a frontend typo surfaces immediately instead of
            // quietly returning mis-ordered data. Same as ActivitiesController.
            RewardQueryStatus.InvalidSort =>
                BadRequest(new
                {
                    error = $"Unknown sort field. Valid values: {string.Join(", ", RewardSortFields.All)}."
                }),

            _ => Unauthorized()
        };
    }
}
