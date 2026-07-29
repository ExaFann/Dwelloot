using API.Data;
using API.Data.Defaults;
using API.Dtos.Activities;
using API.Entities;
using API.Services;
using Microsoft.EntityFrameworkCore;

namespace Dwelloot.Tests.Services;

public class ActivityServiceMutationTests
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

    private static async Task<ActivityLog> AddLogAsync(AppDbContext db, int activityId, int userId)
    {
        var log = new ActivityLog
        {
            ActivityId = activityId,
            LoggedByUserId = userId,
            Status = ActivityLogStatus.Pending,
            CompletedAt = DateTime.UtcNow
        };
        db.ActivityLogs.Add(log);
        await db.SaveChangesAsync();
        return log;
    }

    // ---------- create ----------

    [Fact]
    public async Task CreateAsync_adds_a_chore_to_the_callers_household()
    {
        using var db = TestDbContextFactory.Create();

        // A decoy household is created first so the caller's household is NOT id 1. Without it,
        // hard-coding HouseholdId = 1 in the service passes this test - mutation testing caught
        // exactly that.
        await StockedHouseholdAsync(db, "decoy@example.com");

        var (user, household) = await StockedHouseholdAsync(db);
        Assert.NotEqual(1, household.Id);

        var result = await new ActivityService(db).CreateAsync(
            user.Id, new CreateActivityRequest("Water the plants", 8, null));

        Assert.Equal(ActivityMutationStatus.Ok, result.Status);

        var saved = await db.Activities.SingleAsync(a => a.Id == result.Activity!.Id);
        Assert.Equal("Water the plants", saved.Title);
        Assert.Equal(8, saved.Points);
        Assert.Equal(household.Id, saved.HouseholdId);
        Assert.Equal(ActivityCategory.Chore, saved.Category);
    }

    [Fact]
    public async Task CreateAsync_rejects_a_caller_with_no_household()
    {
        using var db = TestDbContextFactory.Create();
        var loner = await AddUserAsync(db, "loner@example.com");

        var result = await new ActivityService(db).CreateAsync(
            loner.Id, new CreateActivityRequest("Nope", 5, null));

        Assert.Equal(ActivityMutationStatus.NoHousehold, result.Status);
        Assert.Empty(await db.Activities.ToListAsync());
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(-500)]
    public async Task CreateAsync_rejects_non_positive_points(int points)
    {
        // Guarded in the service as well as the DTO and the database check constraint, so a value
        // that slipped past model binding becomes a 400 rather than a 500 naming a constraint.
        using var db = TestDbContextFactory.Create();
        var (user, _) = await StockedHouseholdAsync(db);
        var before = await db.Activities.CountAsync();

        var result = await new ActivityService(db).CreateAsync(
            user.Id, new CreateActivityRequest("Cheeky", points, null));

        Assert.Equal(ActivityMutationStatus.InvalidPoints, result.Status);
        Assert.Equal(before, await db.Activities.CountAsync());
    }

    // ---------- update ----------

    [Fact]
    public async Task UpdateAsync_changes_the_supplied_fields()
    {
        using var db = TestDbContextFactory.Create();
        var (user, household) = await StockedHouseholdAsync(db);
        var chore = await db.Activities.FirstAsync(a => a.HouseholdId == household.Id);

        var result = await new ActivityService(db).UpdateAsync(
            user.Id, chore.Id, new PatchActivityRequest("Renamed chore", 42, null));

        Assert.Equal(ActivityMutationStatus.Ok, result.Status);

        var saved = await db.Activities.SingleAsync(a => a.Id == chore.Id);
        Assert.Equal("Renamed chore", saved.Title);
        Assert.Equal(42, saved.Points);
    }

    [Fact]
    public async Task UpdateAsync_leaves_omitted_fields_alone()
    {
        // What separates PATCH from PUT, and what a careless implementation breaks by writing
        // every field unconditionally.
        using var db = TestDbContextFactory.Create();
        var (user, household) = await StockedHouseholdAsync(db);
        var chore = await db.Activities.FirstAsync(a => a.HouseholdId == household.Id);
        var originalTitle = chore.Title;

        await new ActivityService(db).UpdateAsync(
            user.Id, chore.Id, new PatchActivityRequest(null, 99, null));

        var saved = await db.Activities.SingleAsync(a => a.Id == chore.Id);
        Assert.Equal(originalTitle, saved.Title);
        Assert.Equal(99, saved.Points);
    }

    [Fact]
    public async Task UpdateAsync_refuses_another_households_chore_and_leaves_it_unchanged()
    {
        using var db = TestDbContextFactory.Create();
        var (mine, _) = await StockedHouseholdAsync(db, "alex@example.com");
        var (_, theirHousehold) = await StockedHouseholdAsync(db, "stranger@example.com");
        var theirChore = await db.Activities.FirstAsync(a => a.HouseholdId == theirHousehold.Id);
        var originalTitle = theirChore.Title;
        var originalPoints = theirChore.Points;

        var result = await new ActivityService(db).UpdateAsync(
            mine.Id, theirChore.Id, new PatchActivityRequest("Pwned", 1, null));

        Assert.Equal(ActivityMutationStatus.NotFound, result.Status);

        var saved = await db.Activities.SingleAsync(a => a.Id == theirChore.Id);
        Assert.Equal(originalTitle, saved.Title);
        Assert.Equal(originalPoints, saved.Points);
    }

    [Fact]
    public async Task UpdateAsync_rejects_non_positive_points()
    {
        using var db = TestDbContextFactory.Create();
        var (user, household) = await StockedHouseholdAsync(db);
        var chore = await db.Activities.FirstAsync(a => a.HouseholdId == household.Id);
        var originalPoints = chore.Points;

        var result = await new ActivityService(db).UpdateAsync(
            user.Id, chore.Id, new PatchActivityRequest(null, -5, null));

        Assert.Equal(ActivityMutationStatus.InvalidPoints, result.Status);
        Assert.Equal(originalPoints, (await db.Activities.SingleAsync(a => a.Id == chore.Id)).Points);
    }

    // ---------- delete ----------

    [Fact]
    public async Task DeleteAsync_removes_the_chore_from_the_catalog()
    {
        using var db = TestDbContextFactory.Create();
        var (user, household) = await StockedHouseholdAsync(db);
        var chore = await db.Activities.FirstAsync(a => a.HouseholdId == household.Id);

        var result = await new ActivityService(db).DeleteAsync(user.Id, chore.Id);

        Assert.Equal(ActivityMutationStatus.Ok, result.Status);

        var listed = await new ActivityService(db).ListAsync(user.Id, new ActivityQuery { PageSize = 100 });
        Assert.DoesNotContain(listed.Page!.Items, i => i.Id == chore.Id);
        Assert.Equal(DefaultActivities.All.Count - 1, listed.Page.Total);
    }

    [Fact]
    public async Task DeleteAsync_keeps_the_logged_history_and_the_points_earned()
    {
        // The correction that prompted this design: removing a chore must not rewrite the past.
        // A hard delete cascades to every log of the chore, and because the current competition
        // period is computed live from approved logs, that would retroactively reduce whoever
        // logged it - something either partner could inflict on the other.
        using var db = TestDbContextFactory.Create();
        var (user, household) = await StockedHouseholdAsync(db);
        var chore = await db.Activities.FirstAsync(a => a.HouseholdId == household.Id);
        await AddLogAsync(db, chore.Id, user.Id);
        await AddLogAsync(db, chore.Id, user.Id);

        var result = await new ActivityService(db).DeleteAsync(user.Id, chore.Id);

        Assert.Equal(ActivityMutationStatus.Ok, result.Status);

        // The row survives so the logs still resolve their title and points.
        Assert.True(await db.Activities.AnyAsync(a => a.Id == chore.Id));
        Assert.Equal(2, await db.ActivityLogs.CountAsync(l => l.ActivityId == chore.Id));
        Assert.NotNull((await db.Activities.SingleAsync(a => a.Id == chore.Id)).ArchivedAt);
    }

    [Fact]
    public async Task An_archived_chore_can_no_longer_be_edited_or_archived_again()
    {
        using var db = TestDbContextFactory.Create();
        var (user, household) = await StockedHouseholdAsync(db);
        var chore = await db.Activities.FirstAsync(a => a.HouseholdId == household.Id);
        var service = new ActivityService(db);

        await service.DeleteAsync(user.Id, chore.Id);

        var edit = await service.UpdateAsync(user.Id, chore.Id, new PatchActivityRequest("Zombie", null, null));
        var again = await service.DeleteAsync(user.Id, chore.Id);

        Assert.Equal(ActivityMutationStatus.NotFound, edit.Status);
        Assert.Equal(ActivityMutationStatus.NotFound, again.Status);
    }

    [Fact]
    public async Task DeleteAsync_refuses_another_households_chore_which_stays_listed()
    {
        using var db = TestDbContextFactory.Create();
        var (mine, _) = await StockedHouseholdAsync(db, "alex@example.com");
        var (theirUser, theirHousehold) = await StockedHouseholdAsync(db, "stranger@example.com");
        var theirChore = await db.Activities.FirstAsync(a => a.HouseholdId == theirHousehold.Id);

        var result = await new ActivityService(db).DeleteAsync(mine.Id, theirChore.Id);

        Assert.Equal(ActivityMutationStatus.NotFound, result.Status);
        Assert.Null((await db.Activities.SingleAsync(a => a.Id == theirChore.Id)).ArchivedAt);

        var theirList = await new ActivityService(db).ListAsync(theirUser.Id, new ActivityQuery { PageSize = 100 });
        Assert.Contains(theirList.Page!.Items, i => i.Id == theirChore.Id);
    }

    [Fact]
    public async Task A_default_copied_chore_behaves_exactly_like_a_custom_one()
    {
        // The task's headline claim - "no default-vs-custom distinction" - asserted rather than
        // assumed. Both rows take the same path because copy-on-creation left nothing to
        // distinguish them.
        using var db = TestDbContextFactory.Create();
        var (user, household) = await StockedHouseholdAsync(db);
        var service = new ActivityService(db);

        var fromDefaults = await db.Activities.SingleAsync(
            a => a.HouseholdId == household.Id && a.Title == "Mow the lawn");

        var custom = await service.CreateAsync(user.Id, new CreateActivityRequest("Custom chore", 7, null));

        var editDefault = await service.UpdateAsync(
            user.Id, fromDefaults.Id, new PatchActivityRequest("Mow the berm", null, null));
        var editCustom = await service.UpdateAsync(
            user.Id, custom.Activity!.Id, new PatchActivityRequest("Custom renamed", null, null));

        Assert.Equal(ActivityMutationStatus.Ok, editDefault.Status);
        Assert.Equal(ActivityMutationStatus.Ok, editCustom.Status);

        var deleteDefault = await service.DeleteAsync(user.Id, fromDefaults.Id);
        var deleteCustom = await service.DeleteAsync(user.Id, custom.Activity.Id);

        Assert.Equal(ActivityMutationStatus.Ok, deleteDefault.Status);
        Assert.Equal(ActivityMutationStatus.Ok, deleteCustom.Status);
    }
}
