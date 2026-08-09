using API.Data;
using API.Dtos.ActivityLogs;
using API.Entities;
using API.Services;
using API.Services.Progression;
using Microsoft.EntityFrameworkCore;

namespace Dwelloot.Tests.Services;

public class ActivityLogBulkApproveTests
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

    private static Task<Activity> ChoreAsync(AppDbContext db, int householdId, string title) =>
        db.Activities.SingleAsync(a => a.HouseholdId == householdId && a.Title == title);

    private static async Task<int> LogAsync(AppDbContext db, int userId, int activityId) =>
        (await new ActivityLogService(db, new ProgressionService(db)).CreateAsync(userId, activityId)).Log!.Id;

    private static Task<int> PointsOfAsync(AppDbContext db, int userId) =>
        db.Users.Where(u => u.Id == userId).Select(u => u.LifetimePoints).SingleAsync();

    [Fact]
    public async Task BulkApprove_approves_several_and_returns_their_ids()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var vacuum = await ChoreAsync(db, household.Id, "Vacuum");
        var dishes = await ChoreAsync(db, household.Id, "Wash dishes");

        var a = await LogAsync(db, sam.Id, vacuum.Id);
        var b = await LogAsync(db, sam.Id, dishes.Id);

        var result = await new ActivityLogService(db, new ProgressionService(db)).BulkApproveAsync(alex.Id, [a, b]);

        Assert.Equal(ActivityLogStatusCode.Ok, result.Status);
        Assert.Equal([a, b], result.Response!.Approved);
        Assert.Empty(result.Response.Skipped);

        var saved = await db.ActivityLogs.Where(l => l.Id == a || l.Id == b).ToListAsync();
        Assert.All(saved, l => Assert.Equal(ActivityLogStatus.Approved, l.Status));
        Assert.All(saved, l => Assert.Equal(alex.Id, l.ApprovedByUserId));
    }

    [Fact]
    public async Task BulkApprove_awards_the_sum_of_their_points_exactly_once()
    {
        // Two different chores, so a bug that awarded one chore's points twice, or awarded the
        // last one's for all, shows up as a wrong total rather than a coincidentally right one.
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var vacuum = await ChoreAsync(db, household.Id, "Vacuum");
        var dishes = await ChoreAsync(db, household.Id, "Wash dishes");
        Assert.NotEqual(vacuum.Points, dishes.Points);

        var a = await LogAsync(db, sam.Id, vacuum.Id);
        var b = await LogAsync(db, sam.Id, dishes.Id);

        await new ActivityLogService(db, new ProgressionService(db)).BulkApproveAsync(alex.Id, [a, b]);

        Assert.Equal(vacuum.Points + dishes.Points, await PointsOfAsync(db, sam.Id));
        Assert.Equal(0, await PointsOfAsync(db, alex.Id));
    }

    [Fact]
    public async Task BulkApprove_skips_the_callers_own_log_and_approves_the_rest()
    {
        // The mixed batch is the whole point of best-effort.
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var vacuum = await ChoreAsync(db, household.Id, "Vacuum");

        var samsLog = await LogAsync(db, sam.Id, vacuum.Id);
        var alexsOwn = await LogAsync(db, alex.Id, vacuum.Id);

        var result = await new ActivityLogService(db, new ProgressionService(db)).BulkApproveAsync(alex.Id, [samsLog, alexsOwn]);

        Assert.Equal([samsLog], result.Response!.Approved);
        var skipped = Assert.Single(result.Response.Skipped);
        Assert.Equal(alexsOwn, skipped.Id);
        Assert.Equal(nameof(ActivityLogStatusCode.SelfApproval), skipped.Reason);

        Assert.Equal(ActivityLogStatus.Pending, (await db.ActivityLogs.SingleAsync(l => l.Id == alexsOwn)).Status);
        Assert.Equal(vacuum.Points, await PointsOfAsync(db, sam.Id));
    }

    [Fact]
    public async Task BulkApprove_skips_already_decided_logs_without_re_awarding()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var vacuum = await ChoreAsync(db, household.Id, "Vacuum");
        var service = new ActivityLogService(db, new ProgressionService(db));

        var already = await LogAsync(db, sam.Id, vacuum.Id);
        var fresh = await LogAsync(db, sam.Id, vacuum.Id);
        await service.ApproveAsync(alex.Id, already);

        var result = await service.BulkApproveAsync(alex.Id, [already, fresh]);

        Assert.Equal([fresh], result.Response!.Approved);
        Assert.Equal(nameof(ActivityLogStatusCode.NotPending), Assert.Single(result.Response.Skipped).Reason);
        Assert.Equal(vacuum.Points * 2, await PointsOfAsync(db, sam.Id));
    }

    [Fact]
    public async Task BulkApprove_skips_another_households_logs_which_stay_pending()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var (_, otherSam, otherHousehold) = await PairedHouseholdAsync(db, "other-");

        var mine = await LogAsync(db, sam.Id, (await ChoreAsync(db, household.Id, "Vacuum")).Id);
        var theirs = await LogAsync(db, otherSam.Id, (await ChoreAsync(db, otherHousehold.Id, "Vacuum")).Id);

        var result = await new ActivityLogService(db, new ProgressionService(db)).BulkApproveAsync(alex.Id, [mine, theirs]);

        Assert.Equal([mine], result.Response!.Approved);
        var skipped = Assert.Single(result.Response.Skipped);
        Assert.Equal(theirs, skipped.Id);
        Assert.Equal(nameof(ActivityLogStatusCode.LogNotFound), skipped.Reason);

        Assert.Equal(ActivityLogStatus.Pending, (await db.ActivityLogs.SingleAsync(l => l.Id == theirs)).Status);
        Assert.Equal(0, await PointsOfAsync(db, otherSam.Id));
    }

    [Fact]
    public async Task BulkApprove_collapses_duplicate_ids_and_awards_once()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var vacuum = await ChoreAsync(db, household.Id, "Vacuum");
        var logId = await LogAsync(db, sam.Id, vacuum.Id);

        var result = await new ActivityLogService(db, new ProgressionService(db)).BulkApproveAsync(alex.Id, [logId, logId, logId]);

        Assert.Equal([logId], result.Response!.Approved);
        Assert.Empty(result.Response.Skipped);
        Assert.Equal(vacuum.Points, await PointsOfAsync(db, sam.Id));
    }

    [Fact]
    public async Task BulkApprove_with_nothing_approvable_writes_nothing()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, _, household) = await PairedHouseholdAsync(db);
        var alexsOwn = await LogAsync(db, alex.Id, (await ChoreAsync(db, household.Id, "Vacuum")).Id);

        var result = await new ActivityLogService(db, new ProgressionService(db)).BulkApproveAsync(alex.Id, [alexsOwn, 999_999]);

        Assert.Equal(ActivityLogStatusCode.Ok, result.Status);
        Assert.Empty(result.Response!.Approved);
        Assert.Equal(2, result.Response.Skipped.Count);
        Assert.Equal(0, await PointsOfAsync(db, alex.Id));
        Assert.Equal(ActivityLogStatus.Pending, (await db.ActivityLogs.SingleAsync(l => l.Id == alexsOwn)).Status);
    }

    [Fact]
    public async Task BulkApprove_removes_the_approved_logs_from_the_pending_queue()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var vacuum = await ChoreAsync(db, household.Id, "Vacuum");

        var a = await LogAsync(db, sam.Id, vacuum.Id);
        var b = await LogAsync(db, sam.Id, vacuum.Id);

        var service = new ActivityLogService(db, new ProgressionService(db));
        await service.BulkApproveAsync(alex.Id, [a, b]);

        var queue = await service.ListForApprovalAsync(
            alex.Id, new ActivityLogQuery { Status = ActivityLogStatus.Pending });

        Assert.Empty(queue.Page!.Items);
    }

    [Fact]
    public async Task BulkApprove_rejects_a_caller_with_no_household()
    {
        using var db = TestDbContextFactory.Create();
        var loner = await AddUserAsync(db, "loner@example.com");

        var result = await new ActivityLogService(db, new ProgressionService(db)).BulkApproveAsync(loner.Id, [1, 2]);

        Assert.Equal(ActivityLogStatusCode.NoHousehold, result.Status);
        Assert.Null(result.Response);
    }

    [Fact]
    public void BulkApproveRequest_caps_the_batch_size()
    {
        // The cap lives on the request record, so this pins the constant rather than the binder.
        Assert.Equal(100, BulkApproveRequest.MaxIds);
    }
}
