using API.Dtos.Competitions;
using API.Entities;
using API.Extensions;
using API.Services.Competitions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

[ApiController]
[Authorize]
[Route("api/households/{householdId:int}/competitions")]
public class CompetitionsController(ICompetitionQueryService competitions) : ControllerBase
{
    /// <summary>
    /// The live head-to-head standing, settling any period that closed since the last visit.
    /// </summary>
    /// <param name="periodType">
    /// Daily by default, matching <c>api-design.md</c>. Weekly and Monthly are accepted too, since
    /// settlement already covers all three.
    /// </param>
    [HttpGet("current")]
    public async Task<ActionResult<CurrentCompetitionResponse>> Current(
        int householdId,
        CancellationToken ct,
        [FromQuery] CompetitionPeriodType periodType = CompetitionPeriodType.Daily)
    {
        var userId = User.GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var result = await competitions.GetCurrentAsync(
            userId.Value, householdId, periodType, DateTime.UtcNow, ct);

        return result.Status switch
        {
            CompetitionQueryStatus.Ok => Ok(result.Standing),

            // 404 rather than 403, so household ids cannot be enumerated - same reasoning as
            // HouseholdsController.
            CompetitionQueryStatus.NotAMember =>
                NotFound(new { error = "Household not found." }),

            _ => Unauthorized()
        };
    }
}
