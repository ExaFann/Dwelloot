using API.Data;
using API.Entities;
using API.Services;
using API.Services.Progression;
using Microsoft.EntityFrameworkCore;

namespace Dwelloot.Tests.Services.Progression;

public class BadgeTests
{
    private static async Task<User> AddUserAsync(AppDbContext db, string email)
    {
        var user = new User { Name = email.Split('@')[0], Email = email, UserName = email };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        return user;
    }

    private static async Task<(User Alex, User Sam, Household Household)> PairedHouseholdAsync(AppDbContext db)
    {
        var households = new HouseholdService(db, new DefaultCatalogCopier(db), new InviteCodeGenerator());
        var alex = await AddUserAsync(db, "alex@example.com");
        var sam = await AddUserAsync(db, "sam@example.com");

        var created = await households.CreateAsync(alex.Id, "Our place");
        await households.JoinAsync(sam.Id, created.Household!.InviteCode);

        return (alex, sam, created.Household);
    }

    private static async Task AddApprovedLogAsync(AppDbContext db, int householdId, int userId, int points = 10)
    {
        var chore = await db.Activities.FirstAsync(a => a.HouseholdId == householdId);

        db.ActivityLogs.Add(new ActivityLog
        {
            ActivityId = chore.Id,
            LoggedByUserId = userId,
            PointsAwarded = points,
            Status = ActivityLogStatus.Approved,
            CompletedAt = DateTime.UtcNow,
            ApprovedAt = DateTime.UtcNow
        });

        await db.SaveChangesAsync();
    }

    private static async Task AddRedemptionsAsync(AppDbContext db, int householdId, int userId, int count)
    {
        var reward = await db.Rewards.FirstAsync(r => r.HouseholdId == householdId);

        for (var i = 0; i < count; i++)
        {
            db.Redemptions.Add(new Redemption
            {
                UserId = userId,
                RewardId = reward.Id,
                RedeemedAt = DateTime.UtcNow
            });
        }

        await db.SaveChangesAsync();
    }

    private static Task<List<int>> UnlockedAsync(AppDbContext db, int userId) =>
        db.UserBadges.Where(ub => ub.UserId == userId).Select(ub => ub.BadgeId).ToListAsync();

    [Fact]
    public async Task First_chore_unlocks_on_the_first_approved_log_and_not_before()
    {
        using var db = TestDbContextFactory.Create();
        var (_, sam, household) = await PairedHouseholdAsync(db);
        var service = new ProgressionService(db);

        Assert.Empty(await service.EvaluateBadgesAsync(sam.Id));

        await AddApprovedLogAsync(db, household.Id, sam.Id);
        var earned = await service.EvaluateBadgesAsync(sam.Id);

        Assert.Contains(BadgeCode.FirstChore, earned);
        Assert.Contains((int)BadgeCode.FirstChore, await UnlockedAsync(db, sam.Id));
    }

    [Fact]
    public async Task Century_unlocks_at_a_hundred_points_and_not_at_ninety_nine()
    {
        // Literals, not ProgressionService.CenturyPoints. Expressing the boundary in terms of the
        // constant made this pass at any threshold - setting it to 99 still satisfied both halves -
        // which mutation testing caught. Fourth instance of that trap in this project.
        using var db = TestDbContextFactory.Create();
        var (_, sam, _) = await PairedHouseholdAsync(db);
        var service = new ProgressionService(db);

        sam.LifetimePoints = 99;
        await db.SaveChangesAsync();
        Assert.DoesNotContain(BadgeCode.Century, await service.EvaluateBadgesAsync(sam.Id));

        sam.LifetimePoints = 100;
        await db.SaveChangesAsync();
        Assert.Contains(BadgeCode.Century, await service.EvaluateBadgesAsync(sam.Id));
    }

    [Fact]
    public void The_configured_thresholds_are_the_ones_the_badge_text_promises()
    {
        // The Criteria strings seeded in task [9] make specific promises - "three days in a row",
        // "100 lifetime Points", "five rewards". Pinned here so the numbers and the copy cannot
        // drift apart.
        Assert.Equal(3, ProgressionService.ThreeDayStreak);
        Assert.Equal(7, ProgressionService.SevenDayStreak);
        Assert.Equal(100, ProgressionService.CenturyPoints);
        Assert.Equal(5, ProgressionService.BigSpenderRedemptions);
    }

    [Theory]
    [InlineData(2, false, false)]
    [InlineData(3, true, false)]
    [InlineData(6, true, false)]
    [InlineData(7, true, true)]
    public async Task Streak_badges_unlock_at_their_thresholds(int streak, bool expectThree, bool expectSeven)
    {
        using var db = TestDbContextFactory.Create();
        var (_, sam, _) = await PairedHouseholdAsync(db);

        sam.CurrentWinStreak = streak;
        await db.SaveChangesAsync();

        var earned = await new ProgressionService(db).EvaluateBadgesAsync(sam.Id);

        Assert.Equal(expectThree, earned.Contains(BadgeCode.ThreeDayWinStreak));
        Assert.Equal(expectSeven, earned.Contains(BadgeCode.SevenDayWinStreak));
    }

    [Theory]
    [InlineData(0, false, false)]
    [InlineData(1, true, false)]
    [InlineData(4, true, false)]
    [InlineData(5, true, true)]
    public async Task Redemption_badges_unlock_at_one_and_five(int redemptions, bool expectFirst, bool expectBig)
    {
        using var db = TestDbContextFactory.Create();
        var (_, sam, household) = await PairedHouseholdAsync(db);

        await AddRedemptionsAsync(db, household.Id, sam.Id, redemptions);

        var earned = await new ProgressionService(db).EvaluateBadgesAsync(sam.Id);

        Assert.Equal(expectFirst, earned.Contains(BadgeCode.FirstRedemption));
        Assert.Equal(expectBig, earned.Contains(BadgeCode.BigSpender));
    }

    [Fact]
    public async Task Unlocking_is_idempotent()
    {
        using var db = TestDbContextFactory.Create();
        var (_, sam, household) = await PairedHouseholdAsync(db);
        var service = new ProgressionService(db);

        await AddApprovedLogAsync(db, household.Id, sam.Id);

        var first = await service.EvaluateBadgesAsync(sam.Id);
        var second = await service.EvaluateBadgesAsync(sam.Id);
        var third = await service.EvaluateBadgesAsync(sam.Id);

        Assert.Single(first);
        Assert.Empty(second);
        Assert.Empty(third);
        Assert.Single(await UnlockedAsync(db, sam.Id));
    }

    [Fact]
    public async Task UnlockedAt_is_recorded()
    {
        using var db = TestDbContextFactory.Create();
        var (_, sam, household) = await PairedHouseholdAsync(db);
        await AddApprovedLogAsync(db, household.Id, sam.Id);

        var before = DateTime.UtcNow.AddSeconds(-5);
        await new ProgressionService(db).EvaluateBadgesAsync(sam.Id);

        var unlocked = await db.UserBadges.SingleAsync(ub => ub.UserId == sam.Id);
        Assert.InRange(unlocked.UnlockedAt, before, DateTime.UtcNow.AddSeconds(5));
    }

    [Fact]
    public async Task Badges_are_per_user()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        await AddApprovedLogAsync(db, household.Id, sam.Id);

        await new ProgressionService(db).EvaluateBadgesAsync(sam.Id);

        Assert.NotEmpty(await UnlockedAsync(db, sam.Id));
        Assert.Empty(await UnlockedAsync(db, alex.Id));
    }

    [Fact]
    public async Task Approving_a_log_unlocks_First_chore_immediately()
    {
        // Without wiring evaluation into approval, the badge whose whole point is to fire on your
        // first action would wait for a day boundary. Four of the six criteria are not
        // settlement-driven at all.
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var chore = await db.Activities.FirstAsync(a => a.HouseholdId == household.Id);
        var logs = new ActivityLogService(db, new ProgressionService(db));

        var logId = (await logs.CreateAsync(sam.Id, chore.Id)).Log!.Id;
        Assert.Empty(await UnlockedAsync(db, sam.Id));

        await logs.ApproveAsync(alex.Id, logId);

        Assert.Contains((int)BadgeCode.FirstChore, await UnlockedAsync(db, sam.Id));
    }

    [Fact]
    public async Task Bulk_approving_unlocks_badges_for_the_logger()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var chore = await db.Activities.FirstAsync(a => a.HouseholdId == household.Id);
        var logs = new ActivityLogService(db, new ProgressionService(db));

        var a = (await logs.CreateAsync(sam.Id, chore.Id)).Log!.Id;
        var b = (await logs.CreateAsync(sam.Id, chore.Id)).Log!.Id;

        await logs.BulkApproveAsync(alex.Id, [a, b]);

        Assert.Contains((int)BadgeCode.FirstChore, await UnlockedAsync(db, sam.Id));
    }

    [Fact]
    public async Task Every_badge_code_has_a_seeded_row()
    {
        // Guards the BadgeCode-to-seed contract from task [9] against the criteria added here:
        // unlocking a code with no matching badge row would violate the foreign key.
        using var db = TestDbContextFactory.Create();

        foreach (var code in Enum.GetValues<BadgeCode>())
        {
            Assert.True(
                await db.Badges.AnyAsync(b => b.Id == (int)code),
                $"no seeded badge for {code}");
        }
    }
}
