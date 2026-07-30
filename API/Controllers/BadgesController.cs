using API.Dtos.Badges;
using API.Extensions;
using API.Services.Progression;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

[ApiController]
[Authorize]
[Route("api/badges")]
public class BadgesController(IBadgeQueryService badges) : ControllerBase
{
    /// <summary>
    /// The badge grid for screen 5: every badge in the catalog, with the caller's unlock state.
    /// </summary>
    /// <remarks>
    /// No route or query parameters, and no household in the path. Badges are a global catalog and
    /// unlocks belong to the user, so there is no id to scope or to leak — the 404-not-403 rule the
    /// rest of the API follows has nothing to hide here.
    /// </remarks>
    [HttpGet]
    public async Task<ActionResult<BadgeListResponse>> List(CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var result = await badges.ListAsync(userId.Value, ct);

        return result.Status switch
        {
            BadgeQueryStatus.Ok => Ok(result.Badges),

            _ => Unauthorized()
        };
    }
}
