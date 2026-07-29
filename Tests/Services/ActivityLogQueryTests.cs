using API.Data;
using API.Dtos.Activities;
using API.Dtos.ActivityLogs;
using API.Entities;
using API.Services;
using Microsoft.EntityFrameworkCore;

namespace Dwelloot.Tests.Services;

public class ActivityLogQueryTests
{
    private static HouseholdService HouseholdsFor(AppDbContext db) =>
        new(db, new DefaultCatalogCopier(db), new InviteCodeGenerator());

    private static async Task<User> AddUserAsync(AppDbContext db, string email)
    {
        var user = new User { Name = email.Split('@')[0], Email = email, UserName = email };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        return user;
    }

    /// <summary>A household with both partners, which is what the exclusion rule needs to be testable.</summary>
    private static async Task<(User Alex, User Sam, Household Household)> PairedHouseholdAsync(
        AppDbContext db,
        string prefix = "")
    {
        var alex = await AddUserAsync(db, $"{prefix}alex@example.com");
        var sam = await AddUserAsync(db, $"{prefix}sam@example.com");

        var created = await HouseholdsFor(db).CreateAsync(alex.Id, "Our place");
        await HouseholdsFor(db).JoinAsync(sam.Id, created.Household!.InviteCode);

        return (alex, sam, created.Household);
    }

    private static Task<Activity> ChoreAsync(AppDbContext db, int householdId, string title = "Vacuum") =>
        db.Activities.SingleAsync(a => a.HouseholdId == householdId && a.Title == title);

    private static async Task<int> LogAsync(AppDbContext db, int userId, int activityId)
    {
        var result = await new ActivityLogService(db).CreateAsync(userId, activityId);
        return result.Log!.Id;
    }

    private static async Task SetStatusAsync(AppDbContext db, int logId, ActivityLogStatus status)
    {
        var log = await db.ActivityLogs.SingleAsync(l => l.Id == logId);
        log.Status = status;
        await db.SaveChangesAsync();
    }

    [Fact]
    public async Task Queue_returns_the_partners_pending_logs_with_the_title_resolved()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var chore = await ChoreAsync(db, household.Id);
        var samsLog = await LogAsync(db, sam.Id, chore.Id);

        var result = await new ActivityLogService(db).ListForApprovalAsync(
            alex.Id, new ActivityLogQuery { Status = ActivityLogStatus.Pending });

        Assert.Equal(ActivityLogStatusCode.Ok, result.Status);
        var item = Assert.Single(result.Page!.Items);
        Assert.Equal(samsLog, item.Id);
        Assert.Equal("Vacuum", item.ActivityTitle);
        Assert.Equal(sam.Id, item.LoggedByUserId);
    }

    [Fact]
    public async Task Queue_never_returns_the_callers_own_logs()
    {
        // The headline rule, and the reason this fixture needs two real users: a single-user test
        // cannot tell "excludes mine" from "returns nothing".
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var chore = await ChoreAsync(db, household.Id);

        var alexsLog = await LogAsync(db, alex.Id, chore.Id);
        var samsLog = await LogAsync(db, sam.Id, chore.Id);

        var service = new ActivityLogService(db);
        var forAlex = await service.ListForApprovalAsync(alex.Id, new ActivityLogQuery());
        var forSam = await service.ListForApprovalAsync(sam.Id, new ActivityLogQuery());

        // Each sees exactly the other's log, and never their own.
        Assert.Equal([samsLog], forAlex.Page!.Items.Select(i => i.Id));
        Assert.Equal([alexsLog], forSam.Page!.Items.Select(i => i.Id));
    }

    [Fact]
    public async Task Queue_never_returns_another_households_logs()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, _, household) = await PairedHouseholdAsync(db);
        var (_, otherSam, otherHousehold) = await PairedHouseholdAsync(db, "other-");

        await LogAsync(db, otherSam.Id, (await ChoreAsync(db, otherHousehold.Id)).Id);

        var result = await new ActivityLogService(db).ListForApprovalAsync(alex.Id, new ActivityLogQuery());

        Assert.Empty(result.Page!.Items);
        Assert.Equal(0, result.Page.Total);
        Assert.NotEqual(household.Id, otherHousehold.Id);
    }

    [Fact]
    public async Task Queue_filters_by_status()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var chore = await ChoreAsync(db, household.Id);

        var pending = await LogAsync(db, sam.Id, chore.Id);
        var approved = await LogAsync(db, sam.Id, chore.Id);
        await SetStatusAsync(db, approved, ActivityLogStatus.Approved);

        var result = await new ActivityLogService(db).ListForApprovalAsync(
            alex.Id, new ActivityLogQuery { Status = ActivityLogStatus.Pending });

        Assert.Equal([pending], result.Page!.Items.Select(i => i.Id));
    }

    [Fact]
    public async Task Queue_without_a_status_returns_every_status()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var chore = await ChoreAsync(db, household.Id);

        await LogAsync(db, sam.Id, chore.Id);
        await SetStatusAsync(db, await LogAsync(db, sam.Id, chore.Id), ActivityLogStatus.Approved);
        await SetStatusAsync(db, await LogAsync(db, sam.Id, chore.Id), ActivityLogStatus.Rejected);

        var result = await new ActivityLogService(db).ListForApprovalAsync(alex.Id, new ActivityLogQuery());

        Assert.Equal(3, result.Page!.Total);
        Assert.Equal(3, result.Page.Items.Select(i => i.Status).Distinct().Count());
    }

    [Fact]
    public async Task Queue_still_shows_logs_whose_chore_has_been_archived()
    {
        // The case the obvious implementation drops - joining to activities and filtering
        // ArchivedAt == null, as the catalog endpoints do. The work was done before the chore was
        // removed; refusing to approve it would destroy the partner's points for an unrelated
        // reason.
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var chore = await ChoreAsync(db, household.Id);
        var samsLog = await LogAsync(db, sam.Id, chore.Id);

        await new ActivityService(db).DeleteAsync(alex.Id, chore.Id);

        var result = await new ActivityLogService(db).ListForApprovalAsync(
            alex.Id, new ActivityLogQuery { Status = ActivityLogStatus.Pending });

        var item = Assert.Single(result.Page!.Items);
        Assert.Equal(samsLog, item.Id);
        Assert.Equal("Vacuum", item.ActivityTitle);
    }

    [Fact]
    public async Task Queue_reports_the_snapshotted_points_not_the_chores_current_points()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var chore = await ChoreAsync(db, household.Id);
        var originalPoints = chore.Points;

        await LogAsync(db, sam.Id, chore.Id);
        await new ActivityService(db).UpdateAsync(alex.Id, chore.Id, new PatchActivityRequest(null, 999, null));

        var result = await new ActivityLogService(db).ListForApprovalAsync(alex.Id, new ActivityLogQuery());

        // Would fail if the projection read l.Activity.Points instead of l.PointsAwarded.
        Assert.Equal(originalPoints, Assert.Single(result.Page!.Items).PointsAwarded);
    }

    [Fact]
    public async Task Queue_orders_newest_first()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var chore = await ChoreAsync(db, household.Id);

        var ids = new List<int>();
        for (var i = 0; i < 5; i++)
        {
            ids.Add(await LogAsync(db, sam.Id, chore.Id));
        }

        var result = await new ActivityLogService(db).ListForApprovalAsync(
            alex.Id, new ActivityLogQuery { PageSize = 100 });

        var returned = result.Page!.Items.Select(i => i.Id).ToList();
        Assert.Equal(returned.OrderByDescending(i => i), returned);
        Assert.Equal(ids.Last(), returned.First());
    }

    [Fact]
    public async Task Paging_the_queue_covers_every_row_exactly_once()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var chore = await ChoreAsync(db, household.Id);

        for (var i = 0; i < 7; i++)
        {
            await LogAsync(db, sam.Id, chore.Id);
        }

        var service = new ActivityLogService(db);
        var seen = new List<int>();

        for (var page = 1; ; page++)
        {
            var result = await service.ListForApprovalAsync(alex.Id, new ActivityLogQuery { Page = page, PageSize = 3 });
            if (result.Page!.Items.Count == 0)
            {
                break;
            }

            seen.AddRange(result.Page.Items.Select(i => i.Id));
        }

        Assert.Equal(7, seen.Count);
        Assert.Equal(7, seen.Distinct().Count());
    }

    [Fact]
    public async Task Queue_caps_page_size()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var chore = await ChoreAsync(db, household.Id);

        for (var i = 0; i < ActivityService.MaxPageSize + 20; i++)
        {
            await LogAsync(db, sam.Id, chore.Id);
        }

        var result = await new ActivityLogService(db).ListForApprovalAsync(
            alex.Id, new ActivityLogQuery { PageSize = 100_000 });

        Assert.Equal(ActivityService.MaxPageSize, result.Page!.Items.Count);
        Assert.True(result.Page.Total > ActivityService.MaxPageSize);
    }

    [Fact]
    public async Task Queue_rejects_a_caller_with_no_household()
    {
        using var db = TestDbContextFactory.Create();
        var loner = await AddUserAsync(db, "loner@example.com");

        var result = await new ActivityLogService(db).ListForApprovalAsync(loner.Id, new ActivityLogQuery());

        Assert.Equal(ActivityLogStatusCode.NoHousehold, result.Status);
        Assert.Null(result.Page);
    }
}
