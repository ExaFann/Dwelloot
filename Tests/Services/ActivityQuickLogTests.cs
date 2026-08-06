using API.Data;
using API.Data.Defaults;
using API.Dtos.Activities;
using API.Entities;
using API.Services;
using Microsoft.EntityFrameworkCore;

namespace Dwelloot.Tests.Services;

/// <summary>
/// Task [73] — choosing which chores appear on the dashboard's quick-log wall.
///
/// The wall was never a shortlist: it asked for the whole catalogue and rendered whatever came back,
/// capped only by the default page size. A household with thirty chores got thirty tiles and no way
/// to thin them. Owner's report.
/// </summary>
public class ActivityQuickLogTests
{
    private static async Task<User> AddUserAsync(AppDbContext db, string email)
    {
        var user = new User { Name = email.Split('@')[0], Email = email, UserName = email };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        return user;
    }

    private static async Task<(User User, Household Household)> StockedAsync(AppDbContext db)
    {
        var user = await AddUserAsync(db, "alex@example.com");
        var households = new HouseholdService(db, new DefaultCatalogCopier(db), new InviteCodeGenerator());
        var created = await households.CreateAsync(user.Id, "Our place");
        return (user, created.Household!);
    }

    private static ActivityService Service(AppDbContext db) => new(db);

    /// <summary>
    /// The migration backfills true, and the seeded catalogue inherits it. Anything else would empty
    /// the dashboard of every existing household the moment this deployed — a regression dressed as
    /// a feature.
    /// </summary>
    [Fact]
    public async Task Every_seeded_chore_starts_on_the_wall()
    {
        using var db = TestDbContextFactory.Create();
        var (_, household) = await StockedAsync(db);

        var all = await db.Activities.Where(a => a.HouseholdId == household.Id).ToListAsync();

        Assert.NotEmpty(all);
        Assert.All(all, a => Assert.True(a.IsQuick));
    }

    [Fact]
    public async Task A_newly_created_chore_starts_on_the_wall()
    {
        using var db = TestDbContextFactory.Create();
        var (user, _) = await StockedAsync(db);

        var result = await Service(db).CreateAsync(user.Id, new CreateActivityRequest("Water plants", 8, null));

        Assert.True(result.Activity!.IsQuick);
    }

    [Fact]
    public async Task A_chore_can_be_taken_off_the_wall_and_put_back()
    {
        using var db = TestDbContextFactory.Create();
        var (user, household) = await StockedAsync(db);
        var chore = await db.Activities.FirstAsync(a => a.HouseholdId == household.Id);

        var off = await Service(db).UpdateAsync(user.Id, chore.Id, new PatchActivityRequest(null, null, null, false));
        Assert.False(off.Activity!.IsQuick);
        Assert.False((await db.Activities.SingleAsync(a => a.Id == chore.Id)).IsQuick);

        // Both ways: a one-way flag would leave no route back onto the wall.
        var on = await Service(db).UpdateAsync(user.Id, chore.Id, new PatchActivityRequest(null, null, null, true));
        Assert.True(on.Activity!.IsQuick);
        Assert.True((await db.Activities.SingleAsync(a => a.Id == chore.Id)).IsQuick);
    }

    /// <summary>
    /// Null means "leave alone" — the whole point of PATCH. Without this, renaming a chore from the
    /// editor would silently drag it back onto the wall.
    /// </summary>
    [Fact]
    public async Task A_patch_that_omits_the_flag_leaves_it_alone()
    {
        using var db = TestDbContextFactory.Create();
        var (user, household) = await StockedAsync(db);
        var chore = await db.Activities.FirstAsync(a => a.HouseholdId == household.Id);
        await Service(db).UpdateAsync(user.Id, chore.Id, new PatchActivityRequest(null, null, null, false));

        await Service(db).UpdateAsync(user.Id, chore.Id, new PatchActivityRequest("Renamed", null, null));

        var stored = await db.Activities.SingleAsync(a => a.Id == chore.Id);
        Assert.Equal("Renamed", stored.Title);
        Assert.False(stored.IsQuick);
    }

    /// <summary>
    /// All three query states, because accepting <c>false</c> and then ignoring it would hand back
    /// the whole catalogue to a client that asked for the opposite — with nothing in the response to
    /// say the filter had been dropped. Same rule as <c>Affordable</c> on rewards.
    /// </summary>
    [Fact]
    public async Task The_filter_honours_true_false_and_absent()
    {
        using var db = TestDbContextFactory.Create();
        var (user, household) = await StockedAsync(db);
        var total = await db.Activities.CountAsync(a => a.HouseholdId == household.Id);
        var chore = await db.Activities.FirstAsync(a => a.HouseholdId == household.Id);
        await Service(db).UpdateAsync(user.Id, chore.Id, new PatchActivityRequest(null, null, null, false));

        var onWall = await Service(db).ListAsync(user.Id, new ActivityQuery { IsQuick = true, PageSize = 100 });
        var offWall = await Service(db).ListAsync(user.Id, new ActivityQuery { IsQuick = false, PageSize = 100 });
        var everything = await Service(db).ListAsync(user.Id, new ActivityQuery { PageSize = 100 });

        Assert.Equal(total - 1, onWall.Page!.Total);
        Assert.Equal(1, offWall.Page!.Total);
        Assert.Equal(total, everything.Page!.Total);
        // The one taken off is the one missing, not merely "one fewer".
        Assert.DoesNotContain(onWall.Page.Items, i => i.Id == chore.Id);
        Assert.Contains(offWall.Page.Items, i => i.Id == chore.Id);
    }

    /// <summary>The flag has to reach the client, or the Log tab cannot draw the toggle.</summary>
    [Fact]
    public async Task The_list_reports_the_flag_per_chore()
    {
        using var db = TestDbContextFactory.Create();
        var (user, household) = await StockedAsync(db);
        var chore = await db.Activities.FirstAsync(a => a.HouseholdId == household.Id);
        await Service(db).UpdateAsync(user.Id, chore.Id, new PatchActivityRequest(null, null, null, false));

        var page = await Service(db).ListAsync(user.Id, new ActivityQuery { PageSize = 100 });

        Assert.False(page.Page!.Items.Single(i => i.Id == chore.Id).IsQuick);
        Assert.Contains(page.Page.Items, i => i.Id != chore.Id && i.IsQuick);
    }

    /// <summary>
    /// Household-shared, not per-user: both partners see one wall. A per-device preference would let
    /// them disagree about what the household considers routine.
    /// </summary>
    [Fact]
    public async Task The_choice_is_shared_with_the_partner()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, household) = await StockedAsync(db);
        var sam = await AddUserAsync(db, "sam@example.com");
        var households = new HouseholdService(db, new DefaultCatalogCopier(db), new InviteCodeGenerator());
        await households.JoinAsync(sam.Id, household.InviteCode);

        var chore = await db.Activities.FirstAsync(a => a.HouseholdId == household.Id);
        await Service(db).UpdateAsync(alex.Id, chore.Id, new PatchActivityRequest(null, null, null, false));

        var samSees = await Service(db).ListAsync(sam.Id, new ActivityQuery { IsQuick = true, PageSize = 100 });

        Assert.DoesNotContain(samSees.Page!.Items, i => i.Id == chore.Id);
    }
}
