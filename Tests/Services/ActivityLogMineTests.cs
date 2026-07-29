using API.Data;
using API.Dtos.ActivityLogs;
using API.Entities;
using API.Services;
using API.Services.Progression;
using Microsoft.EntityFrameworkCore;

namespace Dwelloot.Tests.Services;

public class ActivityLogMineTests
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

    private static async Task<int> LogAsync(AppDbContext db, int userId, int activityId) =>
        (await new ActivityLogService(db, new ProgressionService(db)).CreateAsync(userId, activityId)).Log!.Id;

    [Fact]
    public async Task Mine_returns_the_callers_own_logs_and_never_the_partners()
    {
        // The exact inverse of task [20]'s queue. Asserting both directions is what makes each
        // meaningful - either alone would pass against an endpoint returning nothing.
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var chore = await ChoreAsync(db, household.Id);

        var alexsLog = await LogAsync(db, alex.Id, chore.Id);
        var samsLog = await LogAsync(db, sam.Id, chore.Id);

        var service = new ActivityLogService(db, new ProgressionService(db));
        var alexsHistory = await service.ListMineAsync(alex.Id, new MyActivityLogQuery());
        var samsHistory = await service.ListMineAsync(sam.Id, new MyActivityLogQuery());

        Assert.Equal([alexsLog], alexsHistory.Page!.Items.Select(i => i.Id));
        Assert.Equal([samsLog], samsHistory.Page!.Items.Select(i => i.Id));
    }

    [Fact]
    public async Task Mine_is_the_complement_of_the_approval_queue()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var chore = await ChoreAsync(db, household.Id);

        var alexsLog = await LogAsync(db, alex.Id, chore.Id);
        var samsLog = await LogAsync(db, sam.Id, chore.Id);

        var service = new ActivityLogService(db, new ProgressionService(db));
        var mine = await service.ListMineAsync(alex.Id, new MyActivityLogQuery());
        var queue = await service.ListForApprovalAsync(alex.Id, new ActivityLogQuery());

        Assert.Equal([alexsLog], mine.Page!.Items.Select(i => i.Id));
        Assert.Equal([samsLog], queue.Page!.Items.Select(i => i.Id));
        Assert.Empty(mine.Page.Items.Select(i => i.Id).Intersect(queue.Page.Items.Select(i => i.Id)));
    }

    [Fact]
    public async Task Mine_returns_every_status_by_default()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var chore = await ChoreAsync(db, household.Id);
        var service = new ActivityLogService(db, new ProgressionService(db));

        await LogAsync(db, sam.Id, chore.Id);
        await service.ApproveAsync(alex.Id, await LogAsync(db, sam.Id, chore.Id));
        await service.RejectAsync(alex.Id, await LogAsync(db, sam.Id, chore.Id), "Not done");

        var result = await service.ListMineAsync(sam.Id, new MyActivityLogQuery());

        Assert.Equal(3, result.Page!.Total);
        Assert.Equal(3, result.Page.Items.Select(i => i.Status).Distinct().Count());
    }

    [Fact]
    public async Task Mine_filters_by_status()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var chore = await ChoreAsync(db, household.Id);
        var service = new ActivityLogService(db, new ProgressionService(db));

        await LogAsync(db, sam.Id, chore.Id);
        var approved = await LogAsync(db, sam.Id, chore.Id);
        await service.ApproveAsync(alex.Id, approved);

        var result = await service.ListMineAsync(
            sam.Id, new MyActivityLogQuery { Status = ActivityLogStatus.Approved });

        Assert.Equal([approved], result.Page!.Items.Select(i => i.Id));
    }

    [Fact]
    public async Task Take_limits_the_result_but_total_reports_everything()
    {
        using var db = TestDbContextFactory.Create();
        var (_, sam, household) = await PairedHouseholdAsync(db);
        var chore = await ChoreAsync(db, household.Id);

        for (var i = 0; i < 8; i++)
        {
            await LogAsync(db, sam.Id, chore.Id);
        }

        var result = await new ActivityLogService(db, new ProgressionService(db)).ListMineAsync(sam.Id, new MyActivityLogQuery { Take = 5 });

        Assert.Equal(5, result.Page!.Items.Count);
        Assert.Equal(8, result.Page.Total);
    }

    [Fact]
    public async Task PageSize_wins_when_both_take_and_pageSize_are_supplied()
    {
        using var db = TestDbContextFactory.Create();
        var (_, sam, household) = await PairedHouseholdAsync(db);
        var chore = await ChoreAsync(db, household.Id);

        for (var i = 0; i < 8; i++)
        {
            await LogAsync(db, sam.Id, chore.Id);
        }

        var result = await new ActivityLogService(db, new ProgressionService(db)).ListMineAsync(
            sam.Id, new MyActivityLogQuery { Take = 5, PageSize = 2 });

        Assert.Equal(2, result.Page!.Items.Count);
    }

    [Fact]
    public async Task Mine_orders_newest_first()
    {
        using var db = TestDbContextFactory.Create();
        var (_, sam, household) = await PairedHouseholdAsync(db);
        var chore = await ChoreAsync(db, household.Id);

        var ids = new List<int>();
        for (var i = 0; i < 4; i++)
        {
            ids.Add(await LogAsync(db, sam.Id, chore.Id));
        }

        var result = await new ActivityLogService(db, new ProgressionService(db)).ListMineAsync(sam.Id, new MyActivityLogQuery());

        var returned = result.Page!.Items.Select(i => i.Id).ToList();
        Assert.Equal(returned.OrderByDescending(i => i), returned);
        Assert.Equal(ids.Last(), returned.First());
    }

    [Fact]
    public async Task A_rejected_log_carries_its_reject_reason()
    {
        // Task [21] made the reason mandatory on input and nothing could read it back. This is
        // where the user needs it, so a required field stops being ceremony.
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var logId = await LogAsync(db, sam.Id, (await ChoreAsync(db, household.Id)).Id);

        await new ActivityLogService(db, new ProgressionService(db)).RejectAsync(alex.Id, logId, "Not actually done yet");

        var result = await new ActivityLogService(db, new ProgressionService(db)).ListMineAsync(sam.Id, new MyActivityLogQuery());

        var item = Assert.Single(result.Page!.Items);
        Assert.Equal(ActivityLogStatus.Rejected, item.Status);
        Assert.Equal("Not actually done yet", item.RejectReason);
        Assert.Null(item.ApprovedAt);
    }

    [Fact]
    public async Task An_approved_log_carries_approvedAt_and_a_pending_one_does_not()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var chore = await ChoreAsync(db, household.Id);
        var service = new ActivityLogService(db, new ProgressionService(db));

        var pending = await LogAsync(db, sam.Id, chore.Id);
        var approved = await LogAsync(db, sam.Id, chore.Id);
        await service.ApproveAsync(alex.Id, approved);

        var result = await service.ListMineAsync(sam.Id, new MyActivityLogQuery());

        Assert.NotNull(result.Page!.Items.Single(i => i.Id == approved).ApprovedAt);
        Assert.Null(result.Page.Items.Single(i => i.Id == pending).ApprovedAt);
        Assert.Null(result.Page.Items.Single(i => i.Id == pending).RejectReason);
    }

    [Fact]
    public async Task Logs_of_an_archived_chore_still_appear()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var chore = await ChoreAsync(db, household.Id);
        var logId = await LogAsync(db, sam.Id, chore.Id);

        await new ActivityService(db).DeleteAsync(alex.Id, chore.Id);

        var result = await new ActivityLogService(db, new ProgressionService(db)).ListMineAsync(sam.Id, new MyActivityLogQuery());

        var item = Assert.Single(result.Page!.Items);
        Assert.Equal(logId, item.Id);
        Assert.Equal("Vacuum", item.ActivityTitle);
    }

    [Fact]
    public async Task Logs_from_a_previous_household_are_excluded()
    {
        // The left-and-rejoined case. Nothing leaks - it is all the caller's own data - but "my
        // history" should mean "my history here".
        using var db = TestDbContextFactory.Create();
        var (alex, sam, oldHousehold) = await PairedHouseholdAsync(db);
        var oldLog = await LogAsync(db, sam.Id, (await ChoreAsync(db, oldHousehold.Id)).Id);

        await HouseholdsFor(db).LeaveAsync(sam.Id, oldHousehold.Id);

        var newOwner = await AddUserAsync(db, "newowner@example.com");
        var created = await HouseholdsFor(db).CreateAsync(newOwner.Id, "New place");
        await HouseholdsFor(db).JoinAsync(sam.Id, created.Household!.InviteCode);

        var newLog = await LogAsync(db, sam.Id, (await ChoreAsync(db, created.Household.Id)).Id);

        var result = await new ActivityLogService(db, new ProgressionService(db)).ListMineAsync(sam.Id, new MyActivityLogQuery());

        Assert.Equal([newLog], result.Page!.Items.Select(i => i.Id));
        Assert.DoesNotContain(result.Page.Items, i => i.Id == oldLog);
        Assert.NotEqual(0, alex.Id);
    }

    [Fact]
    public async Task Mine_rejects_a_caller_with_no_household()
    {
        using var db = TestDbContextFactory.Create();
        var loner = await AddUserAsync(db, "loner@example.com");

        var result = await new ActivityLogService(db, new ProgressionService(db)).ListMineAsync(loner.Id, new MyActivityLogQuery());

        Assert.Equal(ActivityLogStatusCode.NoHousehold, result.Status);
        Assert.Null(result.Page);
    }
}
