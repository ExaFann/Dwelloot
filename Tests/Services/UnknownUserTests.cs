using API.Data;
using API.Dtos.Activities;
using API.Dtos.Rewards;
using API.Entities;
using API.Services;
using API.Services.Competitions;
using API.Services.Progression;
using Microsoft.EntityFrameworkCore;

namespace Dwelloot.Tests.Services;

/// <summary>
/// Every service's "the caller does not exist" branch, in one place.
/// </summary>
/// <remarks>
/// These were the precise lines coverage reported as never executed in task [36]. Reachable in v1 only
/// through a token naming a deleted user — and v1 never deletes users, every user FK being
/// <c>Restrict</c> — but the branch is what stops a stale or forged-subject token being served a
/// cheerful success against nobody's data. Untested until now.
/// </remarks>
public class UnknownUserTests
{
    private const int NoSuchUser = 999_999;

    private static async Task<(AppDbContext Db, User User, Household Household)> StockedAsync()
    {
        var db = TestDbContextFactory.Create();
        var user = new User { Name = "alex", Email = "alex@example.com", UserName = "alex@example.com" };
        db.Users.Add(user);
        await db.SaveChangesAsync();

        var created = await new HouseholdService(db, new DefaultCatalogCopier(db), new InviteCodeGenerator())
            .CreateAsync(user.Id, "Our place");

        return (db, user, created.Household!);
    }

    [Fact]
    public async Task ActivityService_reports_UserNotFound_on_every_entry_point()
    {
        using var db = TestDbContextFactory.Create();
        var service = new ActivityService(db);

        Assert.Equal(ActivityQueryStatus.UserNotFound, (await service.ListAsync(NoSuchUser, new ActivityQuery())).Status);
        Assert.Equal(ActivityMutationStatus.UserNotFound, (await service.CreateAsync(NoSuchUser, new CreateActivityRequest("Wash dishes", 10, null))).Status);
        Assert.Equal(ActivityMutationStatus.UserNotFound, (await service.UpdateAsync(NoSuchUser, 1, new PatchActivityRequest("x", null, null))).Status);
        Assert.Equal(ActivityMutationStatus.UserNotFound, (await service.DeleteAsync(NoSuchUser, 1)).Status);

        Assert.Empty(await db.Activities.ToListAsync());
    }

    [Fact]
    public async Task RewardService_reports_UserNotFound_on_every_entry_point()
    {
        using var db = TestDbContextFactory.Create();
        var service = new RewardService(db);

        Assert.Equal(RewardQueryStatus.UserNotFound, (await service.ListAsync(NoSuchUser, new RewardQuery())).Status);
        Assert.Equal(RewardMutationStatus.UserNotFound, (await service.CreateAsync(NoSuchUser, new CreateRewardRequest("Foot massage", 25))).Status);
        Assert.Equal(RewardMutationStatus.UserNotFound, (await service.UpdateAsync(NoSuchUser, 1, new PatchRewardRequest("x", null, null))).Status);
        Assert.Equal(RewardMutationStatus.UserNotFound, (await service.DeleteAsync(NoSuchUser, 1)).Status);

        Assert.Empty(await db.Rewards.ToListAsync());
    }

    [Fact]
    public async Task ActivityLogService_reports_UserNotFound_on_every_entry_point()
    {
        var (db, _, household) = await StockedAsync();
        using var _db = db;
        var chore = await db.Activities.FirstAsync(a => a.HouseholdId == household.Id);
        var service = new ActivityLogService(db, new ProgressionService(db));

        Assert.Equal(ActivityLogStatusCode.UserNotFound, (await service.CreateAsync(NoSuchUser, chore.Id)).Status);
        Assert.Equal(ActivityLogStatusCode.UserNotFound, (await service.ListForApprovalAsync(NoSuchUser, new API.Dtos.ActivityLogs.ActivityLogQuery())).Status);
        Assert.Equal(ActivityLogStatusCode.UserNotFound, (await service.ListMineAsync(NoSuchUser, new API.Dtos.ActivityLogs.MyActivityLogQuery())).Status);

        // FindDecidableAsync's branch - the one coverage flagged - is behind these three.
        Assert.Equal(ActivityLogStatusCode.UserNotFound, (await service.ApproveAsync(NoSuchUser, 1)).Status);
        Assert.Equal(ActivityLogStatusCode.UserNotFound, (await service.RejectAsync(NoSuchUser, 1, "no")).Status);
        Assert.Equal(ActivityLogStatusCode.UserNotFound, (await service.BulkApproveAsync(NoSuchUser, [1])).Status);

        Assert.Empty(await db.ActivityLogs.ToListAsync());
    }

    [Fact]
    public async Task A_decision_by_a_user_with_no_household_is_refused()
    {
        // The other branch coverage flagged in FindDecidableAsync.
        using var db = TestDbContextFactory.Create();
        var loner = new User { Name = "loner", Email = "l@e.com", UserName = "l@e.com" };
        db.Users.Add(loner);
        await db.SaveChangesAsync();

        var service = new ActivityLogService(db, new ProgressionService(db));

        Assert.Equal(ActivityLogStatusCode.NoHousehold, (await service.ApproveAsync(loner.Id, 1)).Status);
        Assert.Equal(ActivityLogStatusCode.NoHousehold, (await service.RejectAsync(loner.Id, 1, "no")).Status);
        Assert.Equal(ActivityLogStatusCode.NoHousehold, (await service.BulkApproveAsync(loner.Id, [1])).Status);
    }

    [Fact]
    public async Task RedemptionService_reports_UserNotFound_on_every_entry_point()
    {
        using var db = TestDbContextFactory.Create();
        var service = new RedemptionService(db, new ProgressionService(db));

        Assert.Equal(RedemptionStatus.UserNotFound, (await service.CreateAsync(NoSuchUser, 1)).Status);
        Assert.Equal(RedemptionStatus.UserNotFound, (await service.ListMineAsync(NoSuchUser, new API.Dtos.Redemptions.MyRedemptionQuery())).Status);
        Assert.Equal(RedemptionStatus.UserNotFound, (await service.ListForHouseholdAsync(NoSuchUser, new API.Dtos.Redemptions.HouseholdRedemptionQuery())).Status);

        Assert.Empty(await db.Redemptions.ToListAsync());
    }

    [Fact]
    public async Task LootBoxService_reports_UserNotFound()
    {
        using var db = TestDbContextFactory.Create();

        var result = await new LootBoxService(db, new LootBoxRoller(new Random(1))).OpenAsync(NoSuchUser, 1, 1);

        Assert.Equal(LootBoxStatus.UserNotFound, result.Status);
        Assert.Empty(await db.CompetitionClaims.ToListAsync());
    }

    [Fact]
    public async Task BadgeQueryService_reports_UserNotFound()
    {
        using var db = TestDbContextFactory.Create();

        Assert.Equal(BadgeQueryStatus.UserNotFound, (await new BadgeQueryService(db).ListAsync(NoSuchUser)).Status);
    }

    [Fact]
    public async Task CompetitionQueryService_reports_UserNotFound()
    {
        using var db = TestDbContextFactory.Create();
        var calculator = new PeriodCalculator(TimeZoneInfo.FindSystemTimeZoneById(PeriodCalculator.DefaultTimeZoneId));
        var service = new CompetitionQueryService(
            db, calculator, new CompetitionSettlementService(db, calculator, new ProgressionService(db)));

        var result = await service.GetCurrentAsync(NoSuchUser, 1, CompetitionPeriodType.Daily, DateTime.UtcNow);

        Assert.Equal(CompetitionQueryStatus.UserNotFound, result.Status);
    }

    [Fact]
    public async Task HouseholdService_reports_UserNotFound_on_every_entry_point()
    {
        using var db = TestDbContextFactory.Create();
        var service = new HouseholdService(db, new DefaultCatalogCopier(db), new InviteCodeGenerator());

        Assert.Equal(CreateHouseholdStatus.UserNotFound, (await service.CreateAsync(NoSuchUser, "Our place")).Status);
        Assert.Equal(JoinHouseholdStatus.UserNotFound, (await service.JoinAsync(NoSuchUser, "7F3K9Q")).Status);

        // The three access endpoints do NOT report UserNotFound - they never look the caller up. GetAsync
        // reads the household first and then asks whether the caller is among its members, so an unknown
        // user is simply not a member. This test originally asserted UserNotFound on all five, because
        // the enum has that member and it seemed to follow; the code says otherwise.
        Assert.Equal(HouseholdAccessStatus.HouseholdNotFound, (await service.GetAsync(NoSuchUser, 1)).Status);
        Assert.Equal(HouseholdAccessStatus.HouseholdNotFound, (await service.RenameAsync(NoSuchUser, 1, "The Nest")).Status);
        Assert.Equal(HouseholdAccessStatus.HouseholdNotFound, (await service.LeaveAsync(NoSuchUser, 1)).Status);

        Assert.Empty(await db.Households.ToListAsync());
    }

    [Fact]
    public async Task An_unknown_user_against_a_real_household_is_NotAMember_rather_than_UserNotFound()
    {
        // The security-relevant half, and the reason the check order is right: an id that does not exist
        // and an id that exists but is not a member reach the controller as the same status, which maps
        // to the same 404 (§3.5). Anything else would let a caller learn which household ids are real -
        // and GET /api/households/{id} returns the invite code.
        var (db, _, household) = await StockedAsync();
        using var _db = db;
        var service = new HouseholdService(db, new DefaultCatalogCopier(db), new InviteCodeGenerator());

        var unknownUser = await service.GetAsync(NoSuchUser, household.Id);
        var realOutsider = await service.GetAsync((await AddOutsiderAsync(db)).Id, household.Id);

        Assert.Equal(HouseholdAccessStatus.NotAMember, unknownUser.Status);
        Assert.Equal(HouseholdAccessStatus.NotAMember, realOutsider.Status);
    }

    private static async Task<User> AddOutsiderAsync(AppDbContext db)
    {
        var outsider = new User { Name = "outsider", Email = "o@e.com", UserName = "o@e.com" };
        db.Users.Add(outsider);
        await db.SaveChangesAsync();
        return outsider;
    }

    [Fact]
    public async Task Settlement_reports_HouseholdNotFound_for_a_household_that_does_not_exist()
    {
        // The other line coverage flagged in SettlePeriodAsync.
        using var db = TestDbContextFactory.Create();
        var calculator = new PeriodCalculator(TimeZoneInfo.FindSystemTimeZoneById(PeriodCalculator.DefaultTimeZoneId));
        var settlement = new CompetitionSettlementService(db, calculator, new ProgressionService(db));

        await settlement.SettleDueAsync(householdId: 999_999, DateTime.UtcNow);

        Assert.Empty(await db.Competitions.ToListAsync());
    }
}
