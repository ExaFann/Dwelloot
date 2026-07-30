using API.Data;
using API.Dtos;
using API.Dtos.Rewards;
using API.Entities;
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

public interface IRewardService
{
    Task<RewardListResult> ListAsync(int userId, RewardQuery query, CancellationToken ct = default);
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

        // No ArchivedAt equivalent to filter: unlike Activity, Reward has no archive column. Task
        // [29] owns whether it needs one - note that reward -> redemptions is Cascade, so a hard
        // delete takes redemption history with it, which the badge counts and the Notices feed read.
        var rewards = db.Rewards.Where(r => r.HouseholdId == user.HouseholdId);

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
