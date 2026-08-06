using API.Data;
using API.Dtos.Redemptions;
using API.Dtos.Rewards;
using API.Entities;
using API.Services;
using API.Services.Progression;
using Microsoft.EntityFrameworkCore;

namespace Dwelloot.Tests.Services;

public class RedemptionFeedTests
{
    private static async Task<User> AddUserAsync(AppDbContext db, string email)
    {
        var user = new User { Name = email.Split('@')[0], Email = email, UserName = email };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        return user;
    }

    private static HouseholdService HouseholdsFor(AppDbContext db) =>
        new(db, new DefaultCatalogCopier(db), new InviteCodeGenerator());

    /// <summary>A paired household behind a decoy, so no subject is id 1.</summary>
    private static async Task<(User Alex, User Sam, Household Household)> PairedHouseholdAsync(
        AppDbContext db,
        string prefix = "")
    {
        var households = HouseholdsFor(db);

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

    private static async Task<IReadOnlyList<HouseholdRedemptionResponse>> FeedFor(
        AppDbContext db,
        int userId,
        bool excludeMine = false,
        HouseholdRedemptionQuery? query = null)
    {
        var result = await ServiceFor(db).ListForHouseholdAsync(
            userId,
            query ?? new HouseholdRedemptionQuery { ExcludeMine = excludeMine, PageSize = 200 });

        Assert.Equal(RedemptionStatus.Ok, result.Status);
        return result.Page!.Items;
    }

    /// <summary>Alex and Sam each buy one thing, at distinct prices so the rows are tellable apart.</summary>
    private static async Task<(Reward AlexReward, Reward SamReward)> BothPartnersBuyAsync(
        AppDbContext db,
        User alex,
        User sam,
        int householdId)
    {
        var alexReward = await RewardCosting(db, householdId, 20, "Alex bought this");
        var samReward = await RewardCosting(db, householdId, 25, "Sam bought this");
        await SetBalanceAsync(db, alex, 100);
        await SetBalanceAsync(db, sam, 100);

        var service = ServiceFor(db);
        Assert.Equal(RedemptionStatus.Ok, (await service.CreateAsync(alex.Id, alexReward.Id)).Status);
        Assert.Equal(RedemptionStatus.Ok, (await service.CreateAsync(sam.Id, samReward.Id)).Status);

        return (alexReward, samReward);
    }

    [Fact]
    public async Task Returns_the_households_redemptions_with_their_fields()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var (_, samReward) = await BothPartnersBuyAsync(db, alex, sam, household.Id);

        var feed = await FeedFor(db, alex.Id);

        Assert.Equal(2, feed.Count);
        var samRow = feed.Single(i => i.UserId == sam.Id);
        Assert.Equal(samReward.Id, samRow.RewardId);
        Assert.Equal("Sam bought this", samRow.RewardTitle);
        Assert.Equal(25, samRow.CoinsSpent);
        Assert.NotEqual(default, samRow.RedeemedAt);
    }

    [Fact]
    public async Task ExcludeMine_drops_the_callers_own_rows_in_both_directions()
    {
        // Both directions on purpose. Asserting only Alex's view would pass against a filter that
        // dropped the wrong user's rows - it would still return exactly one item.
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        await BothPartnersBuyAsync(db, alex, sam, household.Id);

        var alexFeed = await FeedFor(db, alex.Id, excludeMine: true);
        Assert.Equal(sam.Id, Assert.Single(alexFeed).UserId);
        Assert.Equal("Sam bought this", alexFeed.Single().RewardTitle);

        var samFeed = await FeedFor(db, sam.Id, excludeMine: true);
        Assert.Equal(alex.Id, Assert.Single(samFeed).UserId);
        Assert.Equal("Alex bought this", samFeed.Single().RewardTitle);
    }

    [Fact]
    public async Task Omitting_excludeMine_returns_both_partners_rows()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        await BothPartnersBuyAsync(db, alex, sam, household.Id);

        var feed = await FeedFor(db, alex.Id);

        Assert.Equal(2, feed.Count);
        Assert.Contains(feed, i => i.UserId == alex.Id);
        Assert.Contains(feed, i => i.UserId == sam.Id);
    }

    [Fact]
    public async Task ExcludeMine_and_mine_partition_the_households_redemptions()
    {
        // The assertion that catches an inverted filter, which "excludes my rows" alone would not.
        // Same property log 022 asserted between the approval queue and own-log history.
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        await BothPartnersBuyAsync(db, alex, sam, household.Id);
        var service = ServiceFor(db);

        var everything = (await FeedFor(db, alex.Id)).Select(i => i.Id).ToList();
        var partners = (await FeedFor(db, alex.Id, excludeMine: true)).Select(i => i.Id).ToList();
        var own = (await service.ListMineAsync(alex.Id, new MyRedemptionQuery { PageSize = 200 }))
            .Page!.Items.Select(i => i.Id).ToList();

        Assert.NotEmpty(partners);
        Assert.NotEmpty(own);
        Assert.Empty(partners.Intersect(own));
        Assert.Equal(everything.OrderBy(i => i), partners.Concat(own).OrderBy(i => i));
    }

    [Fact]
    public async Task Another_households_redemptions_never_appear()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var (theirAlex, theirSam, theirHousehold) = await PairedHouseholdAsync(db, "other-");

        await BothPartnersBuyAsync(db, alex, sam, household.Id);
        await BothPartnersBuyAsync(db, theirAlex, theirSam, theirHousehold.Id);

        var theirIds = await db.Redemptions
            .Where(r => r.UserId == theirAlex.Id || r.UserId == theirSam.Id)
            .Select(r => r.Id)
            .ToListAsync();

        var mine = (await FeedFor(db, alex.Id)).Select(i => i.Id).ToList();

        Assert.Equal(2, mine.Count);
        Assert.Empty(mine.Intersect(theirIds));
    }

    [Fact]
    public async Task A_departed_partners_redemptions_stay_in_the_feed()
    {
        // The §3.15 rule, and the only test here that can fail if the join goes through the redeemer's
        // user.household_id: that column is nullable and cleared on leaving, so a feed built that way
        // would erase a departed partner's entire history the moment they left. Rewards are permanently
        // household-owned, which is why the join goes through them.
        //
        // Built through real service calls: Sam buys, Sam leaves, Alex stays so the household and its
        // rewards survive rather than cascading away.
        using var db = TestDbContextFactory.Create();
        var households = HouseholdsFor(db);
        var (alex, sam, household) = await PairedHouseholdAsync(db);

        var reward = await RewardCosting(db, household.Id, 30, "Bought before leaving");
        await SetBalanceAsync(db, sam, 100);
        Assert.Equal(RedemptionStatus.Ok, (await ServiceFor(db).CreateAsync(sam.Id, reward.Id)).Status);

        Assert.Equal(HouseholdAccessStatus.Ok, (await households.LeaveAsync(sam.Id, household.Id)).Status);
        Assert.Null((await db.Users.SingleAsync(u => u.Id == sam.Id)).HouseholdId);

        var feed = await FeedFor(db, alex.Id, excludeMine: true);

        var row = Assert.Single(feed);
        Assert.Equal(sam.Id, row.UserId);
        Assert.Equal("Bought before leaving", row.RewardTitle);
        Assert.Equal(30, row.CoinsSpent);
    }

    [Fact]
    public async Task Redemptions_of_archived_rewards_stay_in_the_feed()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var reward = await RewardCosting(db, household.Id, 30, "Since removed");
        await SetBalanceAsync(db, sam, 100);

        await ServiceFor(db).CreateAsync(sam.Id, reward.Id);
        await new RewardService(db).DeleteAsync(alex.Id, reward.Id);
        Assert.NotNull((await db.Rewards.SingleAsync(r => r.Id == reward.Id)).ArchivedAt);

        var row = Assert.Single(await FeedFor(db, alex.Id, excludeMine: true));
        Assert.Equal("Since removed", row.RewardTitle);
    }

    [Fact]
    public async Task CoinsSpent_is_the_snapshot_not_the_rewards_current_price()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var reward = await RewardCosting(db, household.Id, 30);
        await SetBalanceAsync(db, sam, 100);

        await ServiceFor(db).CreateAsync(sam.Id, reward.Id);
        await new RewardService(db).UpdateAsync(alex.Id, reward.Id, new PatchRewardRequest(null, 5));

        Assert.Equal(5, (await db.Rewards.SingleAsync(r => r.Id == reward.Id)).CoinCost);
        Assert.Equal(30, Assert.Single(await FeedFor(db, alex.Id, excludeMine: true)).CoinsSpent);
    }

    /// <summary>
    /// Redemptions sharing a timestamp, inserted with explicit ids <b>ascending</b> while the expected
    /// order is descending — so insertion order and expected order disagree and the tiebreaker becomes
    /// observable. Logs <c>016</c>, <c>027</c>, <c>028</c>, <c>031</c>.
    /// </summary>
    private static async Task AddTiedAsync(AppDbContext db, int userId, int rewardId, DateTime at, params int[] ids)
    {
        foreach (var id in ids)
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
    public async Task Feed_is_newest_first_with_ties_broken_by_descending_id()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var reward = await RewardCosting(db, household.Id, 10);

        await AddTiedAsync(db, sam.Id, reward.Id, new DateTime(2026, 7, 20, 10, 0, 0, DateTimeKind.Utc), 8000);
        await AddTiedAsync(db, sam.Id, reward.Id, new DateTime(2026, 7, 25, 10, 0, 0, DateTimeKind.Utc), 9000, 9001, 9002);

        var ids = (await FeedFor(db, alex.Id)).Select(i => i.Id).ToList();

        Assert.Equal([9002, 9001, 9000, 8000], ids);
    }

    private static async Task AddManyAsync(AppDbContext db, int userId, int rewardId, int count)
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
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var reward = await RewardCosting(db, household.Id, 10);
        await AddManyAsync(db, sam.Id, reward.Id, 12);

        var result = await ServiceFor(db).ListForHouseholdAsync(
            alex.Id, new HouseholdRedemptionQuery { Take = 5 });

        Assert.Equal(5, result.Page!.Items.Count);
        Assert.Equal(12, result.Page.Total);
    }

    [Fact]
    public async Task PageSize_wins_over_take_when_both_are_supplied()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var reward = await RewardCosting(db, household.Id, 10);
        await AddManyAsync(db, sam.Id, reward.Id, 12);

        var result = await ServiceFor(db).ListForHouseholdAsync(
            alex.Id, new HouseholdRedemptionQuery { Take = 5, PageSize = 3 });

        Assert.Equal(3, result.Page!.Items.Count);
    }

    [Fact]
    public async Task Page_size_is_capped_even_when_far_more_rows_exist()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var reward = await RewardCosting(db, household.Id, 10);
        await AddManyAsync(db, sam.Id, reward.Id, ActivityService.MaxPageSize + 50);

        var result = await ServiceFor(db).ListForHouseholdAsync(
            alex.Id, new HouseholdRedemptionQuery { PageSize = 100_000 });

        Assert.Equal(ActivityService.MaxPageSize, result.Page!.Items.Count);
        Assert.True(result.Page.Total > ActivityService.MaxPageSize, "total should report every row");
    }

    [Fact]
    public async Task A_page_below_one_clamps_to_the_first_page()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var reward = await RewardCosting(db, household.Id, 10);
        await AddManyAsync(db, sam.Id, reward.Id, 12);
        var service = ServiceFor(db);

        var first = await service.ListForHouseholdAsync(alex.Id, new HouseholdRedemptionQuery { PageSize = 3, Page = 1 });
        var zero = await service.ListForHouseholdAsync(alex.Id, new HouseholdRedemptionQuery { PageSize = 3, Page = 0 });

        Assert.Equal(first.Page!.Items.Select(i => i.Id), zero.Page!.Items.Select(i => i.Id));
    }

    [Fact]
    public async Task Paging_through_the_feed_yields_every_row_exactly_once()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var reward = await RewardCosting(db, household.Id, 10);
        await AddManyAsync(db, sam.Id, reward.Id, 7);
        await AddTiedAsync(db, sam.Id, reward.Id, new DateTime(2026, 7, 5, 0, 0, 0, DateTimeKind.Utc), 9000, 9001, 9002);
        var service = ServiceFor(db);

        var seen = new List<int>();
        for (var page = 1; ; page++)
        {
            var result = await service.ListForHouseholdAsync(
                alex.Id, new HouseholdRedemptionQuery { Page = page, PageSize = 4 });

            if (result.Page!.Items.Count == 0)
            {
                break;
            }

            seen.AddRange(result.Page.Items.Select(i => i.Id));
        }

        var expected = await db.Redemptions.Select(r => r.Id).ToListAsync();
        Assert.Equal(expected.Count, seen.Count);
        Assert.Equal(expected.Count, seen.Distinct().Count());
        Assert.Equal(expected.OrderBy(i => i), seen.OrderBy(i => i));
    }

    [Theory]
    [InlineData("household")]
    [InlineData("HOUSEHOLD")]
    [InlineData("Household")]
    [InlineData(" household ")]
    public async Task The_documented_scope_is_accepted_case_insensitively(string scope)
    {
        using var db = TestDbContextFactory.Create();
        var (alex, _, _) = await PairedHouseholdAsync(db);

        var result = await ServiceFor(db).ListForHouseholdAsync(
            alex.Id, new HouseholdRedemptionQuery { Scope = scope });

        Assert.Equal(RedemptionStatus.Ok, result.Status);
    }

    [Fact]
    public async Task An_omitted_scope_is_accepted()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, _, _) = await PairedHouseholdAsync(db);

        var result = await ServiceFor(db).ListForHouseholdAsync(alex.Id, new HouseholdRedemptionQuery());

        Assert.Equal(RedemptionStatus.Ok, result.Status);
    }

    [Theory]
    [InlineData("mine")]
    [InlineData("everyone")]
    [InlineData("; DROP TABLE")]
    public async Task An_unrecognised_scope_is_rejected_rather_than_widened(string scope)
    {
        // Rejected, not ignored. A silent fallback would hand a client that mistyped this the whole
        // household's rows - more data than it asked for.
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        await BothPartnersBuyAsync(db, alex, sam, household.Id);

        var result = await ServiceFor(db).ListForHouseholdAsync(
            alex.Id, new HouseholdRedemptionQuery { Scope = scope });

        Assert.Equal(RedemptionStatus.InvalidScope, result.Status);
        Assert.Null(result.Page);
    }

    [Fact]
    public async Task A_caller_with_no_household_gets_NoHousehold_rather_than_an_empty_page()
    {
        using var db = TestDbContextFactory.Create();
        await PairedHouseholdAsync(db);
        var loner = await AddUserAsync(db, "loner@example.com");

        var result = await ServiceFor(db).ListForHouseholdAsync(loner.Id, new HouseholdRedemptionQuery());

        Assert.Equal(RedemptionStatus.NoHousehold, result.Status);
        Assert.Null(result.Page);
    }

    [Fact]
    public async Task An_unknown_user_is_refused()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, _, _) = await PairedHouseholdAsync(db);

        var result = await ServiceFor(db).ListForHouseholdAsync(alex.Id + 1000, new HouseholdRedemptionQuery());

        Assert.Equal(RedemptionStatus.UserNotFound, result.Status);
    }

    [Fact]
    public async Task A_household_where_nobody_has_redeemed_gets_an_empty_page()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, _, _) = await PairedHouseholdAsync(db);

        var result = await ServiceFor(db).ListForHouseholdAsync(alex.Id, new HouseholdRedemptionQuery());

        Assert.Equal(RedemptionStatus.Ok, result.Status);
        Assert.Empty(result.Page!.Items);
        Assert.Equal(0, result.Page.Total);
    }
}
