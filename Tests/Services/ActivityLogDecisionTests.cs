using API.Data;
using API.Dtos.Activities;
using API.Dtos.ActivityLogs;
using API.Entities;
using API.Services;
using Microsoft.EntityFrameworkCore;

namespace Dwelloot.Tests.Services;

public class ActivityLogDecisionTests
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
        (await new ActivityLogService(db).CreateAsync(userId, activityId)).Log!.Id;

    private static Task<int> PointsOfAsync(AppDbContext db, int userId) =>
        db.Users.Where(u => u.Id == userId).Select(u => u.LifetimePoints).SingleAsync();

    // ---------- approve ----------

    [Fact]
    public async Task ApproveAsync_records_the_decision()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var logId = await LogAsync(db, sam.Id, (await ChoreAsync(db, household.Id)).Id);

        var before = DateTime.UtcNow.AddSeconds(-5);
        var result = await new ActivityLogService(db).ApproveAsync(alex.Id, logId);

        Assert.Equal(ActivityLogStatusCode.Ok, result.Status);
        Assert.Equal(ActivityLogStatus.Approved, result.Log!.Status);

        var saved = await db.ActivityLogs.SingleAsync(l => l.Id == logId);
        Assert.Equal(alex.Id, saved.ApprovedByUserId);
        Assert.NotNull(saved.ApprovedAt);
        Assert.InRange(saved.ApprovedAt!.Value, before, DateTime.UtcNow.AddSeconds(5));
    }

    [Fact]
    public async Task ApproveAsync_credits_the_logger_and_not_the_approver()
    {
        // Both assertions are needed. Crediting the approver would still increase "someone's"
        // points, so checking only that the total moved would pass on the wrong person.
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var chore = await ChoreAsync(db, household.Id);
        var logId = await LogAsync(db, sam.Id, chore.Id);

        await new ActivityLogService(db).ApproveAsync(alex.Id, logId);

        Assert.Equal(chore.Points, await PointsOfAsync(db, sam.Id));
        Assert.Equal(0, await PointsOfAsync(db, alex.Id));
    }

    [Fact]
    public async Task ApproveAsync_credits_the_snapshot_not_the_chores_current_points()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var chore = await ChoreAsync(db, household.Id);
        var originalPoints = chore.Points;
        var logId = await LogAsync(db, sam.Id, chore.Id);

        await new ActivityService(db).UpdateAsync(alex.Id, chore.Id, new PatchActivityRequest(null, 999, null));
        await new ActivityLogService(db).ApproveAsync(alex.Id, logId);

        Assert.Equal(originalPoints, await PointsOfAsync(db, sam.Id));
    }

    [Fact]
    public async Task A_partner_cannot_approve_their_own_log()
    {
        // The rule the whole competition rests on.
        using var db = TestDbContextFactory.Create();
        var (_, sam, household) = await PairedHouseholdAsync(db);
        var logId = await LogAsync(db, sam.Id, (await ChoreAsync(db, household.Id)).Id);

        var result = await new ActivityLogService(db).ApproveAsync(sam.Id, logId);

        Assert.Equal(ActivityLogStatusCode.SelfApproval, result.Status);

        var saved = await db.ActivityLogs.SingleAsync(l => l.Id == logId);
        Assert.Equal(ActivityLogStatus.Pending, saved.Status);
        Assert.Null(saved.ApprovedByUserId);
        Assert.Equal(0, await PointsOfAsync(db, sam.Id));
    }

    [Fact]
    public async Task Another_households_log_is_not_found()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, _, _) = await PairedHouseholdAsync(db);
        var (_, otherSam, otherHousehold) = await PairedHouseholdAsync(db, "other-");
        var theirLog = await LogAsync(db, otherSam.Id, (await ChoreAsync(db, otherHousehold.Id)).Id);

        var result = await new ActivityLogService(db).ApproveAsync(alex.Id, theirLog);

        Assert.Equal(ActivityLogStatusCode.LogNotFound, result.Status);
        Assert.Equal(ActivityLogStatus.Pending, (await db.ActivityLogs.SingleAsync(l => l.Id == theirLog)).Status);
    }

    [Fact]
    public async Task Approving_twice_awards_the_points_once()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var chore = await ChoreAsync(db, household.Id);
        var logId = await LogAsync(db, sam.Id, chore.Id);
        var service = new ActivityLogService(db);

        var first = await service.ApproveAsync(alex.Id, logId);
        var second = await service.ApproveAsync(alex.Id, logId);

        Assert.Equal(ActivityLogStatusCode.Ok, first.Status);
        Assert.Equal(ActivityLogStatusCode.NotPending, second.Status);
        Assert.Equal(chore.Points, await PointsOfAsync(db, sam.Id));
    }

    [Fact]
    public async Task A_rejected_log_cannot_then_be_approved()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var logId = await LogAsync(db, sam.Id, (await ChoreAsync(db, household.Id)).Id);
        var service = new ActivityLogService(db);

        await service.RejectAsync(alex.Id, logId, "Not done yet");
        var result = await service.ApproveAsync(alex.Id, logId);

        Assert.Equal(ActivityLogStatusCode.NotPending, result.Status);
        Assert.Equal(0, await PointsOfAsync(db, sam.Id));
    }

    [Fact]
    public async Task A_log_whose_chore_was_archived_can_still_be_approved()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var chore = await ChoreAsync(db, household.Id);
        var logId = await LogAsync(db, sam.Id, chore.Id);

        await new ActivityService(db).DeleteAsync(alex.Id, chore.Id);

        var result = await new ActivityLogService(db).ApproveAsync(alex.Id, logId);

        Assert.Equal(ActivityLogStatusCode.Ok, result.Status);
        Assert.Equal(chore.Points, await PointsOfAsync(db, sam.Id));
    }

    // ---------- reject ----------

    [Fact]
    public async Task RejectAsync_records_the_reason_and_awards_nothing()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var logId = await LogAsync(db, sam.Id, (await ChoreAsync(db, household.Id)).Id);

        var result = await new ActivityLogService(db).RejectAsync(alex.Id, logId, "Not actually done yet");

        Assert.Equal(ActivityLogStatusCode.Ok, result.Status);
        Assert.Equal(ActivityLogStatus.Rejected, result.Log!.Status);
        Assert.Null(result.Log.ApprovedAt);

        var saved = await db.ActivityLogs.SingleAsync(l => l.Id == logId);
        Assert.Equal("Not actually done yet", saved.RejectReason);
        Assert.Equal(0, await PointsOfAsync(db, sam.Id));
    }

    [Fact]
    public async Task RejectAsync_leaves_ApprovedByUserId_null()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var logId = await LogAsync(db, sam.Id, (await ChoreAsync(db, household.Id)).Id);

        await new ActivityLogService(db).RejectAsync(alex.Id, logId, "Nope");

        var saved = await db.ActivityLogs.SingleAsync(l => l.Id == logId);
        Assert.Null(saved.ApprovedByUserId);
        Assert.Null(saved.ApprovedAt);
    }

    [Fact]
    public async Task A_partner_cannot_reject_their_own_log()
    {
        using var db = TestDbContextFactory.Create();
        var (_, sam, household) = await PairedHouseholdAsync(db);
        var logId = await LogAsync(db, sam.Id, (await ChoreAsync(db, household.Id)).Id);

        var result = await new ActivityLogService(db).RejectAsync(sam.Id, logId, "Changed my mind");

        Assert.Equal(ActivityLogStatusCode.SelfApproval, result.Status);
        Assert.Equal(ActivityLogStatus.Pending, (await db.ActivityLogs.SingleAsync(l => l.Id == logId)).Status);
    }

    [Fact]
    public async Task An_already_decided_log_cannot_be_rejected()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var chore = await ChoreAsync(db, household.Id);
        var logId = await LogAsync(db, sam.Id, chore.Id);
        var service = new ActivityLogService(db);

        await service.ApproveAsync(alex.Id, logId);
        var result = await service.RejectAsync(alex.Id, logId, "Actually no");

        Assert.Equal(ActivityLogStatusCode.NotPending, result.Status);

        // The approval stands, points included.
        var saved = await db.ActivityLogs.SingleAsync(l => l.Id == logId);
        Assert.Equal(ActivityLogStatus.Approved, saved.Status);
        Assert.Equal(chore.Points, await PointsOfAsync(db, sam.Id));
    }

    [Fact]
    public async Task Approving_removes_the_log_from_the_partners_queue()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var logId = await LogAsync(db, sam.Id, (await ChoreAsync(db, household.Id)).Id);
        var service = new ActivityLogService(db);

        await service.ApproveAsync(alex.Id, logId);

        var queue = await service.ListForApprovalAsync(
            alex.Id, new ActivityLogQuery { Status = ActivityLogStatus.Pending });

        Assert.Empty(queue.Page!.Items);
    }
}
