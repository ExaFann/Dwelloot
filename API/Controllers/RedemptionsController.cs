using API.Dtos;
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

    /// <summary>
    /// The household's redemptions, optionally excluding the caller's own — the Notices tab's
    /// partner-achievements feed (task [31a]).
    /// </summary>
    /// <remarks>
    /// With <c>excludeMine=true</c> this and <see cref="Mine"/> partition the household's redemptions:
    /// every row appears in exactly one of them.
    /// </remarks>
    [HttpGet]
    public async Task<ActionResult<PagedResponse<HouseholdRedemptionResponse>>> Feed(
        [FromQuery] HouseholdRedemptionQuery query,
        CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var result = await redemptions.ListForHouseholdAsync(userId.Value, query, ct);

        return result.Status switch
        {
            RedemptionStatus.Ok => Ok(result.Page),

            RedemptionStatus.NoHousehold =>
                Conflict(new { error = "You are not in a household yet." }),

            // 400 rather than a silent fallback. Unlike the sort fields, the danger here is the
            // direction of the fallback: quietly widening a mistyped scope to the whole household
            // returns more data than the caller asked for.
            RedemptionStatus.InvalidScope =>
                BadRequest(new
                {
                    error = $"Unknown scope. Valid values: {string.Join(", ", RedemptionScopes.All)}."
                }),

            _ => Unauthorized()
        };
    }

    /// <summary>
    /// The caller's own purchase history, newest first.
    /// </summary>
    /// <remarks>
    /// This is <em>not</em> the source for the Notices tab's "partner's redemptions" section —
    /// <c>api-design.md</c> is explicit that using it there was the earlier draft's mistake. That is
    /// <see cref="Feed"/>, with <c>excludeMine=true</c>.
    /// </remarks>
    [HttpGet("mine")]
    public async Task<ActionResult<PagedResponse<MyRedemptionResponse>>> Mine(
        [FromQuery] MyRedemptionQuery query,
        CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var result = await redemptions.ListMineAsync(userId.Value, query, ct);

        return result.Status switch
        {
            RedemptionStatus.Ok => Ok(result.Page),

            RedemptionStatus.NoHousehold =>
                Conflict(new { error = "You are not in a household yet." }),

            _ => Unauthorized()
        };
    }
}
