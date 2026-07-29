using API.Entities;
using API.Services.Competitions;

namespace Dwelloot.Tests.Services.Competitions;

public class LootBoxRollerTests
{
    private static readonly int[] Pool = [101, 102, 103];

    [Fact]
    public void A_seeded_roll_is_reproducible()
    {
        // The property that makes every other test here deterministic.
        var first = new LootBoxRoller(new Random(1234)).Roll(CompetitionPeriodType.Daily, Pool);
        var second = new LootBoxRoller(new Random(1234)).Roll(CompetitionPeriodType.Daily, Pool);

        Assert.Equal(first, second);
    }

    [Theory]
    [InlineData(CompetitionPeriodType.Daily)]
    [InlineData(CompetitionPeriodType.Weekly)]
    [InlineData(CompetitionPeriodType.Monthly)]
    public void Coin_rolls_land_inside_that_periods_band(CompetitionPeriodType periodType)
    {
        var (min, max) = LootBoxRoller.CoinBandFor(periodType);
        var roller = new LootBoxRoller(new Random(7));

        // No reward pool, so every roll is coins - the band is what is under test.
        for (var i = 0; i < 500; i++)
        {
            var roll = roller.Roll(periodType, []);

            Assert.False(roll.IsBonusReward);
            Assert.InRange(roll.Coins, min, max);
        }
    }

    [Fact]
    public void Both_ends_of_a_band_are_reachable()
    {
        // Guards an off-by-one on the exclusive upper bound of Random.Next: without the +1 the
        // maximum would never appear.
        var (min, max) = LootBoxRoller.CoinBandFor(CompetitionPeriodType.Daily);
        var roller = new LootBoxRoller(new Random(99));

        var seen = Enumerable.Range(0, 5_000).Select(_ => roller.Roll(CompetitionPeriodType.Daily, []).Coins).ToHashSet();

        Assert.Contains(min, seen);
        Assert.Contains(max, seen);
    }

    [Fact]
    public void The_configured_bonus_chance_is_small()
    {
        // Pinned as an absolute value. project-plan.md promises "a small chance of a bonus reward",
        // and a loot box that mostly pays out rewards would break the Coins economy the store
        // depends on.
        Assert.InRange(LootBoxRoller.BonusRewardChance, 0.01, 0.20);
    }

    [Fact]
    public void Bonus_rewards_are_rare_but_do_happen()
    {
        // Bounds are absolute, NOT derived from BonusRewardChance. Expressing them relative to the
        // constant made this test pass at any weighting - setting the chance to 100% still landed
        // inside "half to double" - which mutation testing caught. Third instance of that trap in
        // this project, after the timezone default in log 023.
        var roller = new LootBoxRoller(new Random(2026));
        const int rolls = 20_000;

        var bonuses = Enumerable.Range(0, rolls)
            .Count(_ => roller.Roll(CompetitionPeriodType.Daily, Pool).IsBonusReward);

        var rate = (double)bonuses / rolls;

        // At p = 0.10 over 20,000 rolls the standard deviation is ~0.002, so these bounds are
        // roughly ten sigma wide - they cannot flake, but they fail immediately on 0%, 50% or 100%.
        Assert.InRange(rate, 0.08, 0.12);
    }

    [Fact]
    public void A_bonus_reward_always_comes_from_the_supplied_pool()
    {
        var roller = new LootBoxRoller(new Random(5));

        for (var i = 0; i < 5_000; i++)
        {
            var roll = roller.Roll(CompetitionPeriodType.Daily, Pool);

            if (roll.IsBonusReward)
            {
                Assert.Contains(roll.BonusRewardId!.Value, Pool);
            }
        }
    }

    [Fact]
    public void An_empty_pool_always_falls_back_to_coins()
    {
        // A household that deleted every reward must still get something.
        var roller = new LootBoxRoller(new Random(11));

        for (var i = 0; i < 2_000; i++)
        {
            var roll = roller.Roll(CompetitionPeriodType.Daily, []);

            Assert.False(roll.IsBonusReward);
            Assert.True(roll.Coins > 0);
        }
    }

    [Fact]
    public void Longer_periods_are_worth_more_than_shorter_ones()
    {
        // The bands must not overlap, or a monthly win could pay less than a Tuesday.
        var daily = LootBoxRoller.CoinBandFor(CompetitionPeriodType.Daily);
        var weekly = LootBoxRoller.CoinBandFor(CompetitionPeriodType.Weekly);
        var monthly = LootBoxRoller.CoinBandFor(CompetitionPeriodType.Monthly);

        Assert.True(daily.Max < weekly.Min, "a weekly win should always beat any daily win");
        Assert.True(weekly.Max < monthly.Min, "a monthly win should always beat any weekly win");
    }
}
