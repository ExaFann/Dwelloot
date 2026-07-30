using API.Data;
using API.Dtos.Badges;
using API.Entities;
using API.Services;
using API.Services.Progression;
using Microsoft.EntityFrameworkCore;

namespace Dwelloot.Tests.Services.Progression;

public class BadgeListTests
{
    private static async Task<User> AddUserAsync(AppDbContext db, string email)
    {
        var user = new User { Name = email.Split('@')[0], Email = email, UserName = email };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        return user;
    }

    /// <summary>
    /// Creates a throwaway household first, so the subject is never id 1.
    /// </summary>
    /// <remarks>
    /// Logs <c>017</c>/<c>018</c> found two bugs that were invisible because fixture ids started at
    /// 1, which makes a hard-coded 1 indistinguishable from the real value. The decoy plus the
    /// <c>NotEqual(1, ...)</c> assertions below are the standing countermeasure.
    /// </remarks>
    private static async Task<(User Alex, User Sam, Household Household)> PairedHouseholdAsync(AppDbContext db)
    {
        var households = new HouseholdService(db, new DefaultCatalogCopier(db), new InviteCodeGenerator());

        var decoy = await AddUserAsync(db, "decoy@example.com");
        await households.CreateAsync(decoy.Id, "Decoy place");

        var alex = await AddUserAsync(db, "alex@example.com");
        var sam = await AddUserAsync(db, "sam@example.com");

        var created = await households.CreateAsync(alex.Id, "Our place");
        await households.JoinAsync(sam.Id, created.Household!.InviteCode);

        Assert.NotEqual(1, alex.Id);
        Assert.NotEqual(1, sam.Id);
        Assert.NotEqual(1, created.Household!.Id);

        return (alex, sam, created.Household);
    }

    private static async Task UnlockAsync(AppDbContext db, int userId, BadgeCode code, DateTime unlockedAt)
    {
        db.UserBadges.Add(new UserBadge
        {
            UserId = userId,
            BadgeId = (int)code,
            UnlockedAt = unlockedAt
        });

        await db.SaveChangesAsync();
    }

    private static async Task<IReadOnlyList<BadgeResponse>> ListAsync(AppDbContext db, int userId)
    {
        var result = await new BadgeQueryService(db).ListAsync(userId);

        Assert.Equal(BadgeQueryStatus.Ok, result.Status);
        return result.Badges!.Items;
    }

    private static BadgeResponse Find(IReadOnlyList<BadgeResponse> items, BadgeCode code) =>
        items.Single(b => b.Id == (int)code);

    [Fact]
    public async Task Every_badge_comes_back_locked_for_a_user_with_no_unlocks()
    {
        using var db = TestDbContextFactory.Create();
        var (_, sam, _) = await PairedHouseholdAsync(db);

        var items = await ListAsync(db, sam.Id);

        // Driven by the enum rather than a literal 6, so a seventh seeded badge is covered here
        // without editing this test.
        Assert.Equal(Enum.GetValues<BadgeCode>().Length, items.Count);
        Assert.All(items, badge =>
        {
            Assert.False(badge.Unlocked);
            Assert.Null(badge.UnlockedAt);
        });
    }

    [Fact]
    public async Task An_unlocked_badge_reports_its_unlock_time_while_the_rest_stay_locked()
    {
        using var db = TestDbContextFactory.Create();
        var (_, sam, _) = await PairedHouseholdAsync(db);

        var unlockedAt = new DateTime(2026, 7, 27, 9, 30, 0, DateTimeKind.Utc);
        await UnlockAsync(db, sam.Id, BadgeCode.ThreeDayWinStreak, unlockedAt);

        var items = await ListAsync(db, sam.Id);
        var streak = Find(items, BadgeCode.ThreeDayWinStreak);

        Assert.True(streak.Unlocked);
        Assert.Equal(unlockedAt, streak.UnlockedAt);

        // The other five are still locked in the same response - the unlock is not a whole-list flag.
        Assert.All(items.Where(b => b.Id != (int)BadgeCode.ThreeDayWinStreak), badge =>
        {
            Assert.False(badge.Unlocked);
            Assert.Null(badge.UnlockedAt);
        });
    }

    [Fact]
    public async Task Unlock_state_is_per_caller_in_both_directions()
    {
        // Both directions on purpose. Asserting only that Sam sees Sam's badge would pass against a
        // service that ignored userId and joined household-wide - each partner would then see the
        // other's unlock too, and nothing would notice. Sec 4.2 of the handover, applied.
        using var db = TestDbContextFactory.Create();
        var (alex, sam, _) = await PairedHouseholdAsync(db);

        await UnlockAsync(db, alex.Id, BadgeCode.FirstChore, DateTime.UtcNow);
        await UnlockAsync(db, sam.Id, BadgeCode.Century, DateTime.UtcNow);

        var alexItems = await ListAsync(db, alex.Id);
        Assert.True(Find(alexItems, BadgeCode.FirstChore).Unlocked);
        Assert.False(Find(alexItems, BadgeCode.Century).Unlocked);

        var samItems = await ListAsync(db, sam.Id);
        Assert.True(Find(samItems, BadgeCode.Century).Unlocked);
        Assert.False(Find(samItems, BadgeCode.FirstChore).Unlocked);
    }

    [Fact]
    public async Task Criteria_is_returned_for_locked_badges_too()
    {
        // The reason criteria is in the response at all: wireframes.md screen 5 renders every badge,
        // and a locked one with no requirement text is a grey square.
        using var db = TestDbContextFactory.Create();
        var (_, sam, _) = await PairedHouseholdAsync(db);

        var items = await ListAsync(db, sam.Id);

        Assert.All(items, badge =>
        {
            Assert.False(badge.Unlocked);
            Assert.False(string.IsNullOrWhiteSpace(badge.Criteria));
        });
    }

    [Fact]
    public async Task Name_and_criteria_come_from_the_seeded_rows()
    {
        // Compared against db.Badges rather than restated as literals here, so the DTO projection
        // cannot drift from the seed - and so this test does not become a second copy of the copy
        // that log 026's threshold test already pins.
        using var db = TestDbContextFactory.Create();
        var (_, sam, _) = await PairedHouseholdAsync(db);

        var seeded = await db.Badges.ToDictionaryAsync(b => b.Id);
        var items = await ListAsync(db, sam.Id);

        Assert.All(items, badge =>
        {
            Assert.Equal(seeded[badge.Id].Name, badge.Name);
            Assert.Equal(seeded[badge.Id].Criteria, badge.Criteria);
        });
    }

    [Fact]
    public async Task Every_badge_code_is_present_and_nothing_else_is()
    {
        using var db = TestDbContextFactory.Create();
        var (_, sam, _) = await PairedHouseholdAsync(db);

        var items = await ListAsync(db, sam.Id);

        Assert.Equal(
            Enum.GetValues<BadgeCode>().Select(code => (int)code).Order().ToList(),
            items.Select(b => b.Id).ToList());
    }

    [Fact]
    public async Task Items_are_ordered_by_id()
    {
        // Two badge rows added by hand, out of id order, because the seeded six cannot test a sort:
        // their insertion order and their id order are the same, so asserting "1..6" passes with no
        // ORDER BY at all. Log 016 established that the in-memory provider hides exactly this -
        // LINQ-to-Objects OrderBy is stable and the store enumerates in insertion order - so the
        // rows are inserted 99-then-7 to make the two orders differ. Same countermeasure as the
        // (ActivityCategory)99 row in log 016 and the voided-competition-with-a-winner in log 024:
        // a state the normal path cannot produce (a real seventh badge would be another HasData
        // entry with the next id), constructed so the guard becomes observable.
        using var db = TestDbContextFactory.Create();
        var (_, sam, _) = await PairedHouseholdAsync(db);

        db.Badges.Add(new Badge { Id = 99, Name = "Later badge", Criteria = "Added second." });
        await db.SaveChangesAsync();
        db.Badges.Add(new Badge { Id = 7, Name = "Earlier badge", Criteria = "Added first." });
        await db.SaveChangesAsync();

        var ids = (await ListAsync(db, sam.Id)).Select(b => b.Id).ToList();

        Assert.Equal([1, 2, 3, 4, 5, 6, 7, 99], ids);
    }

    [Fact]
    public async Task A_user_with_no_household_still_gets_the_whole_grid()
    {
        // Pins the deliberate absence of the household guard every other list endpoint opens with.
        // Badges have no household_id, so there is nothing to scope - see BadgeQueryService.
        using var db = TestDbContextFactory.Create();
        await PairedHouseholdAsync(db);
        var loner = await AddUserAsync(db, "loner@example.com");

        Assert.Null(loner.HouseholdId);

        var items = await ListAsync(db, loner.Id);

        Assert.Equal(Enum.GetValues<BadgeCode>().Length, items.Count);
        Assert.All(items, badge => Assert.False(badge.Unlocked));
    }

    [Fact]
    public async Task An_unknown_user_is_rejected_rather_than_shown_a_locked_grid()
    {
        using var db = TestDbContextFactory.Create();
        var (_, sam, _) = await PairedHouseholdAsync(db);

        var result = await new BadgeQueryService(db).ListAsync(sam.Id + 1000);

        Assert.Equal(BadgeQueryStatus.UserNotFound, result.Status);
        Assert.Null(result.Badges);
    }

    [Fact]
    public async Task Listing_writes_nothing()
    {
        // Pins the decision not to call EvaluateBadgesAsync on read. Sam meets First chore's
        // criterion here, so an evaluating read would insert a row - and the assertion is made
        // through a second context over the same store, because the context that would have made
        // the write reports its own tracked entities either way (log 015).
        var databaseName = TestDbContextFactory.NewDatabaseName();

        using (var db = TestDbContextFactory.Create(databaseName))
        {
            var (_, sam, household) = await PairedHouseholdAsync(db);
            var chore = await db.Activities.FirstAsync(a => a.HouseholdId == household.Id);

            db.ActivityLogs.Add(new ActivityLog
            {
                ActivityId = chore.Id,
                LoggedByUserId = sam.Id,
                PointsAwarded = 10,
                Status = ActivityLogStatus.Approved,
                CompletedAt = DateTime.UtcNow,
                ApprovedAt = DateTime.UtcNow
            });
            await db.SaveChangesAsync();

            var items = await ListAsync(db, sam.Id);
            Assert.False(Find(items, BadgeCode.FirstChore).Unlocked);
        }

        using var verify = TestDbContextFactory.Create(databaseName);
        Assert.Empty(await verify.UserBadges.ToListAsync());
    }

    [Fact]
    public async Task Badges_unlocked_by_approval_are_readable_afterwards()
    {
        // The end-to-end shape of what task [27] exists for: task [26] unlocks on approval, and
        // until this endpoint there was no way to read that back at all (log 026).
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var chore = await db.Activities.FirstAsync(a => a.HouseholdId == household.Id);
        var logs = new ActivityLogService(db, new ProgressionService(db));

        var logId = (await logs.CreateAsync(sam.Id, chore.Id)).Log!.Id;
        Assert.False(Find(await ListAsync(db, sam.Id), BadgeCode.FirstChore).Unlocked);

        await logs.ApproveAsync(alex.Id, logId);

        var samItems = await ListAsync(db, sam.Id);
        Assert.True(Find(samItems, BadgeCode.FirstChore).Unlocked);
        Assert.NotNull(Find(samItems, BadgeCode.FirstChore).UnlockedAt);

        // Alex approved it; Sam did the chore. The badge is Sam's.
        Assert.False(Find(await ListAsync(db, alex.Id), BadgeCode.FirstChore).Unlocked);
    }
}
