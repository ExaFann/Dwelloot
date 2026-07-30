using API.Dtos.Redemptions;
using API.Extensions;
using API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

[ApiController]
[Authorize]
[Route("api/redemptions")]
public class RedemptionsController(IRedemptionService redemptions) : ControllerBase
{
    /// <summary>
    /// Buys a reward from the household's store with the caller's Coins.
    /// </summary>
    /// <remarks>
    /// If the reward has <c>pausesCompetition</c> set, this also voids that calendar day's daily
    /// competition for <b>both</b> partners — derived by settlement from the redemption row rather than
    /// recorded here, so the two can never disagree. The store is responsible for saying so before the
    /// caller presses the button (tasks [29]/[51]).
    /// </remarks>
    [HttpPost]
    public async Task<ActionResult<RedemptionResponse>> Create(
        CreateRedemptionRequest request,
        CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var result = await redemptions.CreateAsync(userId.Value, request.RewardId, ct);

        return result.Status switch
        {
            RedemptionStatus.Ok =>
                Created($"/api/redemptions/{result.Redemption!.Id}", result.Redemption),

            RedemptionStatus.NoHousehold =>
                Conflict(new { error = "You are not in a household yet." }),

            // Covers "no such reward", "another household's reward" and "archived reward" alike, so the
            // endpoint cannot be used to discover which ids exist. Same 404-not-403 reasoning as
            // RewardsController.
            RedemptionStatus.RewardNotFound =>
                NotFound(new { error = "Reward not found." }),

            RedemptionStatus.InsufficientCoins =>
                BadRequest(new { error = "Not enough Coins." }),

            _ => Unauthorized()
        };
    }
}
