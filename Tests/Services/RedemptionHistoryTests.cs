using API.Data;
using API.Dtos.Redemptions;
using API.Dtos.Rewards;
using API.Entities;
using API.Services;
using API.Services.Progression;
using Microsoft.EntityFrameworkCore;

namespace Dwelloot.Tests.Services;

public class RedemptionHistoryTests
{
    private static async Task<User> AddUserAsync(AppDbContext db, string email)
    {
        var user = new User { Name = email.Split('@')[0], Email = email, UserName = email };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        return user;
    }

    /// <summary>
    /// A paired household with a stocked store, behind a decoy so no subject is id 1.
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

    private static RedemptionService ServiceFor(AppDbContext db) => new(db, new ProgressionService(db));

    private static async Task<Reward> RewardCosting(AppDbContext db, int householdId, int coinCost, string? title = null)
    {
        var reward = new Reward
        {
            HouseholdId = householdId,
            Title = title ?? $"Reward costing {coinCost}",
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

    private static async Task<IReadOnlyList<MyRedemptionResponse>> HistoryOf(
        AppDbContext db,
        int userId,
        MyRedemptionQuery? query = null)
    {
        var result = await ServiceFor(db).ListMineAsync(userId, query ?? new MyRedemptionQuery { PageSize = 100 });
        Assert.Equal(RedemptionStatus.Ok, result.Status);
        return result.Page!.Items;
    }

    [Fact]
    public async Task Returns_the_callers_redemptions_with_their_fields()
    {
        using var db = TestDbContextFactory.Create();
        var (_, sam, household) = await PairedHouseholdAsync(db);
        var reward = await RewardCosting(db, household.Id, 30, "Takeout of choice");
        await SetBalanceAsync(db, sam, 100);

        var created = (await ServiceFor(db).CreateAsync(sam.Id, reward.Id)).Redemption!;

        var item = Assert.Single(await HistoryOf(db, sam.Id));
        Assert.Equal(created.Id, item.Id);
        Assert.Equal(reward.Id, item.RewardId);
        Assert.Equal("Takeout of choice", item.RewardTitle);
        Assert.Equal(30, item.CoinsSpent);
        Assert.Equal(created.RedeemedAt, item.RedeemedAt);
    }

    [Fact]
    public async Task History_is_the_callers_own_in_both_directions()
    {
        // Both directions on purpose. Asserting only that Sam sees Sam's would pass against a service
        // that dropped the user filter and returned the whole household's purchases.
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var alexReward = await RewardCosting(db, household.Id, 20, "Alex bought this");
        var samReward = await RewardCosting(db, household.Id, 25, "Sam bought this");
        await SetBalanceAsync(db, alex, 100);
        await SetBalanceAsync(db, sam, 100);
        var service = ServiceFor(db);

        await service.CreateAsync(alex.Id, alexReward.Id);
        await service.CreateAsync(sam.Id, samReward.Id);

        var alexHistory = await HistoryOf(db, alex.Id);
        Assert.Equal("Alex bought this", Assert.Single(alexHistory).RewardTitle);

        var samHistory = await HistoryOf(db, sam.Id);
        Assert.Equal("Sam bought this", Assert.Single(samHistory).RewardTitle);
    }

    [Fact]
    public async Task A_redemption_from_a_household_the_user_has_left_is_not_listed()
    {
        // The only scenario the household filter actually changes, and the reason it exists: the user
        // filter alone already hides other people's purchases, so a test where each user has only ever
        // belonged to one household passes with the household clause deleted. Mutation testing caught
        // exactly that.
        //
        // Built through real service calls rather than by hand: Sam buys something in the first
        // household, leaves it (Alex stays, so the household and its rewards survive rather than
        // cascading away), then joins a second one. The redemption still exists and is still Sam's -
        // it just belongs to a household Sam is no longer in.
        using var db = TestDbContextFactory.Create();
        var households = new HouseholdService(db, new DefaultCatalogCopier(db), new InviteCodeGenerator());
        var (_, sam, first) = await PairedHouseholdAsync(db);

        var reward = await RewardCosting(db, first.Id, 20, "Bought before leaving");
        await SetBalanceAsync(db, sam, 100);
        await ServiceFor(db).CreateAsync(sam.Id, reward.Id);
        Assert.Single(await HistoryOf(db, sam.Id));

        Assert.Equal(HouseholdAccessStatus.Ok, (await households.LeaveAsync(sam.Id, first.Id)).Status);

        var bob = await AddUserAsync(db, "bob@example.com");
        var second = (await households.CreateAsync(bob.Id, "Second place")).Household!;
        await households.JoinAsync(sam.Id, second.InviteCode);

        // The row is untouched - it is filtered by the query, not deleted.
        Assert.Single(await db.Redemptions.Where(r => r.UserId == sam.Id).ToListAsync());

        var result = await ServiceFor(db).ListMineAsync(sam.Id, new MyRedemptionQuery { PageSize = 100 });
        Assert.Equal(RedemptionStatus.Ok, result.Status);
        Assert.Empty(result.Page!.Items);
        Assert.Equal(0, result.Page.Total);
    }

    [Fact]
    public async Task Another_households_redemptions_never_appear()
    {
        using var db = TestDbContextFactory.Create();
        var (_, sam, household) = await PairedHouseholdAsync(db);
        var (_, theirSam, theirHousehold) = await PairedHouseholdAsync(db, "other-");

        var mine = await RewardCosting(db, household.Id, 20);
        var theirs = await RewardCosting(db, theirHousehold.Id, 20);
        await SetBalanceAsync(db, sam, 100);
        await SetBalanceAsync(db, theirSam, 100);
        var service = ServiceFor(db);

        await service.CreateAsync(sam.Id, mine.Id);
        await service.CreateAsync(theirSam.Id, theirs.Id);

        var theirIds = await db.Redemptions.Where(r => r.UserId == theirSam.Id).Select(r => r.Id).ToListAsync();
        var mineIds = (await HistoryOf(db, sam.Id)).Select(i => i.Id).ToList();

        Assert.Single(mineIds);
        Assert.Empty(mineIds.Intersect(theirIds));
    }

    /// <summary>
    /// Redemptions sharing a timestamp, inserted with explicit ids in <b>ascending</b> order.
    /// </summary>
    /// <remarks>
    /// The expected order is newest first, so ties come back by <em>descending</em> id. Inserting them
    /// ascending makes insertion order and expected order disagree — without that, the in-memory
    /// provider's stable sort emits ties in insertion order and the <c>ThenByDescending(Id)</c>
    /// tiebreaker is invisible. Log <c>016</c>'s trap; same fix as logs <c>027</c> and <c>028</c>.
    /// </remarks>
    private static async Task AddTiedRedemptionsAsync(AppDbContext db, int userId, int rewardId, DateTime at)
    {
        foreach (var id in new[] { 9000, 9001, 9002 })
        {
            db.Redemptions.Add(new Redemption
            {
                Id = id,
                UserId = userId,
                RewardId = rewardId,
                CoinsSpent = 10,
                RedeemedAt = at
            });

            await db.SaveChangesAsync();
        }
    }

    [Fact]
    public async Task History_is_newest_first_with_ties_broken_by_descending_id()
    {
        using var db = TestDbContextFactory.Create();
        var (_, sam, household) = await PairedHouseholdAsync(db);
        var reward = await RewardCosting(db, household.Id, 10);

        var older = new DateTime(2026, 7, 20, 10, 0, 0, DateTimeKind.Utc);
        var tied = new DateTime(2026, 7, 25, 10, 0, 0, DateTimeKind.Utc);

        db.Redemptions.Add(new Redemption
        {
            Id = 8000,
            UserId = sam.Id,
            RewardId = reward.Id,
            CoinsSpent = 10,
            RedeemedAt = older
        });
        await db.SaveChangesAsync();

        await AddTiedRedemptionsAsync(db, sam.Id, reward.Id, tied);

        var ids = (await HistoryOf(db, sam.Id)).Select(i => i.Id).ToList();

        Assert.Equal([9002, 9001, 9000, 8000], ids);
    }

    [Fact]
    public async Task CoinsSpent_is_the_snapshot_not_the_rewards_current_price()
    {
        // The obligation from log 030, now observable: before this endpoint the column was written and
        // never read back.
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var reward = await RewardCosting(db, household.Id, 30);
        await SetBalanceAsync(db, sam, 100);

        await ServiceFor(db).CreateAsync(sam.Id, reward.Id);
        await new RewardService(db).UpdateAsync(alex.Id, reward.Id, new PatchRewardRequest(null, 5));

        Assert.Equal(5, (await db.Rewards.SingleAsync(r => r.Id == reward.Id)).CoinCost);
        Assert.Equal(30, Assert.Single(await HistoryOf(db, sam.Id)).CoinsSpent);
    }

    [Fact]
    public async Task A_redemption_of_an_archived_reward_stays_in_the_history_with_its_title()
    {
        // The property task [29] exists to protect, at the read layer. "Filter archived" is the habit in
        // the store list and the loot-box pool, so the instinct to be consistent is what would break it.
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var reward = await RewardCosting(db, household.Id, 30, "Since removed");
        await SetBalanceAsync(db, sam, 100);

        await ServiceFor(db).CreateAsync(sam.Id, reward.Id);
        await new RewardService(db).DeleteAsync(alex.Id, reward.Id);

        Assert.NotNull((await db.Rewards.SingleAsync(r => r.Id == reward.Id)).ArchivedAt);

        var item = Assert.Single(await HistoryOf(db, sam.Id));
        Assert.Equal("Since removed", item.RewardTitle);
        Assert.Equal(30, item.CoinsSpent);
    }

    private static async Task AddRedemptionsAsync(AppDbContext db, int userId, int rewardId, int count)
    {
        var at = new DateTime(2026, 7, 1, 0, 0, 0, DateTimeKind.Utc);

        for (var i = 0; i < count; i++)
        {
            db.Redemptions.Add(new Redemption
            {
                UserId = userId,
                RewardId = rewardId,
                CoinsSpent = 10,
                RedeemedAt = at.AddMinutes(i)
            });
        }

        await db.SaveChangesAsync();
    }

    [Fact]
    public async Task Take_limits_the_page_while_total_reports_every_row()
    {
        using var db = TestDbContextFactory.Create();
        var (_, sam, household) = await PairedHouseholdAsync(db);
        var reward = await RewardCosting(db, household.Id, 10);
        await AddRedemptionsAsync(db, sam.Id, reward.Id, 12);

        var result = await ServiceFor(db).ListMineAsync(sam.Id, new MyRedemptionQuery { Take = 5 });

        Assert.Equal(5, result.Page!.Items.Count);
        Assert.Equal(12, result.Page.Total);
    }

    [Fact]
    public async Task PageSize_wins_over_take_when_both_are_supplied()
    {
        using var db = TestDbContextFactory.Create();
        var (_, sam, household) = await PairedHouseholdAsync(db);
        var reward = await RewardCosting(db, household.Id, 10);
        await AddRedemptionsAsync(db, sam.Id, reward.Id, 12);

        var result = await ServiceFor(db).ListMineAsync(
            sam.Id, new MyRedemptionQuery { Take = 5, PageSize = 3 });

        Assert.Equal(3, result.Page!.Items.Count);
    }

    [Fact]
    public async Task Page_size_is_capped_even_when_far_more_rows_exist()
    {
        // Seeded past the cap on purpose: asserting it against a dozen rows is vacuous, which is the
        // first survivor mutation testing found in log 016.
        using var db = TestDbContextFactory.Create();
        var (_, sam, household) = await PairedHouseholdAsync(db);
        var reward = await RewardCosting(db, household.Id, 10);
        await AddRedemptionsAsync(db, sam.Id, reward.Id, ActivityService.MaxPageSize + 50);

        var result = await ServiceFor(db).ListMineAsync(sam.Id, new MyRedemptionQuery { PageSize = 100_000 });

        Assert.Equal(ActivityService.MaxPageSize, result.Page!.Items.Count);
        Assert.True(result.Page.Total > ActivityService.MaxPageSize, "total should report every row");
    }

    [Fact]
    public async Task A_page_below_one_clamps_to_the_first_page()
    {
        using var db = TestDbContextFactory.Create();
        var (_, sam, household) = await PairedHouseholdAsync(db);
        var reward = await RewardCosting(db, household.Id, 10);
        await AddRedemptionsAsync(db, sam.Id, reward.Id, 12);
        var service = ServiceFor(db);

        var first = await service.ListMineAsync(sam.Id, new MyRedemptionQuery { PageSize = 3, Page = 1 });
        var zero = await service.ListMineAsync(sam.Id, new MyRedemptionQuery { PageSize = 3, Page = 0 });

        Assert.Equal(first.Page!.Items.Select(i => i.Id), zero.Page!.Items.Select(i => i.Id));
    }

    [Fact]
    public async Task Paging_through_the_history_yields_every_row_exactly_once()
    {
        // The property a missing tiebreaker actually breaks. Run with ties present.
        using var db = TestDbContextFactory.Create();
        var (_, sam, household) = await PairedHouseholdAsync(db);
        var reward = await RewardCosting(db, household.Id, 10);
        await AddRedemptionsAsync(db, sam.Id, reward.Id, 7);
        await AddTiedRedemptionsAsync(db, sam.Id, reward.Id, new DateTime(2026, 7, 5, 0, 0, 0, DateTimeKind.Utc));
        var service = ServiceFor(db);

        var seen = new List<int>();
        for (var page = 1; ; page++)
        {
            var result = await service.ListMineAsync(sam.Id, new MyRedemptionQuery { Page = page, PageSize = 4 });
            if (result.Page!.Items.Count == 0)
            {
                break;
            }

            seen.AddRange(result.Page.Items.Select(i => i.Id));
        }

        var expected = await db.Redemptions.Where(r => r.UserId == sam.Id).Select(r => r.Id).ToListAsync();
        Assert.Equal(expected.Count, seen.Count);
        Assert.Equal(expected.Count, seen.Distinct().Count());
        Assert.Equal(expected.OrderBy(i => i), seen.OrderBy(i => i));
    }

    [Fact]
    public async Task A_caller_with_no_household_gets_NoHousehold_rather_than_an_empty_page()
    {
        using var db = TestDbContextFactory.Create();
        await PairedHouseholdAsync(db);
        var loner = await AddUserAsync(db, "loner@example.com");

        var result = await ServiceFor(db).ListMineAsync(loner.Id, new MyRedemptionQuery());

        Assert.Equal(RedemptionStatus.NoHousehold, result.Status);
        Assert.Null(result.Page);
    }

    [Fact]
    public async Task An_unknown_user_is_refused()
    {
        using var db = TestDbContextFactory.Create();
        var (_, sam, _) = await PairedHouseholdAsync(db);

        var result = await ServiceFor(db).ListMineAsync(sam.Id + 1000, new MyRedemptionQuery());

        Assert.Equal(RedemptionStatus.UserNotFound, result.Status);
    }

    [Fact]
    public async Task A_paired_user_who_has_never_redeemed_gets_an_empty_page()
    {
        // The legitimate empty state, distinct from the NoHousehold error above.
        using var db = TestDbContextFactory.Create();
        var (_, sam, _) = await PairedHouseholdAsync(db);

        var result = await ServiceFor(db).ListMineAsync(sam.Id, new MyRedemptionQuery());

        Assert.Equal(RedemptionStatus.Ok, result.Status);
        Assert.Empty(result.Page!.Items);
        Assert.Equal(0, result.Page.Total);
    }
}
