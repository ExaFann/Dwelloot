using API.Data;
using API.Dtos;
using API.Dtos.Rewards;
using API.Entities;
using API.Validation;
using Microsoft.EntityFrameworkCore;

namespace API.Services;

public enum RewardQueryStatus
{
    Ok,
    UserNotFound,
    NoHousehold,
    InvalidSort
}

public sealed record RewardListResult(
    RewardQueryStatus Status,
    PagedResponse<RewardResponse>? Page)
{
    public static RewardListResult Ok(PagedResponse<RewardResponse> page) =>
        new(RewardQueryStatus.Ok, page);

    public static RewardListResult Failed(RewardQueryStatus status) => new(status, null);
}

public enum RewardMutationStatus
{
    Ok,
    UserNotFound,
    NoHousehold,

    /// <summary>
    /// No such reward, it belongs to another household, or it has been archived — the caller cannot
    /// tell which.
    /// </summary>
    NotFound,

    InvalidCoinCost,

    /// <summary>The title is blank once normalised - see the note on the activity equivalent.</summary>
    InvalidTitle,

    /// <summary>
    /// The reward voids a day's duel, and those are not deletable — task [69].
    /// </summary>
    /// <remarks>
    /// A household that archived it would have no way back: the flag is no longer settable through
    /// <see cref="Dtos.Rewards.CreateRewardRequest"/>, so nothing could recreate one. Its price stays
    /// editable, which is what keeps the abuse gate task [29] relied on.
    /// </remarks>
    CannotDeletePausingReward,

    /// <summary>
    /// Another change to this reward is already waiting on the partner — task [68].
    /// </summary>
    /// <remarks>
    /// Refused rather than queued behind it, because two pending changes to one reward make
    /// "approve" mean "approve which one", and the queue has no way to ask.
    /// </remarks>
    ChangeAlreadyPending
}

/// <summary>Whether a mutation took effect, or is waiting on the other partner — task [68].</summary>
/// <remarks>
/// The caller cannot work this out for itself. It would have to know the household's member count,
/// which it may hold a stale copy of, and getting it wrong means telling the user "Saved" about a
/// change that has not happened.
/// </remarks>
public enum RewardMutationOutcome
{
    Applied,
    AwaitingApproval
}

public sealed record RewardMutationResult(
    RewardMutationStatus Status,
    RewardResponse? Reward,
    RewardMutationOutcome Outcome = RewardMutationOutcome.Applied,
    int? ChangeRequestId = null)
{
    /// <summary>A change that was queued rather than applied. The store is unchanged.</summary>
    public static RewardMutationResult Queued(int changeRequestId) =>
        new(RewardMutationStatus.Ok, null, RewardMutationOutcome.AwaitingApproval, changeRequestId);

    public static RewardMutationResult Ok(RewardResponse reward) =>
        new(RewardMutationStatus.Ok, reward);

    public static RewardMutationResult Failed(RewardMutationStatus status) => new(status, null);
}

public interface IRewardService
{
    Task<RewardListResult> ListAsync(int userId, RewardQuery query, CancellationToken ct = default);

    Task<RewardMutationResult> CreateAsync(int userId, CreateRewardRequest request, CancellationToken ct = default);

    Task<RewardMutationResult> UpdateAsync(int userId, int rewardId, PatchRewardRequest request, CancellationToken ct = default);

    Task<RewardMutationResult> DeleteAsync(int userId, int rewardId, CancellationToken ct = default);
}

/// <summary>
/// The store catalog. Sibling of <see cref="ActivityService"/>'s list, and deliberately the same
/// shape — scoping, a fixed sort switch with an id tiebreaker, parameterised search, a capped page.
/// </summary>
public class RewardService(AppDbContext db) : IRewardService
{
    public async Task<RewardListResult> ListAsync(
        int userId,
        RewardQuery query,
        CancellationToken ct = default)
    {
        var user = await db.Users.SingleOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null)
        {
            return RewardListResult.Failed(RewardQueryStatus.UserNotFound);
        }

        // Not an empty page, for the same reason as the activities list: an empty store is a
        // legitimate state after deleting every reward, so returning one here would hide a routing
        // bug behind real-looking data.
        if (user.HouseholdId is null)
        {
            return RewardListResult.Failed(RewardQueryStatus.NoHousehold);
        }

        // Archived rewards are excluded: they still exist so their redemptions keep resolving and
        // keep voiding the days they voided, but they are no longer offered in the store. Task [29].
        var rewards = db.Rewards
            .Where(r => r.HouseholdId == user.HouseholdId && r.ArchivedAt == null);

        // The store's filter axis (task [28]). Both directions are honoured: false is the "what am
        // I saving for" complement, not a synonym for "no filter". <= rather than <, because a
        // reward priced at exactly the balance is one the caller can complete the purchase of.
        if (query.Affordable == true)
        {
            rewards = rewards.Where(r => r.CoinCost <= user.Coins);
        }
        else if (query.Affordable == false)
        {
            rewards = rewards.Where(r => r.CoinCost > user.Coins);
        }

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            // ToLower().Contains rather than EF.Functions.ILike, which does not translate on the
            // in-memory provider the tests use. Contains also parameterises the term, so searching
            // for "%" finds a literal percent sign instead of matching every row.
            var term = query.Search.Trim().ToLower();
            rewards = rewards.Where(r => r.Title.ToLower().Contains(term));
        }

        var total = await rewards.CountAsync(ct);

        var sorted = ApplySort(rewards, query.Sort, query.Descending);
        if (sorted is null)
        {
            return RewardListResult.Failed(RewardQueryStatus.InvalidSort);
        }

        // Clamped rather than rejected: a client asking for page 0 wants the first page.
        var pageSize = Math.Clamp(query.PageSize ?? ActivityService.DefaultPageSize, 1, ActivityService.MaxPageSize);
        var page = Math.Max(query.Page ?? 1, 1);

        var items = await sorted
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(r => new RewardResponse(r.Id, r.Title, r.CoinCost, r.PausesCompetition))
            .ToListAsync(ct);

        return RewardListResult.Ok(new PagedResponse<RewardResponse>(items, total));
    }

    public async Task<RewardMutationResult> CreateAsync(
        int userId,
        CreateRewardRequest request,
        CancellationToken ct = default)
    {
        var household = await ResolveHouseholdAsync(userId, ct);
        if (household.Status != RewardMutationStatus.Ok)
        {
            return RewardMutationResult.Failed(household.Status);
        }

        if (request.CoinCost <= 0)
        {
            return RewardMutationResult.Failed(RewardMutationStatus.InvalidCoinCost);
        }

        var title = TextInput.Normalize(request.Title);
        if (title.Length == 0)
        {
            return RewardMutationResult.Failed(RewardMutationStatus.InvalidTitle);
        }

        // Task [68]. Validation runs first on purpose: a proposal the server would reject anyway
        // must not reach the partner's queue, or approving it would fail at the far end where
        // nobody can fix it.
        if (await NeedsApprovalAsync(household.HouseholdId, ct))
        {
            return await QueueAsync(
                household.HouseholdId, userId, RewardChangeKind.Create,
                rewardId: null, title, request.CoinCost, ct);
        }

        var reward = new Reward
        {
            HouseholdId = household.HouseholdId,
            Title = title,
            CoinCost = request.CoinCost,
        };

        db.Rewards.Add(reward);
        await db.SaveChangesAsync(ct);

        return RewardMutationResult.Ok(Describe(reward));
    }

    public async Task<RewardMutationResult> UpdateAsync(
        int userId,
        int rewardId,
        PatchRewardRequest request,
        CancellationToken ct = default)
    {
        var found = await FindOwnedAsync(userId, rewardId, ct);
        if (found.Status != RewardMutationStatus.Ok)
        {
            return RewardMutationResult.Failed(found.Status);
        }

        if (request.CoinCost is <= 0)
        {
            return RewardMutationResult.Failed(RewardMutationStatus.InvalidCoinCost);
        }

        // Present-but-blank is refused rather than written - see the activity equivalent (task [32]).
        if (request.Title is not null && TextInput.Normalize(request.Title).Length == 0)
        {
            return RewardMutationResult.Failed(RewardMutationStatus.InvalidTitle);
        }

        var reward = found.Reward!;

        // Task [68]. The proposed values are snapshotted here rather than re-read at approval
        // time, so approving applies exactly what the partner was shown. Normalised first, for the
        // same reason the create path validates first.
        var proposedTitle = request.Title is null ? null : TextInput.Normalize(request.Title);
        if (await NeedsApprovalAsync(reward.HouseholdId, ct))
        {
            return await QueueAsync(
                reward.HouseholdId, userId, RewardChangeKind.Update,
                reward.Id, proposedTitle, request.CoinCost, ct);
        }

        // Null means "leave alone" - the whole point of PATCH. Writing every field unconditionally
        // would blank out anything the client did not send.
        if (proposedTitle is not null)
        {
            reward.Title = proposedTitle;
        }

        if (request.CoinCost is not null)
        {
            reward.CoinCost = request.CoinCost.Value;
        }

        await db.SaveChangesAsync(ct);

        return RewardMutationResult.Ok(Describe(reward));
    }

    /// <summary>
    /// Removes a reward from the store by archiving it. The row survives, so its redemptions — and
    /// everything that reads them — are untouched.
    /// </summary>
    /// <remarks>
    /// A hard delete would cascade to every <see cref="Redemption"/> of this reward. Beyond losing the
    /// history, settlement reads redemptions to decide whether a
    /// <see cref="Reward.PausesCompetition"/> purchase voided a day, so deleting the reward could
    /// retroactively un-void a day and change who won it — and either partner may remove any of the
    /// household's rewards. Same reasoning as <see cref="IActivityService.DeleteAsync"/>.
    /// </remarks>
    public async Task<RewardMutationResult> DeleteAsync(
        int userId,
        int rewardId,
        CancellationToken ct = default)
    {
        var found = await FindOwnedAsync(userId, rewardId, ct);
        if (found.Status != RewardMutationStatus.Ok)
        {
            return RewardMutationResult.Failed(found.Status);
        }

        var reward = found.Reward!;

        // Task [69]. Archiving this one is a one-way door: `CreateRewardRequest` no longer carries
        // the flag, so nothing in the API could make another. Refused rather than warned about,
        // because the loss is silent and total.
        if (reward.PausesCompetition)
        {
            return RewardMutationResult.Failed(RewardMutationStatus.CannotDeletePausingReward);
        }

        // Task [68].
        if (await NeedsApprovalAsync(reward.HouseholdId, ct))
        {
            return await QueueAsync(
                reward.HouseholdId, userId, RewardChangeKind.Delete,
                reward.Id, proposedTitle: null, proposedCoinCost: null, ct);
        }

        reward.ArchivedAt = DateTime.UtcNow;

        await db.SaveChangesAsync(ct);

        return RewardMutationResult.Ok(Describe(reward));
    }

    /// <summary>
    /// Whether a store change has to be agreed by the other partner before it takes effect.
    /// </summary>
    /// <remarks>
    /// Task [68]. A household of one applies changes immediately — there is nobody to ask, and
    /// freezing the store before pairing would make the app unusable for its first user. From two
    /// members, <em>every</em> change needs approval: the owner declined an exemption for "add",
    /// because a rule that covers some changes and not others is one nobody can predict.
    /// <para>
    /// Counts real members rather than reading <c>households.is_full</c>, the same reasoning as
    /// <see cref="HouseholdService"/>'s join guard: that flag is denormalised, and a drift in it
    /// should stay cosmetic rather than quietly switching the whole gate off.
    /// </para>
    /// </remarks>
    private async Task<bool> NeedsApprovalAsync(int householdId, CancellationToken ct) =>
        await db.Users.CountAsync(u => u.HouseholdId == householdId, ct) > 1;

    /// <summary>Records a proposal and leaves the store untouched.</summary>
    private async Task<RewardMutationResult> QueueAsync(
        int householdId,
        int userId,
        RewardChangeKind kind,
        int? rewardId,
        string? proposedTitle,
        int? proposedCoinCost,
        CancellationToken ct)
    {
        /*
         * Two layers, the same shape as every other rule in this project.
         *
         * This guard answers the ordinary case cleanly. The filtered unique index behind it is what
         * closes the race two quick taps can win — and it is the only one of the pair that a real
         * PostgreSQL database enforces, because the in-memory provider ignores unique indexes
         * entirely (see `TestDbContextFactory`). Relying on the index alone would have meant this
         * rule was untestable anywhere but end-to-end; relying on the guard alone would have left
         * the race open.
         */
        if (rewardId is not null && await db.RewardChangeRequests.AnyAsync(
                r => r.RewardId == rewardId && r.Status == RewardChangeStatus.Pending, ct))
        {
            return RewardMutationResult.Failed(RewardMutationStatus.ChangeAlreadyPending);
        }

        var request = new RewardChangeRequest
        {
            HouseholdId = householdId,
            RequestedByUserId = userId,
            Kind = kind,
            RewardId = rewardId,
            ProposedTitle = proposedTitle,
            ProposedCoinCost = proposedCoinCost,
            RequestedAt = DateTime.UtcNow
        };

        db.RewardChangeRequests.Add(request);

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            /*
             * `ux_reward_change_requests_one_open_per_reward`. Caught rather than pre-checked: a
             * check-then-insert loses to two taps, and the result would be two pending changes to
             * one reward — at which point "approve" has to answer "approve which one".
             *
             * The insert is the only write in this unit of work, so nothing else is rolled back
             * with it, and the caller gets a clean 409.
             */
            db.Entry(request).State = EntityState.Detached;
            return RewardMutationResult.Failed(RewardMutationStatus.ChangeAlreadyPending);
        }

        return RewardMutationResult.Queued(request.Id);
    }

    private static RewardResponse Describe(Reward reward) =>
        new(reward.Id, reward.Title, reward.CoinCost, reward.PausesCompetition);

    private async Task<(RewardMutationStatus Status, int HouseholdId)> ResolveHouseholdAsync(
        int userId,
        CancellationToken ct)
    {
        var user = await db.Users.SingleOrDefaultAsync(u => u.Id == userId, ct);

        if (user is null)
        {
            return (RewardMutationStatus.UserNotFound, 0);
        }

        return user.HouseholdId is null
            ? (RewardMutationStatus.NoHousehold, 0)
            : (RewardMutationStatus.Ok, user.HouseholdId.Value);
    }

    /// <summary>
    /// Loads a reward only if it belongs to the caller's household.
    /// </summary>
    /// <remarks>
    /// Returns <see cref="RewardMutationStatus.NotFound"/> for both "no such reward" and "someone
    /// else's reward", so the endpoint cannot be used to discover which ids exist. Archived rewards
    /// are also not found: they are no longer part of the store, so they cannot be edited or archived
    /// again.
    /// </remarks>
    private async Task<(RewardMutationStatus Status, Reward? Reward)> FindOwnedAsync(
        int userId,
        int rewardId,
        CancellationToken ct)
    {
        var household = await ResolveHouseholdAsync(userId, ct);
        if (household.Status != RewardMutationStatus.Ok)
        {
            return (household.Status, null);
        }

        var reward = await db.Rewards.SingleOrDefaultAsync(
            r => r.Id == rewardId && r.HouseholdId == household.HouseholdId && r.ArchivedAt == null,
            ct);

        return reward is null
            ? (RewardMutationStatus.NotFound, null)
            : (RewardMutationStatus.Ok, reward);
    }

    /// <summary>
    /// Maps the requested sort onto a fixed set of orderings. Returns null for an unknown field.
    /// </summary>
    /// <remarks>
    /// A switch rather than anything built from the caller's string, so there is no path from user
    /// input into the query — the same reasoning as <see cref="ActivityService"/>, and worth having
    /// twice rather than sharing a generic helper that would need an expression built at runtime.
    /// Every branch ends with a tiebreaker on <c>Id</c>: coin cost alone is not a total order once a
    /// household adds its own rewards, and a non-deterministic order makes rows repeat or vanish
    /// while paging.
    /// </remarks>
    private static IQueryable<Reward>? ApplySort(IQueryable<Reward> rewards, string? sort, bool descending)
    {
        var field = string.IsNullOrWhiteSpace(sort) ? RewardSortFields.Title : sort.Trim().ToLowerInvariant();

        return field switch
        {
            RewardSortFields.Title => descending
                ? rewards.OrderByDescending(r => r.Title).ThenBy(r => r.Id)
                : rewards.OrderBy(r => r.Title).ThenBy(r => r.Id),

            RewardSortFields.CoinCost => descending
                ? rewards.OrderByDescending(r => r.CoinCost).ThenBy(r => r.Id)
                : rewards.OrderBy(r => r.CoinCost).ThenBy(r => r.Id),

            _ => null
        };
    }
}

public static class RewardSortFields
{
    // Match keys, compared against the caller's input after it is lowercased.
    public const string Title = "title";
    public const string CoinCost = "coincost";

    /// <summary>
    /// The spellings shown in the 400 message, in the casing <c>api-design.md</c> documents
    /// (<c>?sort=coinCost</c>).
    /// </summary>
    /// <remarks>
    /// Held separately from the match keys above because the switch compares lowercased input, and
    /// echoing "coincost" at a client that read the docs would be needlessly confusing. A test
    /// asserts every value here is accepted once lowercased, so the two cannot drift.
    /// </remarks>
    public static readonly IReadOnlyList<string> All = ["title", "coinCost"];
}
