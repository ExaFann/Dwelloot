using API.Entities;

namespace API.Services.Competitions;

/// <summary>What a loot box turned out to contain.</summary>
public readonly record struct LootRoll(int Coins, int? BonusRewardId)
{
    public bool IsBonusReward => BonusRewardId is not null;

    public static LootRoll OfCoins(int coins) => new(coins, null);

    public static LootRoll OfReward(int rewardId) => new(0, rewardId);
}

public interface ILootBoxRoller
{
    /// <summary>
    /// Rolls one box. <paramref name="rewardPool"/> is the household's eligible rewards; an empty
    /// pool always yields Coins.
    /// </summary>
    LootRoll Roll(CompetitionPeriodType periodType, IReadOnlyList<int> rewardPool);
}

/// <inheritdoc cref="ILootBoxRoller"/>
public class LootBoxRoller(Random random) : ILootBoxRoller
{
    /// <summary>
    /// "A small chance of a bonus reward" from <c>project-plan.md</c>, made concrete.
    /// </summary>
    public const double BonusRewardChance = 0.10;

    /// <summary>
    /// Coins scale with the period, because a monthly win should not be worth the same as a
    /// Tuesday. Calibrated against the store, where rewards cost 15–80: a couple of daily wins
    /// buys something cheap, and a monthly win buys the best item outright.
    /// </summary>
    private static readonly Dictionary<CompetitionPeriodType, (int Min, int Max)> CoinBands = new()
    {
        [CompetitionPeriodType.Daily] = (10, 25),
        [CompetitionPeriodType.Weekly] = (30, 60),
        [CompetitionPeriodType.Monthly] = (80, 150)
    };

    public static (int Min, int Max) CoinBandFor(CompetitionPeriodType periodType) => CoinBands[periodType];

    public LootRoll Roll(CompetitionPeriodType periodType, IReadOnlyList<int> rewardPool)
    {
        if (rewardPool.Count > 0 && random.NextDouble() < BonusRewardChance)
        {
            return LootRoll.OfReward(rewardPool[random.Next(rewardPool.Count)]);
        }

        var (min, max) = CoinBands[periodType];

        // Random.Next's upper bound is exclusive; +1 makes the band inclusive at both ends.
        return LootRoll.OfCoins(random.Next(min, max + 1));
    }
}
