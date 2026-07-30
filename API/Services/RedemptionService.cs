using API.Data;
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
    InsufficientCoins
}

public sealed record RedemptionResult(RedemptionStatus Status, RedemptionResponse? Redemption)
{
    public static RedemptionResult Ok(RedemptionResponse redemption) =>
        new(RedemptionStatus.Ok, redemption);

    public static RedemptionResult Failed(RedemptionStatus status) => new(status, null);
}

public interface IRedemptionService
{
    Task<RedemptionResult> CreateAsync(int userId, int rewardId, CancellationToken ct = default);
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
}
