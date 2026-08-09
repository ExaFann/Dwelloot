using API.Data;
using API.Data.Defaults;
using API.Entities;
using API.Services;
using API.Services.Competitions;
using API.Services.Progression;
using Microsoft.EntityFrameworkCore;

namespace Dwelloot.Tests.Services;

/// <summary>
/// Task [71] — removing one of your own pending chores.
///
/// The endpoint whose absence shaped task [46]: with no way to unsend a log, "undo" had to mean
/// "not sent yet", which is what `useDeferredLog`'s five-second window is. After that window closed,
/// the only way back was asking the partner to reject you.
///
/// The rule is narrow on purpose, and the tests below are mostly about its edges: **your own, and
/// pending**. Everything else stays where it was.
/// </summary>
public class ActivityLogDeleteTests
{
    private static async Task<User> AddUserAsync(AppDbContext db, string email)
    {
        var user = new User { Name = email.Split('@')[0], Email = email, UserName = email };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        return user;
    }

    private static HouseholdService Households(AppDbContext db) =>
        new(db, new DefaultCatalogCopier(db), new InviteCodeGenerator());

    private static async Task<(User Alex, User Sam, Household Household)> PairedAsync(AppDbContext db)
    {
        var alex = await AddUserAsync(db, "alex@example.com");
        var created = await Households(db).CreateAsync(alex.Id, "Our place");
        var sam = await AddUserAsync(db, "sam@example.com");
        await Households(db).JoinAsync(sam.Id, created.Household!.InviteCode);
        return (alex, sam, created.Household);
    }

    private static async Task<ActivityLog> LogAsync(
        AppDbContext db, int householdId, int userId, ActivityLogStatus status = ActivityLogStatus.Pending)
    {
        var activity = await db.Activities.FirstAsync(a => a.HouseholdId == householdId);
        var log = new ActivityLog
        {
            ActivityId = activity.Id,
            LoggedByUserId = userId,
            PointsAwarded = activity.Points,
            Status = status,
            CompletedAt = DateTime.UtcNow
        };
        db.ActivityLogs.Add(log);
        await db.SaveChangesAsync();
        return log;
    }

    [Fact]
    public async Task Removes_your_own_pending_log()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, _, household) = await PairedAsync(db);
        var log = await LogAsync(db, household.Id, alex.Id);

        var status = await new ActivityLogService(db, new ProgressionService(db)).DeleteMineAsync(alex.Id, log.Id);

        Assert.Equal(ActivityLogStatusCode.Ok, status);
        Assert.Null(await db.ActivityLogs.SingleOrDefaultAsync(l => l.Id == log.Id));
    }

    /// <summary>
    /// An approved log has already moved the score and may sit inside a settled period. Unwinding
    /// that means reversing points across a closed competition — the invariant task [23] is built
    /// on. Removing an approved chore stays the partner's job, through rejection.
    /// </summary>
    [Fact]
    public async Task Refuses_an_approved_log_and_leaves_it_alone()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, _, household) = await PairedAsync(db);
        var log = await LogAsync(db, household.Id, alex.Id, ActivityLogStatus.Approved);

        var status = await new ActivityLogService(db, new ProgressionService(db)).DeleteMineAsync(alex.Id, log.Id);

        Assert.Equal(ActivityLogStatusCode.NotPending, status);
        Assert.NotNull(await db.ActivityLogs.SingleOrDefaultAsync(l => l.Id == log.Id));
    }

    /// <summary>
    /// A rejected log is the record of a decision the partner made. The person it went against must
    /// not be able to erase it.
    /// </summary>
    [Fact]
    public async Task Refuses_a_rejected_log()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, _, household) = await PairedAsync(db);
        var log = await LogAsync(db, household.Id, alex.Id, ActivityLogStatus.Rejected);

        var status = await new ActivityLogService(db, new ProgressionService(db)).DeleteMineAsync(alex.Id, log.Id);

        Assert.Equal(ActivityLogStatusCode.NotPending, status);
        Assert.NotNull(await db.ActivityLogs.SingleOrDefaultAsync(l => l.Id == log.Id));
    }

    /// <summary>
    /// Your partner's pending chore is theirs. You can approve or reject it; you cannot make it
    /// disappear — which would be a way to silently clear your own queue.
    /// </summary>
    [Fact]
    public async Task Refuses_your_partners_log_as_not_found()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedAsync(db);
        var theirs = await LogAsync(db, household.Id, sam.Id);

        var status = await new ActivityLogService(db, new ProgressionService(db)).DeleteMineAsync(alex.Id, theirs.Id);

        // 404, not 403: the same answer as "no such log", so the endpoint cannot be used to probe
        // which ids exist.
        Assert.Equal(ActivityLogStatusCode.LogNotFound, status);
        Assert.NotNull(await db.ActivityLogs.SingleOrDefaultAsync(l => l.Id == theirs.Id));
    }

    [Fact]
    public async Task Refuses_an_id_that_does_not_exist()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, _, _) = await PairedAsync(db);

        Assert.Equal(
            ActivityLogStatusCode.LogNotFound,
            await new ActivityLogService(db, new ProgressionService(db)).DeleteMineAsync(alex.Id, 999_999));
    }

    /// <summary>
    /// The one reader that sees pending logs, and the reason a hard delete is safe rather than a
    /// problem: settlement refuses to close a period while something is still waiting in it —
    /// <see cref="SettlementOutcome.AwaitingApprovals"/>.
    ///
    /// So removing a mis-tapped chore lets that period settle, which is what the person deleting it
    /// wants; the alternative is a duel that cannot be decided because of a tap nobody meant.
    /// Asserted in both directions, because "the delete unblocks settlement" says nothing without
    /// first showing the log was blocking it.
    /// </summary>
    [Fact]
    public async Task Deleting_the_last_pending_log_unblocks_settlement()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, _, household) = await PairedAsync(db);
        var calculator = new PeriodCalculator(TimeZoneInfo.FindSystemTimeZoneById("Pacific/Auckland"));
        var settlement = new CompetitionSettlementService(db, calculator, new ProgressionService(db));
        var now = DateTime.UtcNow;
        var closed = calculator.PeriodContaining(CompetitionPeriodType.Daily, now.AddDays(-1));

        var activity = await db.Activities.FirstAsync(a => a.HouseholdId == household.Id);
        db.ActivityLogs.Add(new ActivityLog
        {
            ActivityId = activity.Id,
            LoggedByUserId = alex.Id,
            PointsAwarded = activity.Points,
            Status = ActivityLogStatus.Approved,
            CompletedAt = closed.StartUtc.AddHours(1)
        });
        var pending = new ActivityLog
        {
            ActivityId = activity.Id,
            LoggedByUserId = alex.Id,
            PointsAwarded = activity.Points,
            Status = ActivityLogStatus.Pending,
            CompletedAt = closed.StartUtc.AddHours(2)
        };
        db.ActivityLogs.Add(pending);
        await db.SaveChangesAsync();

        var before = await settlement.SettlePeriodAsync(household.Id, closed, now);
        Assert.Equal(SettlementOutcome.AwaitingApprovals, before.Outcome);

        await new ActivityLogService(db, new ProgressionService(db)).DeleteMineAsync(alex.Id, pending.Id);

        var after = await settlement.SettlePeriodAsync(household.Id, closed, now);
        Assert.Equal(SettlementOutcome.Settled, after.Outcome);
    }

    /// <summary>
    /// Nothing downstream counts a pending log, so removing one must move no score at all. Pinned
    /// because the tempting "safer" implementation — archiving instead of deleting — would leave a
    /// row that every one of those readers has to learn to exclude.
    /// </summary>
    [Fact]
    public async Task Removing_a_pending_log_changes_no_score()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, _, household) = await PairedAsync(db);
        var approved = await LogAsync(db, household.Id, alex.Id, ActivityLogStatus.Approved);
        var pending = await LogAsync(db, household.Id, alex.Id);

        var calculator = new PeriodCalculator(TimeZoneInfo.FindSystemTimeZoneById("Pacific/Auckland"));
        var settlement = new CompetitionSettlementService(db, calculator, new ProgressionService(db));
        var today = calculator.PeriodContaining(CompetitionPeriodType.Daily, DateTime.UtcNow);

        var before = await settlement.GetStandingAsync(household.Id, today);
        await new ActivityLogService(db, new ProgressionService(db)).DeleteMineAsync(alex.Id, pending.Id);
        var after = await settlement.GetStandingAsync(household.Id, today);

        Assert.Equal(before.PointsByUserId[alex.Id], after.PointsByUserId[alex.Id]);
        // Not zero by accident: the approved log is still there and still counted.
        Assert.True(after.PointsByUserId[alex.Id] > 0);
        Assert.NotNull(await db.ActivityLogs.SingleOrDefaultAsync(l => l.Id == approved.Id));
    }
}
