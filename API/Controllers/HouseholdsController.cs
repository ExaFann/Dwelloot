using API.Dtos.Households;
using API.Extensions;
using API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

[ApiController]
[Authorize]
[Route("api/households")]
public class HouseholdsController(IHouseholdService households) : ControllerBase
{
    [HttpPost]
    public async Task<ActionResult<HouseholdSummaryResponse>> Create(
        CreateHouseholdRequest request,
        CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var result = await households.CreateAsync(userId.Value, request.Name, ct);

        switch (result.Status)
        {
            case CreateHouseholdStatus.Created:
                var household = result.Household!;

                // An explicit location rather than CreatedAtAction: GET /api/households/{id}
                // does not exist until task [16], and CreatedAtAction throws on an unknown action.
                return Created(
                    $"/api/households/{household.Id}",
                    new HouseholdSummaryResponse(
                        household.Id,
                        household.Name,
                        household.InviteCode,
                        household.IsFull));

            case CreateHouseholdStatus.AlreadyInHousehold:
                return Conflict(new { error = "You are already in a household." });

            case CreateHouseholdStatus.UserNotFound:
                return Unauthorized();

            case CreateHouseholdStatus.CouldNotGenerateInviteCode:
            default:
                return StatusCode(
                    StatusCodes.Status503ServiceUnavailable,
                    new { error = "Could not allocate an invite code. Please try again." });
        }
    }

    [HttpPost("join")]
    public async Task<ActionResult<JoinHouseholdResponse>> Join(
        JoinHouseholdRequest request,
        CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var result = await households.JoinAsync(userId.Value, request.InviteCode, ct);

        return result.Status switch
        {
            JoinHouseholdStatus.Joined =>
                Ok(new JoinHouseholdResponse(result.Household!.Id, result.Household.IsFull)),

            // api-design.md's exact wording.
            JoinHouseholdStatus.HouseholdFull =>
                Conflict(new { error = "This household already has 2 members" }),

            JoinHouseholdStatus.AlreadyInHousehold =>
                Conflict(new { error = "You are already in a household." }),

            JoinHouseholdStatus.InviteCodeNotFound =>
                NotFound(new { error = "No household found with that invite code." }),

            _ => Unauthorized()
        };
    }
}
