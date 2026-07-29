using API.Data;
using API.Dtos.Activities;
using API.Entities;
using API.Services;
using Microsoft.EntityFrameworkCore;

namespace Dwelloot.Tests.Services;

public class ActivityLogServiceTests
{
    private static async Task<User> AddUserAsync(AppDbContext db, string email)
    {
        var user = new User { Name = email.Split('@')[0], Email = email, UserName = email };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        return user;
    }

    private static async Task<(User User, Household Household)> StockedHouseholdAsync(
        AppDbContext db,
        string email = "alex@example.com")
    {
        var user = await AddUserAsync(db, email);
        var created = await new HouseholdService(db, new DefaultCatalogCopier(db), new InviteCodeGenerator())
            .CreateAsync(user.Id, "Our place");

        return (user, created.Household!);
    }

    private static Task<Activity> ChoreAsync(AppDbContext db, int householdId, string title = "Vacuum") =>
        db.Activities.SingleAsync(a => a.HouseholdId == householdId && a.Title == title);

    [Fact]
    public async Task CreateAsync_records_a_pending_log_for_the_caller()
    {
        using var db = TestDbContextFactory.Create();

        // A decoy household is created first so the caller is NOT user id 1. Without it,
        // hard-coding LoggedByUserId = 1 in the service passes this test — the same fixture trap
        // mutation testing found in task [18].
        await StockedHouseholdAsync(db, "decoy@example.com");

        var (user, household) = await StockedHouseholdAsync(db);
        Assert.NotEqual(1, user.Id);

        var chore = await ChoreAsync(db, household.Id);

        var result = await new ActivityLogService(db).CreateAsync(user.Id, chore.Id);

        Assert.Equal(ActivityLogStatusCode.Ok, result.Status);
        Assert.Equal(ActivityLogStatus.Pending, result.Log!.Status);
        Assert.Equal(chore.Id, result.Log.ActivityId);

        var saved = await db.ActivityLogs.SingleAsync(l => l.Id == result.Log.Id);
        Assert.Equal(user.Id, saved.LoggedByUserId);
        Assert.Null(saved.ApprovedByUserId);
        Assert.Null(saved.ApprovedAt);
    }

    [Fact]
    public async Task CreateAsync_sets_CompletedAt_server_side_in_utc()
    {
        using var db = TestDbContextFactory.Create();
        var (user, household) = await StockedHouseholdAsync(db);
        var chore = await ChoreAsync(db, household.Id);

        var before = DateTime.UtcNow.AddSeconds(-5);
        var result = await new ActivityLogService(db).CreateAsync(user.Id, chore.Id);
        var after = DateTime.UtcNow.AddSeconds(5);

        Assert.InRange(result.Log!.CompletedAt, before, after);
        Assert.Equal(DateTimeKind.Utc, result.Log.CompletedAt.Kind);
    }

    [Fact]
    public async Task CreateAsync_snapshots_the_chores_points()
    {
        using var db = TestDbContextFactory.Create();
        var (user, household) = await StockedHouseholdAsync(db);
        var chore = await ChoreAsync(db, household.Id);

        var result = await new ActivityLogService(db).CreateAsync(user.Id, chore.Id);

        var saved = await db.ActivityLogs.SingleAsync(l => l.Id == result.Log!.Id);
        Assert.Equal(chore.Points, saved.PointsAwarded);
    }

    [Fact]
    public async Task Editing_the_chore_afterwards_does_not_re_value_an_existing_log()
    {
        // The headline fix carried over from task [18]. Without the snapshot, logging twenty
        // chores at 10 points and then editing the chore to 999 would inflate the live competition
        // period - an edit to the catalog rewriting a competition already under way.
        using var db = TestDbContextFactory.Create();
        var (user, household) = await StockedHouseholdAsync(db);
        var chore = await ChoreAsync(db, household.Id);
        var originalPoints = chore.Points;

        var result = await new ActivityLogService(db).CreateAsync(user.Id, chore.Id);

        var edited = await new ActivityService(db).UpdateAsync(
            user.Id, chore.Id, new PatchActivityRequest(null, 999, null));
        Assert.Equal(ActivityMutationStatus.Ok, edited.Status);

        var saved = await db.ActivityLogs.SingleAsync(l => l.Id == result.Log!.Id);
        Assert.Equal(originalPoints, saved.PointsAwarded);
        Assert.NotEqual(999, saved.PointsAwarded);
    }

    [Fact]
    public async Task CreateAsync_refuses_another_households_chore_and_writes_nothing()
    {
        using var db = TestDbContextFactory.Create();
        var (mine, _) = await StockedHouseholdAsync(db, "alex@example.com");
        var (_, theirHousehold) = await StockedHouseholdAsync(db, "stranger@example.com");
        var theirChore = await ChoreAsync(db, theirHousehold.Id);

        var result = await new ActivityLogService(db).CreateAsync(mine.Id, theirChore.Id);

        Assert.Equal(ActivityLogStatusCode.ActivityNotFound, result.Status);
        Assert.Empty(await db.ActivityLogs.ToListAsync());
    }

    [Fact]
    public async Task CreateAsync_refuses_an_archived_chore()
    {
        using var db = TestDbContextFactory.Create();
        var (user, household) = await StockedHouseholdAsync(db);
        var chore = await ChoreAsync(db, household.Id);

        await new ActivityService(db).DeleteAsync(user.Id, chore.Id);

        var result = await new ActivityLogService(db).CreateAsync(user.Id, chore.Id);

        Assert.Equal(ActivityLogStatusCode.ActivityNotFound, result.Status);
        Assert.Empty(await db.ActivityLogs.ToListAsync());
    }

    [Fact]
    public async Task Archiving_a_chore_leaves_its_existing_logs_readable_with_points_intact()
    {
        // The follow-up task [18] left for this task, replacing the cascade check that its
        // amendment made obsolete. Removing a chore must not rewrite what already happened.
        using var db = TestDbContextFactory.Create();
        var (user, household) = await StockedHouseholdAsync(db);
        var chore = await ChoreAsync(db, household.Id);
        var originalPoints = chore.Points;

        var first = await new ActivityLogService(db).CreateAsync(user.Id, chore.Id);
        var second = await new ActivityLogService(db).CreateAsync(user.Id, chore.Id);

        await new ActivityService(db).DeleteAsync(user.Id, chore.Id);

        var surviving = await db.ActivityLogs
            .Include(l => l.Activity)
            .Where(l => l.ActivityId == chore.Id)
            .ToListAsync();

        Assert.Equal(2, surviving.Count);
        Assert.All(surviving, l => Assert.Equal(originalPoints, l.PointsAwarded));

        // The title still resolves, which is what GET /activity-logs/mine needs to render history.
        Assert.All(surviving, l => Assert.Equal("Vacuum", l.Activity.Title));
        Assert.Contains(surviving, l => l.Id == first.Log!.Id);
        Assert.Contains(surviving, l => l.Id == second.Log!.Id);
    }

    [Fact]
    public async Task CreateAsync_rejects_a_caller_with_no_household()
    {
        using var db = TestDbContextFactory.Create();
        var (_, household) = await StockedHouseholdAsync(db);
        var chore = await ChoreAsync(db, household.Id);
        var loner = await AddUserAsync(db, "loner@example.com");

        var result = await new ActivityLogService(db).CreateAsync(loner.Id, chore.Id);

        Assert.Equal(ActivityLogStatusCode.NoHousehold, result.Status);
        Assert.Empty(await db.ActivityLogs.ToListAsync());
    }

    [Fact]
    public async Task The_same_chore_can_be_logged_repeatedly()
    {
        // Doing the dishes twice in a day is normal. The defence against inflation is peer
        // approval, not a uniqueness rule here.
        using var db = TestDbContextFactory.Create();
        var (user, household) = await StockedHouseholdAsync(db);
        var chore = await ChoreAsync(db, household.Id);
        var service = new ActivityLogService(db);

        for (var i = 0; i < 3; i++)
        {
            Assert.Equal(ActivityLogStatusCode.Ok, (await service.CreateAsync(user.Id, chore.Id)).Status);
        }

        var logs = await db.ActivityLogs.Where(l => l.ActivityId == chore.Id).ToListAsync();
        Assert.Equal(3, logs.Count);
        Assert.All(logs, l => Assert.Equal(ActivityLogStatus.Pending, l.Status));
    }
}
