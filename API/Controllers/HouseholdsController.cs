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

    [HttpGet("{id:int}")]
    public async Task<ActionResult<HouseholdDetailsResponse>> Details(int id, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var result = await households.GetAsync(userId.Value, id, ct);
        if (result.Status != HouseholdAccessStatus.Ok)
        {
            return MapAccessFailure(result.Status);
        }

        var household = result.Household!;

        return Ok(new HouseholdDetailsResponse(
            household.Id,
            household.Name,
            household.InviteCode,
            [.. household.Members
                .OrderBy(m => m.Id)
                .Select(m => new HouseholdMemberResponse(m.Id, m.Name))]));
    }

    [HttpPatch("{id:int}")]
    public async Task<ActionResult<RenamedHouseholdResponse>> Rename(
        int id,
        RenameHouseholdRequest request,
        CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var result = await households.RenameAsync(userId.Value, id, request.Name, ct);
        if (result.Status != HouseholdAccessStatus.Ok)
        {
            return MapAccessFailure(result.Status);
        }

        return Ok(new RenamedHouseholdResponse(result.Household!.Id, result.Household.Name));
    }

    [HttpPost("{id:int}/leave")]
    public async Task<ActionResult<LeaveHouseholdResponse>> Leave(int id, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var result = await households.LeaveAsync(userId.Value, id, ct);

        return result.Status == HouseholdAccessStatus.Ok
            ? Ok(new LeaveHouseholdResponse(true))
            : MapAccessFailure(result.Status);
    }

    /// <summary>
    /// Collapses "no such household" and "not your household" into the same 404.
    /// </summary>
    /// <remarks>
    /// Deliberate: a 403 for a household that exists and a 404 for one that does not would let
    /// anyone enumerate household ids by watching which status comes back. Same reasoning as the
    /// single generic login failure in <see cref="AuthController"/>.
    /// </remarks>
    private ActionResult MapAccessFailure(HouseholdAccessStatus status) => status switch
    {
        HouseholdAccessStatus.HouseholdNotFound or HouseholdAccessStatus.NotAMember =>
            NotFound(new { error = "Household not found." }),

        HouseholdAccessStatus.Conflict =>
            Conflict(new { error = "The household changed while processing. Please try again." }),

        _ => Unauthorized()
    };
}
