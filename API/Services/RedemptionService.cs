using API.Data;
using API.Dtos;
using API.Dtos.Redemptions;
using API.Entities;
using API.Services.Progression;
using Microsoft.EntityFrameworkCore;

namespace API.Services;

public enum RedemptionStatus
{
    Ok,
    UserNotFound,
    NoHousehold,

    /// <summary>
    /// No such reward, it belongs to another household, or it has been archived — the caller cannot
    /// tell which.
    /// </summary>
    RewardNotFound,

    /// <summary>The balance does not cover the price.</summary>
    InsufficientCoins,

    /// <summary>An unrecognised <c>?scope=</c> on the household feed.</summary>
    InvalidScope
}

public sealed record RedemptionResult(RedemptionStatus Status, RedemptionResponse? Redemption)
{
    public static RedemptionResult Ok(RedemptionResponse redemption) =>
        new(RedemptionStatus.Ok, redemption);

    public static RedemptionResult Failed(RedemptionStatus status) => new(status, null);
}

public sealed record MyRedemptionResult(
    RedemptionStatus Status,
    PagedResponse<MyRedemptionResponse>? Page)
{
    public static MyRedemptionResult Ok(PagedResponse<MyRedemptionResponse> page) =>
        new(RedemptionStatus.Ok, page);

    public static MyRedemptionResult Failed(RedemptionStatus status) => new(status, null);
}

public sealed record HouseholdRedemptionResult(
    RedemptionStatus Status,
    PagedResponse<HouseholdRedemptionResponse>? Page)
{
    public static HouseholdRedemptionResult Ok(PagedResponse<HouseholdRedemptionResponse> page) =>
        new(RedemptionStatus.Ok, page);

    public static HouseholdRedemptionResult Failed(RedemptionStatus status) => new(status, null);
}

public interface IRedemptionService
{
    Task<RedemptionResult> CreateAsync(int userId, int rewardId, CancellationToken ct = default);

    Task<MyRedemptionResult> ListMineAsync(int userId, MyRedemptionQuery query, CancellationToken ct = default);

    Task<HouseholdRedemptionResult> ListForHouseholdAsync(
        int userId,
        HouseholdRedemptionQuery query,
        CancellationToken ct = default);
}

/// <summary>
/// Spending Coins in the store. The only place Coins leave a balance.
/// </summary>
public class RedemptionService(AppDbContext db, IProgressionService progression) : IRedemptionService
{
    public async Task<RedemptionResult> CreateAsync(
        int userId,
        int rewardId,
        CancellationToken ct = default)
    {
        var user = await db.Users.SingleOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null)
        {
            return RedemptionResult.Failed(RedemptionStatus.UserNotFound);
        }

        if (user.HouseholdId is null)
        {
            return RedemptionResult.Failed(RedemptionStatus.NoHousehold);
        }

        // Archived rewards are excluded alongside the household check: a reward removed from the store
        // cannot be bought (task [29]). Collapsing "no such reward", "another household's reward" and
        // "archived" into one status is what stops the endpoint being used to discover which ids exist.
        var reward = await db.Rewards.SingleOrDefaultAsync(
            r => r.Id == rewardId && r.HouseholdId == user.HouseholdId && r.ArchivedAt == null,
            ct);

        if (reward is null)
        {
            return RedemptionResult.Failed(RedemptionStatus.RewardNotFound);
        }

        // Application-level, not a check constraint: this compares users.coins against
        // rewards.coin_cost, and a portable row-level CHECK cannot see another table (SS 3.14). The
        // single-row half of the rule - a balance is never negative - does live in the database, as
        // ck_users_coins_not_negative.
        //
        // Inclusive: a balance of exactly the price buys the reward.
        if (user.Coins < reward.CoinCost)
        {
            return RedemptionResult.Failed(RedemptionStatus.InsufficientCoins);
        }

        var redemption = new Redemption
        {
            UserId = user.Id,
            RewardId = reward.Id,

            // Snapshot, not a live read. Task [29] made prices editable, so without this every past
            // purchase would re-price itself whenever the reward changed - see Redemption.CoinsSpent.
            CoinsSpent = reward.CoinCost,

            RedeemedAt = DateTime.UtcNow
        };

        db.Redemptions.Add(redemption);

        // Known race, deliberately not fixed here: two simultaneous redemptions both pass the check
        // above and both write the same absolute balance, so one reward is effectively free. Log 030
        // records why a concurrency token on Coins, an atomic ExecuteUpdateAsync decrement, and a
        // serializable transaction were each rejected - the short version is that the first breaks
        // unrelated writes to users and the other two cannot be tested on the in-memory provider.
        user.Coins -= reward.CoinCost;

        await db.SaveChangesAsync(ct);

        // Obligation recorded in log 026: First redemption and Big spender count redemption rows, so
        // without this the badge whose whole point is to fire on your first purchase would wait for the
        // next settlement.
        await progression.EvaluateBadgesAsync(user.Id, ct);

        return RedemptionResult.Ok(new RedemptionResponse(
            redemption.Id,
            redemption.RewardId,
            redemption.CoinsSpent,
            user.Coins,
            redemption.RedeemedAt));
    }

    /// <summary>
    /// The caller's own purchase history, newest first.
    /// </summary>
    /// <remarks>
    /// Redemptions of <b>archived</b> rewards are included. Archiving removes a reward from the store,
    /// not from what already happened — the same rule task [22a] applied to logs of archived chores.
    /// Task [29] archives rather than deletes precisely so these rows survive, so filtering them here
    /// would undo that at the read layer. The reward row surviving is also what lets the title resolve.
    /// </remarks>
    public async Task<MyRedemptionResult> ListMineAsync(
        int userId,
        MyRedemptionQuery query,
        CancellationToken ct = default)
    {
        var user = await db.Users.SingleOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null)
        {
            return MyRedemptionResult.Failed(RedemptionStatus.UserNotFound);
        }

        // Not an empty page: an empty history is a legitimate state for someone who has never spent
        // anything, so conflating it with "you are not paired yet" would hide a routing bug.
        if (user.HouseholdId is null)
        {
            return MyRedemptionResult.Failed(RedemptionStatus.NoHousehold);
        }

        // Scoped through reward.household_id, never through the redeemer's user.household_id: the
        // latter is nullable and cleared on leaving, so joining that way silently returns wrong data
        // (SS 3.15). The household clause itself matches the sibling /activity-logs/mine, so leaving a
        // household does not bleed its history into the next one.
        var redemptions = db.Redemptions
            .Where(r => r.UserId == userId && r.Reward.HouseholdId == user.HouseholdId);

        var total = await redemptions.CountAsync(ct);

        var pageSize = Math.Clamp(
            query.EffectivePageSize ?? ActivityService.DefaultPageSize,
            1,
            ActivityService.MaxPageSize);
        var page = Math.Max(query.Page ?? 1, 1);

        // Newest first, with Id as the tiebreaker. Two purchases can share a timestamp closely enough
        // to tie, and PostgreSQL guarantees no order without one - rows would repeat or vanish across
        // page boundaries (log 016). The (user_id, redeemed_at) index from task [8] serves this.
        var items = await redemptions
            .OrderByDescending(r => r.RedeemedAt)
            .ThenByDescending(r => r.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(r => new MyRedemptionResponse(
                r.Id,
                r.RewardId,
                r.Reward.Title,
                r.CoinsSpent,
                r.RedeemedAt))
            .ToListAsync(ct);

        return MyRedemptionResult.Ok(new PagedResponse<MyRedemptionResponse>(items, total));
    }

    /// <summary>
    /// The household's redemptions, optionally excluding the caller's own — the Notices tab's
    /// partner-achievements feed.
    /// </summary>
    /// <remarks>
    /// Membership is reached through <c>reward.household_id</c>, <b>never</b> through the redeemer's
    /// <c>user.household_id</c> (§3.15, log <c>007</c>). That is not hygiene here, it is the behaviour:
    /// a user's household id is nullable and cleared on leaving, so joining that way would erase a
    /// departed partner's entire history from the feed the moment they left. Rewards are permanently
    /// household-owned, so the feed stays stable regardless of who is currently a member.
    /// </remarks>
    public async Task<HouseholdRedemptionResult> ListForHouseholdAsync(
        int userId,
        HouseholdRedemptionQuery query,
        CancellationToken ct = default)
    {
        var user = await db.Users.SingleOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null)
        {
            return HouseholdRedemptionResult.Failed(RedemptionStatus.UserNotFound);
        }

        if (user.HouseholdId is null)
        {
            return HouseholdRedemptionResult.Failed(RedemptionStatus.NoHousehold);
        }

        // Optional, but not ignorable. A silent fallback on an unrecognised scope would hand a client
        // that mistyped it *more* data than it asked for, so this rejects rather than guesses.
        if (query.Scope is not null
            && !RedemptionScopes.All.Contains(query.Scope.Trim(), StringComparer.OrdinalIgnoreCase))
        {
            return HouseholdRedemptionResult.Failed(RedemptionStatus.InvalidScope);
        }

        var redemptions = db.Redemptions.Where(r => r.Reward.HouseholdId == user.HouseholdId);

        if (query.ExcludeMine)
        {
            redemptions = redemptions.Where(r => r.UserId != userId);
        }

        var total = await redemptions.CountAsync(ct);

        var pageSize = Math.Clamp(
            query.EffectivePageSize ?? ActivityService.DefaultPageSize,
            1,
            ActivityService.MaxPageSize);
        var page = Math.Max(query.Page ?? 1, 1);

        var items = await redemptions
            .OrderByDescending(r => r.RedeemedAt)
            .ThenByDescending(r => r.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(r => new HouseholdRedemptionResponse(
                r.Id,
                r.UserId,
                r.RewardId,
                r.Reward.Title,
                r.CoinsSpent,
                r.RedeemedAt))
            .ToListAsync(ct);

        return HouseholdRedemptionResult.Ok(new PagedResponse<HouseholdRedemptionResponse>(items, total));
    }
}
