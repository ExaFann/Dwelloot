using API.Dtos;
using API.Dtos.Rewards;
using API.Errors;
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
                this.Failure(StatusCodes.Status409Conflict, "You are not in a household yet."),

            // 400 rather than a silent fallback, so a frontend typo surfaces immediately instead of
            // quietly returning mis-ordered data. Same as ActivitiesController.
            RewardQueryStatus.InvalidSort =>
                this.Failure(
                    StatusCodes.Status400BadRequest,
                    $"Unknown sort field. Valid values: {string.Join(", ", RewardSortFields.All)}."),

            _ => Unauthorized()
        };
    }

    [HttpPost]
    public async Task<ActionResult<RewardResponse>> Create(CreateRewardRequest request, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var result = await rewards.CreateAsync(userId.Value, request, ct);

        return result.Status == RewardMutationStatus.Ok
            ? Created($"/api/rewards/{result.Reward!.Id}", result.Reward)
            : MapMutationFailure(result.Status);
    }

    [HttpPatch("{id:int}")]
    public async Task<ActionResult<RewardResponse>> Update(
        int id,
        PatchRewardRequest request,
        CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var result = await rewards.UpdateAsync(userId.Value, id, request, ct);

        return result.Status == RewardMutationStatus.Ok
            ? Ok(result.Reward)
            : MapMutationFailure(result.Status);
    }

    /// <summary>
    /// Removes a reward from the store. Its redemptions survive — the row is archived rather than
    /// deleted. See <see cref="IRewardService.DeleteAsync"/>.
    /// </summary>
    [HttpDelete("{id:int}")]
    public async Task<ActionResult> Delete(int id, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var result = await rewards.DeleteAsync(userId.Value, id, ct);

        return result.Status == RewardMutationStatus.Ok
            ? NoContent()
            : MapMutationFailure(result.Status);
    }

    /// <remarks>
    /// <see cref="RewardMutationStatus.NotFound"/> covers "no such reward", "someone else's reward"
    /// and "archived" alike — see the note on the service. Same 404-not-403 reasoning as
    /// <see cref="ActivitiesController"/>.
    /// </remarks>
    private ActionResult MapMutationFailure(RewardMutationStatus status) => status switch
    {
        RewardMutationStatus.NoHousehold =>
            this.Failure(StatusCodes.Status409Conflict, "You are not in a household yet."),

        RewardMutationStatus.NotFound =>
            this.Failure(StatusCodes.Status404NotFound, "Reward not found."),

        RewardMutationStatus.InvalidCoinCost =>
            this.Failure(StatusCodes.Status400BadRequest, "Coin cost must be greater than zero."),

        RewardMutationStatus.CannotDeletePausingReward =>
            this.Failure(
                StatusCodes.Status409Conflict,
                "This reward pauses the duel and cannot be removed. You can change its price instead."),

        RewardMutationStatus.InvalidTitle =>
            this.Failure(StatusCodes.Status400BadRequest, "Title must contain at least one visible character."),

        _ => Unauthorized()
    };
}
