using API.Data;
using API.Dtos.Rewards;
using API.Entities;
using API.Services;
using API.Services.Competitions;
using API.Services.Progression;
using Microsoft.EntityFrameworkCore;

namespace Dwelloot.Tests.Services;

public class RedemptionServiceTests
{
    private const string TimeZoneId = "Pacific/Auckland";

    private static async Task<User> AddUserAsync(AppDbContext db, string email)
    {
        var user = new User { Name = email.Split('@')[0], Email = email, UserName = email };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        return user;
    }

    /// <summary>
    /// A paired household with a stocked store. A decoy household is created first, so no subject is
    /// id 1 — logs <c>017</c>/<c>018</c> found two bugs a hard-coded 1 had made invisible.
    /// </summary>
    private static async Task<(User Alex, User Sam, Household Household)> PairedHouseholdAsync(
        AppDbContext db,
        string prefix = "")
    {
        var households = new HouseholdService(db, new DefaultCatalogCopier(db), new InviteCodeGenerator());

        if (prefix.Length == 0)
        {
            var decoy = await AddUserAsync(db, "decoy@example.com");
            await households.CreateAsync(decoy.Id, "Decoy place");
        }

        var alex = await AddUserAsync(db, $"{prefix}alex@example.com");
        var sam = await AddUserAsync(db, $"{prefix}sam@example.com");
        var created = await households.CreateAsync(alex.Id, "Our place");
        await households.JoinAsync(sam.Id, created.Household!.InviteCode);

        Assert.NotEqual(1, alex.Id);
        Assert.NotEqual(1, sam.Id);

        return (alex, sam, created.Household);
    }

    private static RedemptionService ServiceFor(AppDbContext db) =>
        new(db, new ProgressionService(db));

    private static async Task<Reward> RewardCosting(AppDbContext db, int householdId, int coinCost)
    {
        var reward = new Reward
        {
            HouseholdId = householdId,
            Title = $"Reward costing {coinCost}",
            CoinCost = coinCost
        };

        db.Rewards.Add(reward);
        await db.SaveChangesAsync();
        return reward;
    }

    private static async Task SetBalanceAsync(AppDbContext db, User user, int coins)
    {
        user.Coins = coins;
        await db.SaveChangesAsync();
    }

    private static Task<Reward> DayOffAsync(AppDbContext db, int householdId) =>
        db.Rewards.FirstAsync(r => r.HouseholdId == householdId && r.PausesCompetition);

    // ------------------------------------------------------------------ happy path

    [Fact]
    public async Task A_successful_redemption_is_persisted()
    {
        var databaseName = TestDbContextFactory.NewDatabaseName();
        int redemptionId;
        int rewardId;
        int userId;

        using (var db = TestDbContextFactory.Create(databaseName))
        {
            var (_, sam, household) = await PairedHouseholdAsync(db);
            var reward = await RewardCosting(db, household.Id, 30);
            await SetBalanceAsync(db, sam, 50);
            rewardId = reward.Id;
            userId = sam.Id;

            var result = await ServiceFor(db).CreateAsync(sam.Id, reward.Id);

            Assert.Equal(RedemptionStatus.Ok, result.Status);
            Assert.Equal(30, result.Redemption!.CoinsSpent);
            Assert.Equal(20, result.Redemption.CoinsRemaining);
            redemptionId = result.Redemption.Id;
        }

        using var verify = TestDbContextFactory.Create(databaseName);
        var saved = await verify.Redemptions.SingleAsync(r => r.Id == redemptionId);
        Assert.Equal(rewardId, saved.RewardId);
        Assert.Equal(userId, saved.UserId);
        Assert.Equal(30, saved.CoinsSpent);
        Assert.NotEqual(default, saved.RedeemedAt);
        Assert.Equal(20, (await verify.Users.SingleAsync(u => u.Id == userId)).Coins);
    }

    [Fact]
    public async Task The_balance_falls_by_exactly_the_cost()
    {
        // Absolute literals: 50 - 30 = 20, written out rather than as "before - cost", which would hold
        // for any arithmetic the service happened to do.
        using var db = TestDbContextFactory.Create();
        var (_, sam, household) = await PairedHouseholdAsync(db);
        var reward = await RewardCosting(db, household.Id, 30);
        await SetBalanceAsync(db, sam, 50);

        await ServiceFor(db).CreateAsync(sam.Id, reward.Id);

        Assert.Equal(20, (await db.Users.SingleAsync(u => u.Id == sam.Id)).Coins);
    }

    // ------------------------------------------------------------------ balance boundary

    [Fact]
    public async Task A_balance_equal_to_the_cost_is_enough_and_leaves_zero()
    {
        // The inclusive boundary, on its own so a > / >= slip cannot hide inside a larger assertion.
        using var db = TestDbContextFactory.Create();
        var (_, sam, household) = await PairedHouseholdAsync(db);
        var reward = await RewardCosting(db, household.Id, 30);
        await SetBalanceAsync(db, sam, 30);

        var result = await ServiceFor(db).CreateAsync(sam.Id, reward.Id);

        Assert.Equal(RedemptionStatus.Ok, result.Status);
        Assert.Equal(0, result.Redemption!.CoinsRemaining);
        Assert.Equal(0, (await db.Users.SingleAsync(u => u.Id == sam.Id)).Coins);
    }

    [Fact]
    public async Task A_balance_one_coin_short_is_refused()
    {
        using var db = TestDbContextFactory.Create();
        var (_, sam, household) = await PairedHouseholdAsync(db);
        var reward = await RewardCosting(db, household.Id, 30);
        await SetBalanceAsync(db, sam, 29);

        var result = await ServiceFor(db).CreateAsync(sam.Id, reward.Id);

        Assert.Equal(RedemptionStatus.InsufficientCoins, result.Status);
    }

    [Fact]
    public async Task An_unaffordable_redemption_changes_nothing()
    {
        // Assert the absence, not just the error: no row written and the balance untouched.
        using var db = TestDbContextFactory.Create();
        var (_, sam, household) = await PairedHouseholdAsync(db);
        var reward = await RewardCosting(db, household.Id, 80);
        await SetBalanceAsync(db, sam, 10);

        var result = await ServiceFor(db).CreateAsync(sam.Id, reward.Id);

        Assert.Equal(RedemptionStatus.InsufficientCoins, result.Status);
        Assert.Null(result.Redemption);
        Assert.Empty(await db.Redemptions.ToListAsync());
        Assert.Equal(10, (await db.Users.SingleAsync(u => u.Id == sam.Id)).Coins);
    }

    [Fact]
    public async Task A_zero_balance_cannot_buy_the_cheapest_reward()
    {
        using var db = TestDbContextFactory.Create();
        var (_, sam, household) = await PairedHouseholdAsync(db);
        var cheapest = await db.Rewards
            .Where(r => r.HouseholdId == household.Id)
            .OrderBy(r => r.CoinCost)
            .FirstAsync();

        Assert.Equal(0, sam.Coins);

        var result = await ServiceFor(db).CreateAsync(sam.Id, cheapest.Id);

        Assert.Equal(RedemptionStatus.InsufficientCoins, result.Status);
    }

    // ------------------------------------------------------------------ scoping

    [Fact]
    public async Task An_archived_reward_cannot_be_redeemed()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var reward = await RewardCosting(db, household.Id, 30);
        await SetBalanceAsync(db, sam, 100);

        /*
         * Archived directly, not through `RewardService.DeleteAsync`.
         *
         * Task [68] routes store changes in a **paired** household through the partner's approval
         * queue, so calling the service here would queue a request and leave the reward untouched —
         * the setup would silently stop setting anything up. The subject of this test is what
         * happens to an *already archived* reward, which is downstream of that gate; going through
         * the queue would be testing [68] instead.
         */
        reward.ArchivedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        var result = await ServiceFor(db).CreateAsync(sam.Id, reward.Id);

        Assert.Equal(RedemptionStatus.RewardNotFound, result.Status);
        Assert.Empty(await db.Redemptions.ToListAsync());
        Assert.Equal(100, (await db.Users.SingleAsync(u => u.Id == sam.Id)).Coins);
    }

    [Fact]
    public async Task Another_households_reward_cannot_be_redeemed_but_its_owner_still_can()
    {
        // Both directions: the refusal is scoping, not a blanket "nobody may buy this".
        using var db = TestDbContextFactory.Create();
        var (_, sam, _) = await PairedHouseholdAsync(db);
        var (_, theirSam, theirHousehold) = await PairedHouseholdAsync(db, "other-");

        var theirReward = await RewardCosting(db, theirHousehold.Id, 30);
        await SetBalanceAsync(db, sam, 100);
        await SetBalanceAsync(db, theirSam, 100);

        var trespass = await ServiceFor(db).CreateAsync(sam.Id, theirReward.Id);
        Assert.Equal(RedemptionStatus.RewardNotFound, trespass.Status);

        var allowed = await ServiceFor(db).CreateAsync(theirSam.Id, theirReward.Id);
        Assert.Equal(RedemptionStatus.Ok, allowed.Status);
    }

    [Fact]
    public async Task A_nonexistent_reward_is_not_found()
    {
        using var db = TestDbContextFactory.Create();
        var (_, sam, _) = await PairedHouseholdAsync(db);
        await SetBalanceAsync(db, sam, 100);

        var result = await ServiceFor(db).CreateAsync(sam.Id, rewardId: 999_999);

        Assert.Equal(RedemptionStatus.RewardNotFound, result.Status);
    }

    [Fact]
    public async Task A_caller_with_no_household_is_refused()
    {
        using var db = TestDbContextFactory.Create();
        var (_, _, household) = await PairedHouseholdAsync(db);
        var reward = await RewardCosting(db, household.Id, 10);
        var loner = await AddUserAsync(db, "loner@example.com");
        await SetBalanceAsync(db, loner, 100);

        var result = await ServiceFor(db).CreateAsync(loner.Id, reward.Id);

        Assert.Equal(RedemptionStatus.NoHousehold, result.Status);
    }

    [Fact]
    public async Task An_unknown_user_is_refused()
    {
        using var db = TestDbContextFactory.Create();
        var (_, sam, household) = await PairedHouseholdAsync(db);
        var reward = await RewardCosting(db, household.Id, 10);

        var result = await ServiceFor(db).CreateAsync(sam.Id + 1000, reward.Id);

        Assert.Equal(RedemptionStatus.UserNotFound, result.Status);
    }

    // ------------------------------------------------------------------ the cost snapshot

    [Fact]
    public async Task CoinsSpent_is_the_price_at_purchase_time_and_a_later_edit_does_not_change_it()
    {
        // The reason the column exists (log 029's obligation). Task [29] made prices editable, so a live
        // read through the foreign key would re-price every past purchase.
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var reward = await RewardCosting(db, household.Id, 30);
        await SetBalanceAsync(db, sam, 50);

        var redemption = (await ServiceFor(db).CreateAsync(sam.Id, reward.Id)).Redemption!;
        Assert.Equal(30, redemption.CoinsSpent);

        /*
         * Re-priced directly, not through `RewardService.UpdateAsync`.
         *
         * Task [68] routes store changes in a paired household through the partner's approval queue,
         * so the service call would queue a request and leave the price alone — and this test would
         * then pass for the wrong reason, comparing a snapshot against a price that never moved.
         * The subject here is that `coins_spent` is a snapshot; the gate is [68]'s business.
         */
        reward.CoinCost = 5;
        await db.SaveChangesAsync();

        Assert.Equal(5, (await db.Rewards.SingleAsync(r => r.Id == reward.Id)).CoinCost);
        Assert.Equal(30, (await db.Redemptions.SingleAsync(r => r.Id == redemption.Id)).CoinsSpent);
    }

    [Fact]
    public async Task The_cost_is_taken_from_the_reward_not_from_anything_the_caller_sends()
    {
        // "Tampered costs" from the task description. The request carries only a reward id, so the charge
        // is provably server-derived: it equals the reward's price and the balance falls by that much.
        using var db = TestDbContextFactory.Create();
        var (_, sam, household) = await PairedHouseholdAsync(db);
        var reward = await RewardCosting(db, household.Id, 45);
        await SetBalanceAsync(db, sam, 45);

        var result = await ServiceFor(db).CreateAsync(sam.Id, reward.Id);

        Assert.Equal(reward.CoinCost, result.Redemption!.CoinsSpent);
        Assert.Equal(0, result.Redemption.CoinsRemaining);
    }

    // ------------------------------------------------------------------ badges

    [Fact]
    public async Task First_redemption_unlocks_immediately()
    {
        // Log 026's obligation. Asserted on the badge rows rather than a return value, so the wiring is
        // what is being tested.
        using var db = TestDbContextFactory.Create();
        var (_, sam, household) = await PairedHouseholdAsync(db);
        var reward = await RewardCosting(db, household.Id, 10);
        await SetBalanceAsync(db, sam, 100);

        Assert.Empty(await db.UserBadges.Where(ub => ub.UserId == sam.Id).ToListAsync());

        await ServiceFor(db).CreateAsync(sam.Id, reward.Id);

        var unlocked = await db.UserBadges.Where(ub => ub.UserId == sam.Id).Select(ub => ub.BadgeId).ToListAsync();
        Assert.Contains((int)BadgeCode.FirstRedemption, unlocked);
    }

    [Fact]
    public async Task Big_spender_unlocks_on_the_fifth_redemption_and_not_the_fourth()
    {
        // Absolute counts, not BigSpenderRedemptions - 1 and BigSpenderRedemptions, which would pass at
        // any threshold. Log 026 was caught by exactly that with the Century badge.
        using var db = TestDbContextFactory.Create();
        var (_, sam, household) = await PairedHouseholdAsync(db);
        var reward = await RewardCosting(db, household.Id, 10);
        await SetBalanceAsync(db, sam, 500);
        var service = ServiceFor(db);

        for (var i = 0; i < 4; i++)
        {
            Assert.Equal(RedemptionStatus.Ok, (await service.CreateAsync(sam.Id, reward.Id)).Status);
        }

        var afterFour = await db.UserBadges.Where(ub => ub.UserId == sam.Id).Select(ub => ub.BadgeId).ToListAsync();
        Assert.DoesNotContain((int)BadgeCode.BigSpender, afterFour);

        await service.CreateAsync(sam.Id, reward.Id);

        var afterFive = await db.UserBadges.Where(ub => ub.UserId == sam.Id).Select(ub => ub.BadgeId).ToListAsync();
        Assert.Contains((int)BadgeCode.BigSpender, afterFive);
    }

    // ------------------------------------------------------------------ the void

    private static async Task<(bool Voided, CompetitionSettlementService Settlement, CompetitionPeriod Period)>
        SettleTodayAsync(AppDbContext db, int householdId)
    {
        var calculator = new PeriodCalculator(TimeZoneInfo.FindSystemTimeZoneById(TimeZoneId));
        var settlement = new CompetitionSettlementService(db, calculator, new ProgressionService(db));
        var today = calculator.PeriodContaining(CompetitionPeriodType.Daily, DateTime.UtcNow);
        var standing = await settlement.GetStandingAsync(householdId, today);

        return (standing.Voided, settlement, today);
    }

    [Fact]
    public async Task Redeeming_a_pausing_reward_voids_that_days_competition()
    {
        // The behaviour api-design.md has promised since task [23] and nothing could reach until now:
        // redeeming the day off is the only thing that sets voided. Driven through real settlement rather
        // than asserted on a flag.
        using var db = TestDbContextFactory.Create();
        var (_, sam, household) = await PairedHouseholdAsync(db);
        var dayOff = await DayOffAsync(db, household.Id);
        await SetBalanceAsync(db, sam, 200);

        var before = await SettleTodayAsync(db, household.Id);
        Assert.False(before.Voided, "the day should not be voided before anything is redeemed");

        Assert.Equal(RedemptionStatus.Ok, (await ServiceFor(db).CreateAsync(sam.Id, dayOff.Id)).Status);

        var after = await SettleTodayAsync(db, household.Id);
        Assert.True(after.Voided);
    }

    [Fact]
    public async Task Redeeming_an_ordinary_reward_does_not_void_the_day()
    {
        // The contrast test. Without it, the one above passes against a service that voids on every
        // redemption.
        using var db = TestDbContextFactory.Create();
        var (_, sam, household) = await PairedHouseholdAsync(db);
        var ordinary = await db.Rewards
            .FirstAsync(r => r.HouseholdId == household.Id && !r.PausesCompetition);
        await SetBalanceAsync(db, sam, 200);

        Assert.Equal(RedemptionStatus.Ok, (await ServiceFor(db).CreateAsync(sam.Id, ordinary.Id)).Status);

        Assert.False((await SettleTodayAsync(db, household.Id)).Voided);
    }

    // ------------------------------------------------------------------ per-user balances

    [Fact]
    public async Task Each_partner_spends_only_their_own_coins()
    {
        // Both directions, so a service that debited the wrong row would fail whichever partner bought.
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var reward = await RewardCosting(db, household.Id, 30);
        await SetBalanceAsync(db, alex, 100);
        await SetBalanceAsync(db, sam, 40);
        var service = ServiceFor(db);

        await service.CreateAsync(sam.Id, reward.Id);
        Assert.Equal(10, (await db.Users.SingleAsync(u => u.Id == sam.Id)).Coins);
        Assert.Equal(100, (await db.Users.SingleAsync(u => u.Id == alex.Id)).Coins);

        await service.CreateAsync(alex.Id, reward.Id);
        Assert.Equal(70, (await db.Users.SingleAsync(u => u.Id == alex.Id)).Coins);
        Assert.Equal(10, (await db.Users.SingleAsync(u => u.Id == sam.Id)).Coins);
    }
}
