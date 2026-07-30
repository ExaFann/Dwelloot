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

    [HttpPost]
    public async Task<ActionResult<ActivityResponse>> Create(CreateActivityRequest request, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var result = await activities.CreateAsync(userId.Value, request, ct);

        return result.Status == ActivityMutationStatus.Ok
            ? Created($"/api/activities/{result.Activity!.Id}", result.Activity)
            : MapMutationFailure(result.Status);
    }

    [HttpPatch("{id:int}")]
    public async Task<ActionResult<ActivityResponse>> Update(
        int id,
        PatchActivityRequest request,
        CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var result = await activities.UpdateAsync(userId.Value, id, request, ct);

        return result.Status == ActivityMutationStatus.Ok
            ? Ok(result.Activity)
            : MapMutationFailure(result.Status);
    }

    /// <summary>
    /// Removes a chore from the catalog. Its logged history and the points earned from it survive
    /// — the row is archived rather than deleted. See <see cref="IActivityService.DeleteAsync"/>.
    /// </summary>
    [HttpDelete("{id:int}")]
    public async Task<ActionResult> Delete(int id, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var result = await activities.DeleteAsync(userId.Value, id, ct);

        return result.Status == ActivityMutationStatus.Ok
            ? NoContent()
            : MapMutationFailure(result.Status);
    }

    /// <remarks>
    /// <see cref="ActivityMutationStatus.NotFound"/> covers both "no such chore" and "someone
    /// else's chore" — see the note on the service. Same 404-not-403 reasoning as
    /// <see cref="HouseholdsController"/>.
    /// </remarks>
    private ActionResult MapMutationFailure(ActivityMutationStatus status) => status switch
    {
        ActivityMutationStatus.NoHousehold =>
            Conflict(new { error = "You are not in a household yet." }),

        ActivityMutationStatus.NotFound =>
            NotFound(new { error = "Chore not found." }),

        ActivityMutationStatus.InvalidPoints =>
            BadRequest(new { error = "Points must be greater than zero." }),

        ActivityMutationStatus.InvalidTitle =>
            BadRequest(new { error = "Title must contain at least one visible character." }),

        _ => Unauthorized()
    };
}
