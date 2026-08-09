using API.Data;
using API.Data.Defaults;
using API.Dtos.Rewards;
using API.Entities;
using API.Services;
using Microsoft.EntityFrameworkCore;

namespace Dwelloot.Tests.Services;

public class RewardServiceTests
{
    private static async Task<User> AddUserAsync(AppDbContext db, string email)
    {
        var user = new User { Name = email.Split('@')[0], Email = email, UserName = email };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        return user;
    }

    /// <summary>A user with a household whose store is the full set of default rewards.</summary>
    private static async Task<(User User, Household Household)> StockedHouseholdAsync(
        AppDbContext db,
        string email = "alex@example.com")
    {
        var user = await AddUserAsync(db, email);
        var created = await new HouseholdService(db, new DefaultCatalogCopier(db), new InviteCodeGenerator())
            .CreateAsync(user.Id, "Our place");

        return (user, created.Household!);
    }

    private static async Task SetBalanceAsync(AppDbContext db, User user, int coins)
    {
        user.Coins = coins;
        await db.SaveChangesAsync();
    }

    [Fact]
    public async Task ListAsync_returns_the_households_rewards_with_the_full_total()
    {
        using var db = TestDbContextFactory.Create();
        var (user, _) = await StockedHouseholdAsync(db);

        var result = await new RewardService(db).ListAsync(user.Id, new RewardQuery { PageSize = 100 });

        Assert.Equal(RewardQueryStatus.Ok, result.Status);
        Assert.Equal(DefaultRewards.All.Count, result.Page!.Total);
        Assert.Equal(DefaultRewards.All.Count, result.Page.Items.Count);
    }

    [Fact]
    public async Task ListAsync_never_returns_another_households_rewards()
    {
        // The isolation guarantee. Asserted on ids rather than titles: every household starts from
        // the same eight templates, so a title-based assertion would pass on the wrong rows.
        using var db = TestDbContextFactory.Create();
        var (mine, myHousehold) = await StockedHouseholdAsync(db, "alex@example.com");
        var (_, theirHousehold) = await StockedHouseholdAsync(db, "stranger@example.com");

        var result = await new RewardService(db).ListAsync(mine.Id, new RewardQuery { PageSize = 100 });

        var mineIds = await db.Rewards.Where(r => r.HouseholdId == myHousehold.Id)
            .Select(r => r.Id).ToListAsync();
        var theirIds = await db.Rewards.Where(r => r.HouseholdId == theirHousehold.Id)
            .Select(r => r.Id).ToListAsync();

        Assert.Equal(mineIds.OrderBy(i => i), result.Page!.Items.Select(i => i.Id).OrderBy(i => i));
        Assert.Empty(result.Page.Items.Select(i => i.Id).Intersect(theirIds));
    }

    [Fact]
    public async Task ListAsync_reports_NoHousehold_rather_than_an_empty_page()
    {
        using var db = TestDbContextFactory.Create();
        var loner = await AddUserAsync(db, "loner@example.com");

        var result = await new RewardService(db).ListAsync(loner.Id, new RewardQuery());

        Assert.Equal(RewardQueryStatus.NoHousehold, result.Status);
        Assert.Null(result.Page);
    }

    [Fact]
    public async Task ListAsync_reports_UserNotFound_for_an_unknown_user()
    {
        using var db = TestDbContextFactory.Create();

        var result = await new RewardService(db).ListAsync(userId: 999, new RewardQuery());

        Assert.Equal(RewardQueryStatus.UserNotFound, result.Status);
    }

    [Theory]
    [InlineData("foot")]
    [InlineData("FOOT")]
    [InlineData("FoOt")]
    public async Task ListAsync_search_is_case_insensitive(string term)
    {
        // The term must differ in case from the stored title for this to mean anything. "Foot
        // massage" is capitalised in the catalog, so a lowercase "foot" only matches if the column is
        // lowercased too.
        //
        // Written first with "massage" - which appears lowercase inside both matching titles - and
        // mutation testing caught it: removing ToLower() from the column changed nothing, because the
        // service lowercases the caller's input regardless, and "Foot massage".Contains("massage") is
        // already true. Yet another expectation that could not fail.
        using var db = TestDbContextFactory.Create();
        var (user, _) = await StockedHouseholdAsync(db);

        var result = await new RewardService(db).ListAsync(user.Id, new RewardQuery { Search = term, PageSize = 100 });

        Assert.Equal(1, result.Page!.Total);
        Assert.Equal("Foot massage", result.Page.Items.Single().Title);
    }

    [Fact]
    public async Task ListAsync_search_matches_every_row_containing_the_term()
    {
        // The multi-match half, kept separate from the casing theory above so neither has to carry
        // both jobs. Two defaults contain "massage".
        using var db = TestDbContextFactory.Create();
        var (user, _) = await StockedHouseholdAsync(db);

        var result = await new RewardService(db).ListAsync(
            user.Id, new RewardQuery { Search = "massage", PageSize = 100 });

        Assert.Equal(2, result.Page!.Total);
        Assert.All(result.Page.Items, item => Assert.Contains("massage", item.Title.ToLowerInvariant()));
    }

    [Fact]
    public async Task ListAsync_treats_a_percent_sign_as_a_literal_not_a_wildcard()
    {
        // Free with Contains, and a real bug in the hand-rolled LIKE '%' + term + '%' version, where
        // this would match every row.
        using var db = TestDbContextFactory.Create();
        var (user, _) = await StockedHouseholdAsync(db);

        var result = await new RewardService(db).ListAsync(user.Id, new RewardQuery { Search = "%" });

        Assert.Equal(0, result.Page!.Total);
    }

    [Fact]
    public async Task ListAsync_sorts_by_title_in_both_directions()
    {
        using var db = TestDbContextFactory.Create();
        var (user, _) = await StockedHouseholdAsync(db);
        var service = new RewardService(db);

        var asc = await service.ListAsync(user.Id, new RewardQuery { Sort = "title", PageSize = 100 });
        var desc = await service.ListAsync(user.Id, new RewardQuery { Sort = "title", Descending = true, PageSize = 100 });

        var ascTitles = asc.Page!.Items.Select(i => i.Title).ToList();
        Assert.Equal(ascTitles.OrderBy(t => t, StringComparer.Ordinal), ascTitles);
        Assert.Equal(ascTitles.AsEnumerable().Reverse(), desc.Page!.Items.Select(i => i.Title));
    }

    /// <summary>
    /// Adds rewards that share a coin cost, inserted with explicit ids in <b>descending</b> order.
    /// </summary>
    /// <remarks>
    /// Two separate traps are being avoided here.
    /// <para>
    /// First, the ties themselves. The activities equivalent could lean on three default chores tied
    /// at 15 points, but the default reward prices are 15/20/25/30/35/40/45/80 — <b>all distinct</b> —
    /// so a tiebreaker test against the stock catalog proves nothing.
    /// </para>
    /// <para>
    /// Second, the insertion order. Log <c>016</c> recorded the <c>ThenBy(Id)</c> tiebreaker as not
    /// verifiable in-memory, because LINQ-to-Objects sorting is stable and emits ties in insertion
    /// order — which is normally id order, making the tiebreaker invisible. That is a property of the
    /// <em>fixture</em> rather than of the provider: inserting these highest-id-first makes the two
    /// orders disagree, so dropping the tiebreaker reverses them and the assertion fails. Same fix as
    /// the badge ordering test in log <c>027</c>.
    /// </para>
    /// </remarks>
    private static async Task AddTiedRewardsAsync(AppDbContext db, int householdId, int coinCost = 30)
    {
        foreach (var id in new[] { 9002, 9001, 9000 })
        {
            db.Rewards.Add(new Reward
            {
                Id = id,
                HouseholdId = householdId,
                Title = $"Tied reward {id}",
                CoinCost = coinCost
            });

            await db.SaveChangesAsync();
        }
    }

    [Fact]
    public async Task ListAsync_sorts_by_coin_cost_and_breaks_ties_by_id()
    {
        using var db = TestDbContextFactory.Create();
        var (user, household) = await StockedHouseholdAsync(db);
        await AddTiedRewardsAsync(db, household.Id);

        var result = await new RewardService(db).ListAsync(
            user.Id, new RewardQuery { Sort = "coinCost", PageSize = 100 });

        var items = result.Page!.Items;
        Assert.Equal(items.OrderBy(i => i.CoinCost).ThenBy(i => i.Id).Select(i => i.Id), items.Select(i => i.Id));

        var tied = items.Where(i => i.CoinCost == 30).Select(i => i.Id).ToList();
        Assert.True(tied.Count > 1, "expected tied coin costs in the fixture");
        Assert.Equal(tied.OrderBy(i => i), tied);
    }

    [Fact]
    public async Task ListAsync_rejects_an_unknown_sort_field()
    {
        using var db = TestDbContextFactory.Create();
        var (user, _) = await StockedHouseholdAsync(db);

        var result = await new RewardService(db).ListAsync(user.Id, new RewardQuery { Sort = "; DROP TABLE" });

        Assert.Equal(RewardQueryStatus.InvalidSort, result.Status);
        Assert.Null(result.Page);
    }

    [Fact]
    public async Task Every_documented_sort_field_is_accepted()
    {
        // Pins the 400 message's spellings against the switch's lowercase match keys. Without this,
        // renaming a match key would leave the controller advertising a value that returns 400.
        using var db = TestDbContextFactory.Create();
        var (user, _) = await StockedHouseholdAsync(db);
        var service = new RewardService(db);

        foreach (var field in RewardSortFields.All)
        {
            var result = await service.ListAsync(user.Id, new RewardQuery { Sort = field });
            Assert.Equal(RewardQueryStatus.Ok, result.Status);
        }
    }

    [Fact]
    public async Task ListAsync_pages_and_reports_the_unpaginated_total()
    {
        using var db = TestDbContextFactory.Create();
        var (user, _) = await StockedHouseholdAsync(db);

        var result = await new RewardService(db).ListAsync(
            user.Id, new RewardQuery { Page = 2, PageSize = 3, Sort = "title" });

        Assert.Equal(3, result.Page!.Items.Count);
        Assert.Equal(DefaultRewards.All.Count, result.Page.Total);
    }

    [Fact]
    public async Task Paging_through_the_catalog_yields_every_row_exactly_once()
    {
        // The property a missing tiebreaker actually breaks - rows repeating or vanishing across page
        // boundaries - which a single-page assertion cannot see. Run with ties present.
        using var db = TestDbContextFactory.Create();
        var (user, household) = await StockedHouseholdAsync(db);
        await AddTiedRewardsAsync(db, household.Id);
        var service = new RewardService(db);

        const int pageSize = 4;
        var seen = new List<int>();

        for (var page = 1; ; page++)
        {
            var result = await service.ListAsync(
                user.Id, new RewardQuery { Sort = "coinCost", Page = page, PageSize = pageSize });

            if (result.Page!.Items.Count == 0)
            {
                break;
            }

            seen.AddRange(result.Page.Items.Select(i => i.Id));
        }

        var expected = await db.Rewards.Select(r => r.Id).ToListAsync();
        Assert.Equal(expected.Count, seen.Count);
        Assert.Equal(expected.Count, seen.Distinct().Count());
        Assert.Equal(expected.OrderBy(i => i), seen.OrderBy(i => i));
    }

    [Fact]
    public async Task ListAsync_caps_page_size_even_when_far_more_rows_exist()
    {
        // Seeded past the cap on purpose. Asserting it against the eight-row default store is
        // vacuous - a request for 100,000 returns eight whether or not a cap exists - which is the
        // first survivor mutation testing found in log 016.
        using var db = TestDbContextFactory.Create();
        var (user, household) = await StockedHouseholdAsync(db);

        db.Rewards.AddRange(Enumerable.Range(0, ActivityService.MaxPageSize + 50).Select(i => new Reward
        {
            HouseholdId = household.Id,
            Title = $"Filler reward {i:D3}",
            CoinCost = 5
        }));
        await db.SaveChangesAsync();

        var huge = await new RewardService(db).ListAsync(user.Id, new RewardQuery { PageSize = 100_000 });

        Assert.Equal(ActivityService.MaxPageSize, huge.Page!.Items.Count);
        Assert.True(huge.Page.Total > ActivityService.MaxPageSize, "total should report every match");
    }

    [Fact]
    public async Task ListAsync_clamps_a_page_below_one_to_the_first_page()
    {
        using var db = TestDbContextFactory.Create();
        var (user, _) = await StockedHouseholdAsync(db);
        var service = new RewardService(db);

        var firstPage = await service.ListAsync(user.Id, new RewardQuery { Sort = "title", PageSize = 3, Page = 1 });
        var zeroPage = await service.ListAsync(user.Id, new RewardQuery { Sort = "title", PageSize = 3, Page = 0 });

        Assert.Equal(firstPage.Page!.Items.Select(i => i.Id), zeroPage.Page!.Items.Select(i => i.Id));
    }

    [Fact]
    public async Task Affordable_filter_narrows_to_what_the_balance_covers()
    {
        // Absolute literals, not expressions over the balance. The default prices are
        // 15/20/25/30/35/40/45/80, so a balance of 25 affords exactly three of them. Writing the
        // expectation as "everything <= user.Coins" would pass at any comparison operator - the trap
        // logs 023, 025 and 026 each hit.
        using var db = TestDbContextFactory.Create();
        var (user, _) = await StockedHouseholdAsync(db);
        await SetBalanceAsync(db, user, 25);

        var result = await new RewardService(db).ListAsync(
            user.Id, new RewardQuery { Affordable = true, PageSize = 100 });

        Assert.Equal(3, result.Page!.Total);
        Assert.Equal([15, 20, 25], result.Page.Items.Select(i => i.CoinCost).OrderBy(c => c));
    }

    [Fact]
    public async Task A_reward_priced_at_exactly_the_balance_is_affordable()
    {
        // The boundary is <=, not <: the caller can complete that purchase. Asserted on its own so a
        // flipped operator cannot hide inside a larger set.
        using var db = TestDbContextFactory.Create();
        var (user, _) = await StockedHouseholdAsync(db);
        await SetBalanceAsync(db, user, 15);

        var result = await new RewardService(db).ListAsync(
            user.Id, new RewardQuery { Affordable = true, PageSize = 100 });

        Assert.Equal(1, result.Page!.Total);
        Assert.Equal(15, result.Page.Items.Single().CoinCost);
    }

    [Fact]
    public async Task The_two_affordability_states_partition_the_catalog()
    {
        // Both directions. Asserting only the affordable side would pass against a service that
        // ignored Affordable = false and returned the whole catalog for it.
        using var db = TestDbContextFactory.Create();
        var (user, _) = await StockedHouseholdAsync(db);
        await SetBalanceAsync(db, user, 25);
        var service = new RewardService(db);

        var all = await service.ListAsync(user.Id, new RewardQuery { PageSize = 100 });
        var yes = await service.ListAsync(user.Id, new RewardQuery { Affordable = true, PageSize = 100 });
        var no = await service.ListAsync(user.Id, new RewardQuery { Affordable = false, PageSize = 100 });

        var yesIds = yes.Page!.Items.Select(i => i.Id).ToList();
        var noIds = no.Page!.Items.Select(i => i.Id).ToList();

        Assert.NotEmpty(yesIds);
        Assert.NotEmpty(noIds);
        Assert.Empty(yesIds.Intersect(noIds));
        Assert.Equal(all.Page!.Total, yes.Page.Total + no.Page.Total);
        Assert.Equal(
            all.Page.Items.Select(i => i.Id).OrderBy(i => i),
            yesIds.Concat(noIds).OrderBy(i => i));

        // And the unaffordable side really is the dear end of the catalog.
        Assert.All(no.Page.Items, item => Assert.True(item.CoinCost > 25));
    }

    [Fact]
    public async Task A_zero_balance_affords_nothing()
    {
        using var db = TestDbContextFactory.Create();
        var (user, _) = await StockedHouseholdAsync(db);

        Assert.Equal(0, user.Coins);

        var result = await new RewardService(db).ListAsync(
            user.Id, new RewardQuery { Affordable = true, PageSize = 100 });

        Assert.Equal(0, result.Page!.Total);
        Assert.Empty(result.Page.Items);
    }

    [Fact]
    public async Task PausesCompetition_is_reported_per_item()
    {
        // The field task [51] needs to warn that redeeming the day off voids the duel for both
        // partners. Exactly one default reward sets it, and the copy is derived from this flag
        // rather than from the title - so the flag has to reach the client.
        using var db = TestDbContextFactory.Create();
        var (user, _) = await StockedHouseholdAsync(db);

        var result = await new RewardService(db).ListAsync(user.Id, new RewardQuery { PageSize = 100 });

        var pausing = result.Page!.Items.Where(i => i.PausesCompetition).ToList();
        var expected = DefaultRewards.All.Where(t => t.PausesCompetition).ToList();

        Assert.Single(expected);
        Assert.Equal(expected.Count, pausing.Count);
        Assert.Equal(expected.Single().Title, pausing.Single().Title);

        // And the other seven are false, not merely absent from the filtered list above.
        Assert.Equal(
            DefaultRewards.All.Count - 1,
            result.Page.Items.Count(i => !i.PausesCompetition));
    }
}
