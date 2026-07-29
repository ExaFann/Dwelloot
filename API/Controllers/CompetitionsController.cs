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
public class CompetitionsController(
    ICompetitionQueryService competitions,
    ILootBoxService lootBoxes) : ControllerBase
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

    /// <summary>
    /// Reveals the loot box from a settled competition. Idempotent: repeat calls replay the same
    /// result without rolling again or crediting twice.
    /// </summary>
    [HttpPost("{competitionId:int}/open-box")]
    public async Task<ActionResult<OpenLootBoxResponse>> OpenBox(
        int householdId,
        int competitionId,
        CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var result = await lootBoxes.OpenAsync(userId.Value, householdId, competitionId, ct);

        return result.Status switch
        {
            LootBoxStatus.Ok => Ok(result.Box),

            LootBoxStatus.NotAMember or LootBoxStatus.CompetitionNotFound =>
                NotFound(new { error = "Competition not found." }),

            LootBoxStatus.Voided =>
                Conflict(new { error = "That period was voided, so no loot box was awarded." }),

            // 403, not 404: the caller can see this competition on their own dashboard, so hiding
            // it would confuse rather than protect. Same reasoning as self-approval in task [21].
            LootBoxStatus.NotYours =>
                StatusCode(
                    StatusCodes.Status403Forbidden,
                    new { error = "You did not win that period." }),

            _ => Unauthorized()
        };
    }
}
