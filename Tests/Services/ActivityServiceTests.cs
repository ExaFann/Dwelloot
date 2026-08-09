using API.Data;
using API.Data.Defaults;
using API.Dtos.Activities;
using API.Entities;
using API.Services;
using Microsoft.EntityFrameworkCore;

namespace Dwelloot.Tests.Services;

public class ActivityServiceTests
{
    private static async Task<User> AddUserAsync(AppDbContext db, string email)
    {
        var user = new User { Name = email.Split('@')[0], Email = email, UserName = email };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        return user;
    }

    /// <summary>A user with a household whose catalog is the full set of defaults.</summary>
    private static async Task<(User User, Household Household)> StockedHouseholdAsync(
        AppDbContext db,
        string email = "alex@example.com")
    {
        var user = await AddUserAsync(db, email);
        var created = await new HouseholdService(db, new DefaultCatalogCopier(db), new InviteCodeGenerator())
            .CreateAsync(user.Id, "Our place");

        return (user, created.Household!);
    }

    [Fact]
    public async Task ListAsync_returns_the_households_chores_with_the_full_total()
    {
        using var db = TestDbContextFactory.Create();
        var (user, _) = await StockedHouseholdAsync(db);

        var result = await new ActivityService(db).ListAsync(user.Id, new ActivityQuery { PageSize = 100 });

        Assert.Equal(ActivityQueryStatus.Ok, result.Status);
        Assert.Equal(DefaultActivities.All.Count, result.Page!.Total);
        Assert.Equal(DefaultActivities.All.Count, result.Page.Items.Count);
    }

    [Fact]
    public async Task ListAsync_never_returns_another_households_chores()
    {
        // The isolation guarantee. Asserted on ids rather than titles: every household starts from
        // the same templates, so a title-based assertion would pass even on the wrong rows.
        using var db = TestDbContextFactory.Create();
        var (mine, myHousehold) = await StockedHouseholdAsync(db, "alex@example.com");
        var (_, theirHousehold) = await StockedHouseholdAsync(db, "stranger@example.com");

        var result = await new ActivityService(db).ListAsync(mine.Id, new ActivityQuery { PageSize = 100 });

        var mineIds = await db.Activities.Where(a => a.HouseholdId == myHousehold.Id)
            .Select(a => a.Id).ToListAsync();
        var theirIds = await db.Activities.Where(a => a.HouseholdId == theirHousehold.Id)
            .Select(a => a.Id).ToListAsync();

        Assert.Equal(mineIds.OrderBy(i => i), result.Page!.Items.Select(i => i.Id).OrderBy(i => i));
        Assert.Empty(result.Page.Items.Select(i => i.Id).Intersect(theirIds));
    }

    [Fact]
    public async Task ListAsync_reports_NoHousehold_rather_than_an_empty_page()
    {
        using var db = TestDbContextFactory.Create();
        var loner = await AddUserAsync(db, "loner@example.com");

        var result = await new ActivityService(db).ListAsync(loner.Id, new ActivityQuery());

        Assert.Equal(ActivityQueryStatus.NoHousehold, result.Status);
        Assert.Null(result.Page);
    }

    [Fact]
    public async Task ListAsync_reports_UserNotFound_for_an_unknown_user()
    {
        using var db = TestDbContextFactory.Create();

        var result = await new ActivityService(db).ListAsync(userId: 999, new ActivityQuery());

        Assert.Equal(ActivityQueryStatus.UserNotFound, result.Status);
    }

    [Theory]
    [InlineData("vacuum")]
    [InlineData("VACUUM")]
    [InlineData("VaCuUm")]
    public async Task ListAsync_search_is_case_insensitive(string term)
    {
        using var db = TestDbContextFactory.Create();
        var (user, _) = await StockedHouseholdAsync(db);

        var result = await new ActivityService(db).ListAsync(user.Id, new ActivityQuery { Search = term });

        Assert.Equal(1, result.Page!.Total);
        Assert.Equal("Vacuum", result.Page.Items.Single().Title);
    }

    [Fact]
    public async Task ListAsync_treats_a_percent_sign_as_a_literal_not_a_wildcard()
    {
        // Free with Contains, and a real bug in the hand-rolled LIKE '%' + term + '%' version,
        // where this would match every row.
        using var db = TestDbContextFactory.Create();
        var (user, _) = await StockedHouseholdAsync(db);

        var result = await new ActivityService(db).ListAsync(user.Id, new ActivityQuery { Search = "%" });

        Assert.Equal(0, result.Page!.Total);
    }

    [Fact]
    public async Task ListAsync_sorts_by_title_in_both_directions()
    {
        using var db = TestDbContextFactory.Create();
        var (user, _) = await StockedHouseholdAsync(db);
        var service = new ActivityService(db);

        var asc = await service.ListAsync(user.Id, new ActivityQuery { Sort = "title", PageSize = 100 });
        var desc = await service.ListAsync(user.Id, new ActivityQuery { Sort = "title", Descending = true, PageSize = 100 });

        var ascTitles = asc.Page!.Items.Select(i => i.Title).ToList();
        Assert.Equal(ascTitles.OrderBy(t => t, StringComparer.Ordinal), ascTitles);
        Assert.Equal(ascTitles.AsEnumerable().Reverse(), desc.Page!.Items.Select(i => i.Title));
    }

    [Fact]
    public async Task ListAsync_sorts_by_points_and_breaks_ties_by_id()
    {
        // The default catalog has three chores at 15 points, so this exercises the tiebreaker
        // against real data rather than a contrived fixture.
        using var db = TestDbContextFactory.Create();
        var (user, _) = await StockedHouseholdAsync(db);

        var result = await new ActivityService(db).ListAsync(
            user.Id, new ActivityQuery { Sort = "points", PageSize = 100 });

        var items = result.Page!.Items;
        Assert.Equal(items.OrderBy(i => i.Points).ThenBy(i => i.Id).Select(i => i.Id), items.Select(i => i.Id));

        var tied = items.Where(i => i.Points == 15).Select(i => i.Id).ToList();
        Assert.True(tied.Count > 1, "expected the default catalog to contain tied point values");
        Assert.Equal(tied.OrderBy(i => i), tied);
    }

    [Fact]
    public async Task ListAsync_rejects_an_unknown_sort_field()
    {
        using var db = TestDbContextFactory.Create();
        var (user, _) = await StockedHouseholdAsync(db);

        var result = await new ActivityService(db).ListAsync(user.Id, new ActivityQuery { Sort = "; DROP TABLE" });

        Assert.Equal(ActivityQueryStatus.InvalidSort, result.Status);
        Assert.Null(result.Page);
    }

    [Fact]
    public async Task ListAsync_pages_and_reports_the_unpaginated_total()
    {
        using var db = TestDbContextFactory.Create();
        var (user, _) = await StockedHouseholdAsync(db);

        var result = await new ActivityService(db).ListAsync(
            user.Id, new ActivityQuery { Page = 2, PageSize = 5, Sort = "title" });

        Assert.Equal(5, result.Page!.Items.Count);
        Assert.Equal(DefaultActivities.All.Count, result.Page.Total);
    }

    [Fact]
    public async Task Paging_through_the_catalog_yields_every_row_exactly_once()
    {
        // The property a missing tiebreaker actually breaks - rows repeating or vanishing across
        // page boundaries - which a single-page assertion cannot see. Run against the sort most
        // likely to tie.
        using var db = TestDbContextFactory.Create();
        var (user, _) = await StockedHouseholdAsync(db);
        var service = new ActivityService(db);

        const int pageSize = 5;
        var seen = new List<int>();

        for (var page = 1; ; page++)
        {
            var result = await service.ListAsync(
                user.Id, new ActivityQuery { Sort = "points", Page = page, PageSize = pageSize });

            if (result.Page!.Items.Count == 0)
            {
                break;
            }

            seen.AddRange(result.Page.Items.Select(i => i.Id));
        }

        var expected = await db.Activities.Select(a => a.Id).ToListAsync();
        Assert.Equal(expected.Count, seen.Count);
        Assert.Equal(expected.Count, seen.Distinct().Count());
        Assert.Equal(expected.OrderBy(i => i), seen.OrderBy(i => i));
    }

    [Fact]
    public async Task ListAsync_caps_page_size_even_when_far_more_rows_exist()
    {
        // Seeds well past MaxPageSize on purpose. Asserting the cap against the twelve-row default
        // catalog is vacuous - a request for 100,000 returns twelve whether or not a cap exists -
        // and mutation testing caught exactly that.
        using var db = TestDbContextFactory.Create();
        var (user, household) = await StockedHouseholdAsync(db);

        db.Activities.AddRange(Enumerable.Range(0, ActivityService.MaxPageSize + 50).Select(i => new Activity
        {
            HouseholdId = household.Id,
            Title = $"Filler chore {i:D3}",
            Points = 5,
            Category = ActivityCategory.Chore
        }));
        await db.SaveChangesAsync();

        var huge = await new ActivityService(db).ListAsync(user.Id, new ActivityQuery { PageSize = 100_000 });

        Assert.Equal(ActivityService.MaxPageSize, huge.Page!.Items.Count);
        Assert.True(huge.Page.Total > ActivityService.MaxPageSize, "total should report every match");
    }

    [Fact]
    public async Task ListAsync_clamps_a_page_below_one_to_the_first_page()
    {
        using var db = TestDbContextFactory.Create();
        var (user, _) = await StockedHouseholdAsync(db);
        var service = new ActivityService(db);

        var firstPage = await service.ListAsync(user.Id, new ActivityQuery { Sort = "title", PageSize = 3, Page = 1 });
        var zeroPage = await service.ListAsync(user.Id, new ActivityQuery { Sort = "title", PageSize = 3, Page = 0 });

        Assert.Equal(firstPage.Page!.Items.Select(i => i.Id), zeroPage.Page!.Items.Select(i => i.Id));
    }

    [Fact]
    public async Task ListAsync_filters_by_category()
    {
        using var db = TestDbContextFactory.Create();
        var (user, household) = await StockedHouseholdAsync(db);

        // v1's enum has one member, so filtering by Chore against a Chore-only catalog is a no-op
        // and a test written that way proves nothing - mutation testing confirmed it survived the
        // filter being deleted entirely.
        //
        // A row with an out-of-range enum value gives the filter something to exclude. The column
        // is stored as a string, so this persists as "99" and the Chore filter must skip it. The
        // row is deliberately unreachable through the API; it exists only so this assertion can
        // fail when the filter stops narrowing.
        db.Activities.Add(new Activity
        {
            HouseholdId = household.Id,
            Title = "Not a chore",
            Points = 5,
            Category = (ActivityCategory)99
        });
        await db.SaveChangesAsync();

        var all = await new ActivityService(db).ListAsync(user.Id, new ActivityQuery { PageSize = 200 });
        var chores = await new ActivityService(db).ListAsync(
            user.Id, new ActivityQuery { Category = ActivityCategory.Chore, PageSize = 200 });

        Assert.Equal(DefaultActivities.All.Count + 1, all.Page!.Total);
        Assert.Equal(DefaultActivities.All.Count, chores.Page!.Total);
        Assert.DoesNotContain(chores.Page.Items, i => i.Title == "Not a chore");
    }
}
