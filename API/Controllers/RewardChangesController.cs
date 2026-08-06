using API.Dtos.Rewards;
using API.Errors;
using API.Extensions;
using API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

/// <summary>
/// The approval queue for store changes — task [68].
/// </summary>
/// <remarks>
/// There is no endpoint here for <em>proposing</em> a change. Proposals go through the ordinary
/// <c>POST</c>/<c>PATCH</c>/<c>DELETE /api/rewards</c>, which decide for themselves whether the
/// household needs approval and say so in the response. A parallel "propose" surface would mean the
/// client had to know the household's member count to pick an endpoint — a fact it may hold a stale
/// copy of, and getting it wrong means telling the user "Saved" about a change that has not
/// happened.
/// </remarks>
[ApiController]
[Authorize]
[Route("api/reward-changes")]
public class RewardChangesController(IRewardChangeService changes) : ControllerBase
{
    /// <summary>The partner's proposed store changes waiting on you. Never your own.</summary>
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<RewardChangeResponse>>> Pending(CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();

        var result = await changes.ListPendingAsync(userId.Value, ct);

        return result.Status == RewardChangeStatusCode.Ok
            ? Ok(result.Items)
            : Map(result.Status);
    }

    [HttpPost("{id:int}/approve")]
    public async Task<ActionResult<RewardChangeResponse>> Approve(int id, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();

        var result = await changes.ApproveAsync(userId.Value, id, ct);

        return result.Status == RewardChangeStatusCode.Ok ? Ok(result.Request) : Map(result.Status);
    }

    [HttpPost("{id:int}/reject")]
    public async Task<ActionResult<RewardChangeResponse>> Reject(
        int id,
        [FromBody] RejectRewardChangeRequest body,
        CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();

        var result = await changes.RejectAsync(userId.Value, id, body.Reason, ct);

        return result.Status == RewardChangeStatusCode.Ok ? Ok(result.Request) : Map(result.Status);
    }

    private ActionResult Map(RewardChangeStatusCode status) => status switch
    {
        RewardChangeStatusCode.NoHousehold =>
            this.Failure(StatusCodes.Status409Conflict, "You are not in a household yet."),

        // 404 for both "no such request" and "someone else's request", byte-identically — the rule
        // the rest of the API already follows.
        RewardChangeStatusCode.NotFound =>
            this.Failure(StatusCodes.Status404NotFound, "That change request was not found."),

        // 403, matching self-approval on activity logs. Not 404: the request does exist and is
        // yours, and pretending otherwise would be a worse answer than the true one.
        RewardChangeStatusCode.SelfApproval =>
            this.Failure(
                StatusCodes.Status403Forbidden,
                "Your partner has to agree to your own store changes."),

        RewardChangeStatusCode.NotPending =>
            this.Failure(StatusCodes.Status409Conflict, "That change has already been decided."),

        RewardChangeStatusCode.TargetGone =>
            this.Failure(
                StatusCodes.Status409Conflict,
                "That reward is no longer in the store, so this change cannot be applied."),

        RewardChangeStatusCode.InvalidReason =>
            this.Failure(StatusCodes.Status400BadRequest, "Say why you are turning it down."),

        _ => Unauthorized()
    };
}
