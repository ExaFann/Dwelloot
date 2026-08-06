using API.Data;
using API.Dtos.Rewards;
using API.Entities;
using API.Validation;
using Microsoft.EntityFrameworkCore;

namespace API.Services;

public enum RewardChangeStatusCode
{
    Ok,
    UserNotFound,
    NoHousehold,

    /// <summary>No such request, or it belongs to another household. Indistinguishable by design.</summary>
    NotFound,

    /// <summary>It is your own proposal. Layer two of no-self-approval — task [68].</summary>
    SelfApproval,

    /// <summary>Already approved or rejected. Deciding twice is not idempotent — it would apply twice.</summary>
    NotPending,

    /// <summary>A rejection needs a reason, and it is blank once normalised.</summary>
    InvalidReason,

    /// <summary>
    /// The change cannot be applied any more — the reward it targets has been archived since.
    /// </summary>
    TargetGone
}

public sealed record RewardChangeResult(RewardChangeStatusCode Status, RewardChangeResponse? Request)
{
    public static RewardChangeResult Ok(RewardChangeResponse request) =>
        new(RewardChangeStatusCode.Ok, request);

    public static RewardChangeResult Failed(RewardChangeStatusCode status) => new(status, null);
}

public sealed record RewardChangeListResult(
    RewardChangeStatusCode Status,
    IReadOnlyList<RewardChangeResponse>? Items)
{
    public static RewardChangeListResult Ok(IReadOnlyList<RewardChangeResponse> items) =>
        new(RewardChangeStatusCode.Ok, items);

    public static RewardChangeListResult Failed(RewardChangeStatusCode status) => new(status, null);
}

public interface IRewardChangeService
{
    /// <summary>The partner's proposals waiting on this caller. Never the caller's own.</summary>
    Task<RewardChangeListResult> ListPendingAsync(int userId, CancellationToken ct = default);

    Task<RewardChangeResult> ApproveAsync(int userId, int requestId, CancellationToken ct = default);

    Task<RewardChangeResult> RejectAsync(
        int userId, int requestId, string reason, CancellationToken ct = default);
}

/// <summary>
/// The approval queue for store changes — task [68].
/// </summary>
/// <remarks>
/// Deliberately shaped like <see cref="ActivityLogService"/>'s approval half, because it is the same
/// job: a household-scoped queue that excludes your own rows, a decision that can only be made once,
/// and three layers of no-self-approval (this queue's filter, the 403 below, and
/// <c>ck_reward_change_requests_no_self_approval</c>).
/// </remarks>
public class RewardChangeService(AppDbContext db) : IRewardChangeService
{
    public async Task<RewardChangeListResult> ListPendingAsync(
        int userId,
        CancellationToken ct = default)
    {
        var (status, householdId) = await ResolveHouseholdAsync(userId, ct);
        if (status != RewardChangeStatusCode.Ok)
        {
            return RewardChangeListResult.Failed(status);
        }

        var items = await db.RewardChangeRequests
            .AsNoTracking()
            .Where(r => r.HouseholdId == householdId
                && r.Status == RewardChangeStatus.Pending
                // Layer one: your own proposals are not in the queue you are shown at all.
                && r.RequestedByUserId != userId)
            .OrderByDescending(r => r.RequestedAt)
            .ThenByDescending(r => r.Id)
            .Select(r => new RewardChangeResponse(
                r.Id,
                r.Kind.ToString(),
                r.RewardId,
                // The reward's *current* title, so the partner can see what is being changed and to
                // what. Null for a Create, which has no existing row.
                r.Reward == null ? null : r.Reward.Title,
                r.Reward == null ? null : (int?)r.Reward.CoinCost,
                r.ProposedTitle,
                r.ProposedCoinCost,
                r.RequestedBy.Name,
                r.RequestedAt))
            .ToListAsync(ct);

        return RewardChangeListResult.Ok(items);
    }

    public async Task<RewardChangeResult> ApproveAsync(
        int userId,
        int requestId,
        CancellationToken ct = default)
    {
        var found = await FindDecidableAsync(userId, requestId, ct);
        if (found.Status != RewardChangeStatusCode.Ok)
        {
            return RewardChangeResult.Failed(found.Status);
        }

        var request = found.Request!;

        /*
         * Applying is the only place the store is written on this path, and it happens in the same
         * unit of work as the status change — so a failure leaves neither the reward changed nor the
         * request marked decided.
         */
        switch (request.Kind)
        {
            case RewardChangeKind.Create:
                db.Rewards.Add(new Reward
                {
                    HouseholdId = request.HouseholdId,
                    Title = request.ProposedTitle!,
                    CoinCost = request.ProposedCoinCost!.Value
                });
                break;

            case RewardChangeKind.Update:
            case RewardChangeKind.Delete:
                var reward = await db.Rewards.SingleOrDefaultAsync(
                    r => r.Id == request.RewardId && r.ArchivedAt == null, ct);

                /*
                 * The target can disappear between proposing and deciding: the other partner may
                 * have had a delete approved in the meantime. Refused rather than silently skipped,
                 * because "approved" would otherwise report success for a change that did nothing.
                 */
                if (reward is null)
                {
                    return RewardChangeResult.Failed(RewardChangeStatusCode.TargetGone);
                }

                if (request.Kind == RewardChangeKind.Delete)
                {
                    reward.ArchivedAt = DateTime.UtcNow;
                }
                else
                {
                    // Snapshots, not a re-read. Applying what the partner was shown is the whole
                    // point of copying them at request time.
                    if (request.ProposedTitle is not null) reward.Title = request.ProposedTitle;
                    if (request.ProposedCoinCost is not null) reward.CoinCost = request.ProposedCoinCost.Value;
                }

                break;
        }

        Decide(request, userId, RewardChangeStatus.Approved);
        await db.SaveChangesAsync(ct);

        return RewardChangeResult.Ok(Describe(request));
    }

    public async Task<RewardChangeResult> RejectAsync(
        int userId,
        int requestId,
        string reason,
        CancellationToken ct = default)
    {
        // Normalised and checked before anything is looked up, matching the reject path on
        // activity logs: a blank reason is the caller's mistake, not the request's.
        var cleanReason = TextInput.Normalize(reason);
        if (cleanReason.Length == 0 || cleanReason.Length > RewardChangeRequest.RejectReasonMaxLength)
        {
            return RewardChangeResult.Failed(RewardChangeStatusCode.InvalidReason);
        }

        var found = await FindDecidableAsync(userId, requestId, ct);
        if (found.Status != RewardChangeStatusCode.Ok)
        {
            return RewardChangeResult.Failed(found.Status);
        }

        var request = found.Request!;
        request.RejectReason = cleanReason;
        Decide(request, userId, RewardChangeStatus.Rejected);
        await db.SaveChangesAsync(ct);

        return RewardChangeResult.Ok(Describe(request));
    }

    private static void Decide(RewardChangeRequest request, int userId, RewardChangeStatus status)
    {
        request.Status = status;
        request.DecidedByUserId = userId;
        request.DecidedAt = DateTime.UtcNow;
    }

    private async Task<(RewardChangeStatusCode Status, RewardChangeRequest? Request)>
        FindDecidableAsync(int userId, int requestId, CancellationToken ct)
    {
        var (status, householdId) = await ResolveHouseholdAsync(userId, ct);
        if (status != RewardChangeStatusCode.Ok)
        {
            return (status, null);
        }

        /*
         * `Reward` is included, not only `RequestedBy`.
         *
         * Found by reading a live response: approve returned `currentTitle` populated and reject
         * returned it null, for the same DTO. Approve happens to load the reward in order to apply
         * the change, so EF's relationship fixup filled the navigation; reject never touched it. One
         * endpoint's answer depending on what another endpoint's code path incidentally loaded is
         * the kind of inconsistency a client would work around rather than report.
         */
        var request = await db.RewardChangeRequests
            .Include(r => r.RequestedBy)
            .Include(r => r.Reward)
            .SingleOrDefaultAsync(r => r.Id == requestId && r.HouseholdId == householdId, ct);

        if (request is null)
        {
            // Same 404 for "does not exist" and "not yours", so the endpoint cannot be used to
            // discover which ids exist in other households.
            return (RewardChangeStatusCode.NotFound, null);
        }

        // Layer two. The queue already excludes these, so reaching here means a hand-made request.
        if (request.RequestedByUserId == userId)
        {
            return (RewardChangeStatusCode.SelfApproval, null);
        }

        if (request.Status != RewardChangeStatus.Pending)
        {
            return (RewardChangeStatusCode.NotPending, null);
        }

        return (RewardChangeStatusCode.Ok, request);
    }

    private async Task<(RewardChangeStatusCode Status, int HouseholdId)> ResolveHouseholdAsync(
        int userId,
        CancellationToken ct)
    {
        var user = await db.Users
            .AsNoTracking()
            .SingleOrDefaultAsync(u => u.Id == userId, ct);

        if (user is null) return (RewardChangeStatusCode.UserNotFound, 0);
        if (user.HouseholdId is null) return (RewardChangeStatusCode.NoHousehold, 0);

        return (RewardChangeStatusCode.Ok, user.HouseholdId.Value);
    }

    private static RewardChangeResponse Describe(RewardChangeRequest request) =>
        new(
            request.Id,
            request.Kind.ToString(),
            request.RewardId,
            request.Reward?.Title,
            request.Reward?.CoinCost,
            request.ProposedTitle,
            request.ProposedCoinCost,
            request.RequestedBy?.Name ?? string.Empty,
            request.RequestedAt);
}
