using API.Data;
using API.Data.Defaults;
using API.Dtos.Rewards;
using API.Entities;
using API.Services;
using API.Services.Competitions;
using API.Services.Progression;
using Microsoft.EntityFrameworkCore;

namespace Dwelloot.Tests.Services;

public class RewardServiceMutationTests
{
    private static async Task<User> AddUserAsync(AppDbContext db, string email)
    {
        var user = new User { Name = email.Split('@')[0], Email = email, UserName = email };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        return user;
    }

    /// <summary>
    /// A user with a stocked household. A decoy household is created first, so the subject is never
    /// id 1 — logs <c>017</c>/<c>018</c> found two bugs that a hard-coded 1 had made invisible.
    /// </summary>
    private static async Task<(User User, Household Household)> StockedHouseholdAsync(
        AppDbContext db,
        string email = "alex@example.com",
        string? databaseName = null)
    {
        var households = new HouseholdService(db, new DefaultCatalogCopier(db), new InviteCodeGenerator());

        if (databaseName is null)
        {
            var decoy = await AddUserAsync(db, $"decoy-{email}");
            await households.CreateAsync(decoy.Id, "Decoy place");
        }

        var user = await AddUserAsync(db, email);
        var created = await households.CreateAsync(user.Id, "Our place");

        Assert.NotEqual(1, created.Household!.Id);

        return (user, created.Household);
    }

    private static Task<Reward> AnyRewardAsync(AppDbContext db, int householdId) =>
        db.Rewards.OrderBy(r => r.Id).FirstAsync(r => r.HouseholdId == householdId);

    private static Task<Reward> DayOffAsync(AppDbContext db, int householdId) =>
        db.Rewards.FirstAsync(r => r.HouseholdId == householdId && r.PausesCompetition);

    // ------------------------------------------------------------------ create

    [Fact]
    public async Task CreateAsync_adds_a_reward_to_the_callers_household()
    {
        var databaseName = TestDbContextFactory.NewDatabaseName();
        int rewardId;
        int householdId;

        using (var db = TestDbContextFactory.Create(databaseName))
        {
            var (user, household) = await StockedHouseholdAsync(db);
            householdId = household.Id;

            var result = await new RewardService(db).CreateAsync(
                user.Id, new CreateRewardRequest("Breakfast in bed", 50));

            Assert.Equal(RewardMutationStatus.Ok, result.Status);
            Assert.Equal("Breakfast in bed", result.Reward!.Title);
            Assert.Equal(50, result.Reward.CoinCost);
            Assert.False(result.Reward.PausesCompetition);
            rewardId = result.Reward.Id;
        }

        // Second context: querying through the one that made the change returns the tracked entity,
        // which reflects it whether or not SaveChanges ran (log 015).
        using var verify = TestDbContextFactory.Create(databaseName);
        var saved = await verify.Rewards.SingleAsync(r => r.Id == rewardId);
        Assert.Equal(householdId, saved.HouseholdId);
        Assert.Equal(50, saved.CoinCost);
        Assert.Null(saved.ArchivedAt);
    }

    [Fact]
    public async Task CreateAsync_rejects_a_caller_with_no_household()
    {
        using var db = TestDbContextFactory.Create();
        var loner = await AddUserAsync(db, "loner@example.com");

        var result = await new RewardService(db).CreateAsync(
            loner.Id, new CreateRewardRequest("Anything", 10));

        Assert.Equal(RewardMutationStatus.NoHousehold, result.Status);
        Assert.Empty(await db.Rewards.ToListAsync());
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(-500)]
    public async Task CreateAsync_rejects_non_positive_coin_costs(int coinCost)
    {
        using var db = TestDbContextFactory.Create();
        var (user, household) = await StockedHouseholdAsync(db);
        var before = await db.Rewards.CountAsync(r => r.HouseholdId == household.Id);

        var result = await new RewardService(db).CreateAsync(
            user.Id, new CreateRewardRequest("Free stuff", coinCost));

        Assert.Equal(RewardMutationStatus.InvalidCoinCost, result.Status);
        Assert.Null(result.Reward);

        // Assert the absence, not just the error: a rejected write must leave the store untouched.
        Assert.Equal(before, await db.Rewards.CountAsync(r => r.HouseholdId == household.Id));
        Assert.DoesNotContain(await db.Rewards.ToListAsync(), r => r.Title == "Free stuff");
    }

    /// <summary>
    /// Replaces <c>CreateAsync_round_trips_PausesCompetition</c>, which asserted the behaviour task
    /// [69] removes.
    ///
    /// Voiding a day is now a property of the seeded catalogue alone. A checkbox labelled "pauses the
    /// duel" on every reward form invites a second one by accident and puzzles the partner who later
    /// meets it — owner's decision, 2026-08-07.
    /// </summary>
    [Fact]
    public async Task CreateAsync_never_produces_a_pausing_reward()
    {
        using var db = TestDbContextFactory.Create();
        var (user, _) = await StockedHouseholdAsync(db);

        var result = await new RewardService(db).CreateAsync(
            user.Id, new CreateRewardRequest("Duvet day", 75));

        Assert.False(result.Reward!.PausesCompetition);
        Assert.False((await db.Rewards.SingleAsync(r => r.Id == result.Reward.Id)).PausesCompetition);
    }

    /// <summary>
    /// Archiving it would be a one-way door: <see cref="CreateRewardRequest"/> no longer carries the
    /// flag, so nothing in the API could make another one. Refused rather than warned about.
    /// </summary>
    [Fact]
    public async Task DeleteAsync_refuses_to_archive_a_pausing_reward()
    {
        using var db = TestDbContextFactory.Create();
        var (user, household) = await StockedHouseholdAsync(db);
        var pausing = await db.Rewards.FirstAsync(
            r => r.HouseholdId == household.Id && r.PausesCompetition);

        var result = await new RewardService(db).DeleteAsync(user.Id, pausing.Id);

        Assert.Equal(RewardMutationStatus.CannotDeletePausingReward, result.Status);
        // The refusal must leave it usable, not merely unreported.
        Assert.Null((await db.Rewards.SingleAsync(r => r.Id == pausing.Id)).ArchivedAt);
    }

    /// <summary>
    /// The other direction. A rule that refused *every* delete would pass the test above, and the
    /// store would quietly become read-only.
    /// </summary>
    [Fact]
    public async Task DeleteAsync_still_archives_an_ordinary_reward()
    {
        using var db = TestDbContextFactory.Create();
        var (user, household) = await StockedHouseholdAsync(db);
        var ordinary = await db.Rewards.FirstAsync(
            r => r.HouseholdId == household.Id && !r.PausesCompetition);

        var result = await new RewardService(db).DeleteAsync(user.Id, ordinary.Id);

        Assert.Equal(RewardMutationStatus.Ok, result.Status);
        Assert.NotNull((await db.Rewards.SingleAsync(r => r.Id == ordinary.Id)).ArchivedAt);
    }

    /// <summary>
    /// Price stays editable, and that is load-bearing rather than an oversight: task [29]'s argument
    /// was that price is what actually gates abuse of a day-off reward. Removing the flag while also
    /// freezing the price would have taken that gate away.
    /// </summary>
    [Fact]
    public async Task UpdateAsync_can_still_reprice_a_pausing_reward()
    {
        using var db = TestDbContextFactory.Create();
        var (user, household) = await StockedHouseholdAsync(db);
        var pausing = await db.Rewards.FirstAsync(
            r => r.HouseholdId == household.Id && r.PausesCompetition);

        var result = await new RewardService(db).UpdateAsync(
            user.Id, pausing.Id, new PatchRewardRequest(null, 250));

        Assert.Equal(RewardMutationStatus.Ok, result.Status);
        Assert.Equal(250, result.Reward!.CoinCost);
        // And it is still the pausing reward afterwards — a patch must not clear the flag either.
        Assert.True((await db.Rewards.SingleAsync(r => r.Id == pausing.Id)).PausesCompetition);
    }

    [Fact]
    public async Task CreateAsync_trims_the_title()
    {
        using var db = TestDbContextFactory.Create();
        var (user, _) = await StockedHouseholdAsync(db);

        var result = await new RewardService(db).CreateAsync(
            user.Id, new CreateRewardRequest("   Padded title   ", 20));

        Assert.Equal("Padded title", result.Reward!.Title);
    }

    // ------------------------------------------------------------------ update

    [Fact]
    public async Task UpdateAsync_changes_the_supplied_fields()
    {
        using var db = TestDbContextFactory.Create();
        var (user, household) = await StockedHouseholdAsync(db);
        var reward = await AnyRewardAsync(db, household.Id);

        var result = await new RewardService(db).UpdateAsync(
            user.Id, reward.Id, new PatchRewardRequest("Renamed", 99));

        Assert.Equal(RewardMutationStatus.Ok, result.Status);
        Assert.Equal("Renamed", result.Reward!.Title);
        Assert.Equal(99, result.Reward.CoinCost);
    }

    [Fact]
    public async Task UpdateAsync_leaves_omitted_fields_alone()
    {
        // The whole point of PATCH. Writing every field unconditionally would blank out anything the
        // client did not send.
        using var db = TestDbContextFactory.Create();
        var (user, household) = await StockedHouseholdAsync(db);
        var reward = await DayOffAsync(db, household.Id);
        var originalTitle = reward.Title;
        var originalCost = reward.CoinCost;

        var result = await new RewardService(db).UpdateAsync(
            user.Id, reward.Id, new PatchRewardRequest(null, null));

        Assert.Equal(RewardMutationStatus.Ok, result.Status);
        Assert.Equal(originalTitle, result.Reward!.Title);
        Assert.Equal(originalCost, result.Reward.CoinCost);
        Assert.True(result.Reward.PausesCompetition);
    }

    [Fact]
    public async Task UpdateAsync_refuses_another_households_reward_and_leaves_it_unchanged()
    {
        using var db = TestDbContextFactory.Create();
        var (mine, _) = await StockedHouseholdAsync(db, "alex@example.com");
        var (_, theirHousehold) = await StockedHouseholdAsync(db, "stranger@example.com");
        var theirs = await AnyRewardAsync(db, theirHousehold.Id);
        var originalTitle = theirs.Title;

        var result = await new RewardService(db).UpdateAsync(
            mine.Id, theirs.Id, new PatchRewardRequest("Hijacked", 1));

        Assert.Equal(RewardMutationStatus.NotFound, result.Status);
        Assert.Equal(originalTitle, (await db.Rewards.SingleAsync(r => r.Id == theirs.Id)).Title);
    }

    [Fact]
    public async Task UpdateAsync_rejects_non_positive_coin_costs()
    {
        using var db = TestDbContextFactory.Create();
        var (user, household) = await StockedHouseholdAsync(db);
        var reward = await AnyRewardAsync(db, household.Id);
        var originalCost = reward.CoinCost;

        var result = await new RewardService(db).UpdateAsync(
            user.Id, reward.Id, new PatchRewardRequest("Renamed anyway", 0));

        Assert.Equal(RewardMutationStatus.InvalidCoinCost, result.Status);

        // Neither field is written - the guard runs before any assignment, so the rename is refused
        // along with the price.
        var unchanged = await db.Rewards.SingleAsync(r => r.Id == reward.Id);
        Assert.Equal(originalCost, unchanged.CoinCost);
        Assert.NotEqual("Renamed anyway", unchanged.Title);
    }

    /// <summary>
    /// Inverted by task [69]. This used to assert that a patch could both set and clear the flag;
    /// the flag is no longer expressible in the request at all, so the property under test is that
    /// **an ordinary reward can never become a pausing one and vice versa**.
    ///
    /// Asserted in both directions on purpose. Removing the field from the DTO makes the *set* case
    /// unreachable by construction, but nothing stops a future patch handler from clearing the flag
    /// as a side effect of an unrelated write — which would silently turn the seeded day-off reward
    /// into an ordinary one, and no error would ever be raised.
    /// </summary>
    [Fact]
    public async Task UpdateAsync_cannot_change_PausesCompetition_in_either_direction()
    {
        using var db = TestDbContextFactory.Create();
        var (user, household) = await StockedHouseholdAsync(db);
        var service = new RewardService(db);

        var ordinary = await AnyRewardAsync(db, household.Id);
        Assert.False(ordinary.PausesCompetition);
        var renamed = await service.UpdateAsync(
            user.Id, ordinary.Id, new PatchRewardRequest("Renamed", 42));
        Assert.False(renamed.Reward!.PausesCompetition);

        var dayOff = await DayOffAsync(db, household.Id);
        var repriced = await service.UpdateAsync(user.Id, dayOff.Id, new PatchRewardRequest(null, 99));
        Assert.True(repriced.Reward!.PausesCompetition);
        Assert.Equal(99, repriced.Reward.CoinCost);
    }

    // ------------------------------------------------------------------ archive

    [Fact]
    public async Task DeleteAsync_removes_the_reward_from_the_store_but_keeps_the_row()
    {
        var databaseName = TestDbContextFactory.NewDatabaseName();
        int rewardId;

        using (var db = TestDbContextFactory.Create(databaseName))
        {
            var (user, household) = await StockedHouseholdAsync(db);
            var reward = await AnyRewardAsync(db, household.Id);
            rewardId = reward.Id;

            Assert.Equal(RewardMutationStatus.Ok, (await new RewardService(db).DeleteAsync(user.Id, rewardId)).Status);

            var listed = await new RewardService(db).ListAsync(user.Id, new RewardQuery { PageSize = 100 });
            Assert.Equal(DefaultRewards.All.Count - 1, listed.Page!.Total);
            Assert.DoesNotContain(listed.Page.Items, item => item.Id == rewardId);
        }

        using var verify = TestDbContextFactory.Create(databaseName);
        var archived = await verify.Rewards.SingleOrDefaultAsync(r => r.Id == rewardId);
        Assert.NotNull(archived);
        Assert.NotNull(archived.ArchivedAt);
    }

    [Fact]
    public async Task DeleteAsync_keeps_the_redemptions_of_the_archived_reward()
    {
        // The integrity property the whole approach exists for, and the direct analogue of log 017's
        // "keeps the logged history". A hard delete would cascade these away.
        using var db = TestDbContextFactory.Create();
        var (user, household) = await StockedHouseholdAsync(db);
        var reward = await AnyRewardAsync(db, household.Id);

        db.Redemptions.Add(new Redemption { UserId = user.Id, RewardId = reward.Id, RedeemedAt = DateTime.UtcNow });
        await db.SaveChangesAsync();

        await new RewardService(db).DeleteAsync(user.Id, reward.Id);

        Assert.Single(await db.Redemptions.Where(r => r.RewardId == reward.Id).ToListAsync());
    }

    [Fact]
    public async Task An_archived_pausing_reward_still_voids_the_day_it_was_redeemed_in()
    {
        // The hole a hard delete opened, asserted through real settlement rather than through an error
        // code: partner redeems the day off, the reward is then archived, and the closed period must
        // still settle as voided. If HasPausingRedemptionAsync ever filtered ArchivedAt, this fails.
        using var db = TestDbContextFactory.Create();
        var households = new HouseholdService(db, new DefaultCatalogCopier(db), new InviteCodeGenerator());
        var decoy = await AddUserAsync(db, "decoy@example.com");
        await households.CreateAsync(decoy.Id, "Decoy place");

        var alex = await AddUserAsync(db, "alex@example.com");
        var sam = await AddUserAsync(db, "sam@example.com");
        var created = await households.CreateAsync(alex.Id, "Our place");
        await households.JoinAsync(sam.Id, created.Household!.InviteCode);
        var householdId = created.Household.Id;

        var calculator = new PeriodCalculator(TimeZoneInfo.FindSystemTimeZoneById("Pacific/Auckland"));
        var settlement = new CompetitionSettlementService(db, calculator, new ProgressionService(db));

        // A period that has already closed, so settlement will run for it.
        var yesterday = calculator.PeriodContaining(
            CompetitionPeriodType.Daily, DateTime.UtcNow.AddDays(-1));

        var dayOff = await DayOffAsync(db, householdId);
        db.Redemptions.Add(new Redemption
        {
            UserId = sam.Id,
            RewardId = dayOff.Id,
            RedeemedAt = yesterday.StartUtc.AddHours(2)
        });
        await db.SaveChangesAsync();

        /*
         * Archived directly rather than through `DeleteAsync`, which task [69] now refuses for a
         * pausing reward.
         *
         * The property under test is unchanged and still matters: `HasPausingRedemptionAsync` must
         * not filter `ArchivedAt` (handover §4.2). Households that archived their day-off reward
         * before [69] still exist in the database, and their closed periods must keep settling the
         * way they did — so this row is reachable state even though the API can no longer produce
         * it. Setting it up through the service would now be testing the refusal instead.
         */
        dayOff.ArchivedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        Assert.NotNull((await db.Rewards.SingleAsync(r => r.Id == dayOff.Id)).ArchivedAt);

        var standing = await settlement.GetStandingAsync(householdId, yesterday);

        Assert.True(standing.Voided, "archiving the reward must not un-void the day it was redeemed in");
    }

    [Fact]
    public async Task An_archived_reward_can_no_longer_be_edited_or_archived_again()
    {
        using var db = TestDbContextFactory.Create();
        var (user, household) = await StockedHouseholdAsync(db);
        var reward = await AnyRewardAsync(db, household.Id);
        var service = new RewardService(db);

        await service.DeleteAsync(user.Id, reward.Id);

        var edit = await service.UpdateAsync(user.Id, reward.Id, new PatchRewardRequest("Back again", null));
        var reArchive = await service.DeleteAsync(user.Id, reward.Id);

        Assert.Equal(RewardMutationStatus.NotFound, edit.Status);
        Assert.Equal(RewardMutationStatus.NotFound, reArchive.Status);
        Assert.NotEqual("Back again", (await db.Rewards.SingleAsync(r => r.Id == reward.Id)).Title);
    }

    [Fact]
    public async Task DeleteAsync_refuses_another_households_reward_which_stays_listed()
    {
        using var db = TestDbContextFactory.Create();
        var (mine, _) = await StockedHouseholdAsync(db, "alex@example.com");
        var (theirUser, theirHousehold) = await StockedHouseholdAsync(db, "stranger@example.com");
        var theirs = await AnyRewardAsync(db, theirHousehold.Id);

        var result = await new RewardService(db).DeleteAsync(mine.Id, theirs.Id);

        Assert.Equal(RewardMutationStatus.NotFound, result.Status);
        Assert.Null((await db.Rewards.SingleAsync(r => r.Id == theirs.Id)).ArchivedAt);

        var stillListed = await new RewardService(db).ListAsync(theirUser.Id, new RewardQuery { PageSize = 100 });
        Assert.Contains(stillListed.Page!.Items, item => item.Id == theirs.Id);
    }

    /// <summary>Records the pool <see cref="LootBoxService"/> actually hands the roller.</summary>
    private sealed class PoolSpyRoller : ILootBoxRoller
    {
        public IReadOnlyList<int> Pool { get; private set; } = [];

        public LootRoll Roll(CompetitionPeriodType periodType, IReadOnlyList<int> rewardPool)
        {
            Pool = rewardPool;
            return rewardPool.Count > 0 ? LootRoll.OfReward(rewardPool[0]) : LootRoll.OfCoins(10);
        }
    }

    [Fact]
    public async Task Archived_rewards_are_excluded_from_the_loot_box_prize_pool()
    {
        // Makes true the claim LootBoxService's comment has made since task [25], against a column that
        // did not exist. It matters because opening a box writes a zero-cost Redemption for the prize,
        // which would put a reward the household removed back in front of them.
        //
        // Driven through LootBoxService.OpenAsync with a spy roller, so the pool asserted on is the one
        // the real EligibleRewardPoolAsync built. Written first as a LINQ query in the test itself,
        // which asserted nothing but a copy of the production query - the same self-referential trap
        // this project has hit five times.
        using var db = TestDbContextFactory.Create();
        var households = new HouseholdService(db, new DefaultCatalogCopier(db), new InviteCodeGenerator());
        var decoy = await AddUserAsync(db, "decoy@example.com");
        await households.CreateAsync(decoy.Id, "Decoy place");

        var alex = await AddUserAsync(db, "alex@example.com");
        var sam = await AddUserAsync(db, "sam@example.com");
        var created = await households.CreateAsync(alex.Id, "Our place");
        await households.JoinAsync(sam.Id, created.Household!.InviteCode);
        var householdId = created.Household.Id;

        var archived = await db.Rewards
            .OrderBy(r => r.Id)
            .FirstAsync(r => r.HouseholdId == householdId && !r.PausesCompetition);

        await new RewardService(db).DeleteAsync(alex.Id, archived.Id);

        var competition = new Competition
        {
            HouseholdId = householdId,
            PeriodType = CompetitionPeriodType.Daily,
            PeriodStart = new DateTime(2026, 7, 20, 12, 0, 0, DateTimeKind.Utc),
            PeriodEnd = new DateTime(2026, 7, 21, 12, 0, 0, DateTimeKind.Utc),
            WinnerUserId = sam.Id,
            WinnerPoints = 30,
            LoserPoints = 10,
            SettledAt = new DateTime(2026, 7, 21, 12, 0, 0, DateTimeKind.Utc)
        };
        db.Competitions.Add(competition);
        await db.SaveChangesAsync();

        var roller = new PoolSpyRoller();
        var result = await new LootBoxService(db, roller).OpenAsync(sam.Id, householdId, competition.Id);

        Assert.Equal(LootBoxStatus.Ok, result.Status);
        Assert.DoesNotContain(archived.Id, roller.Pool);

        // And the pool is not simply empty - the other six non-pausing rewards are still eligible, so
        // the exclusion is specific rather than a filter that removed everything.
        Assert.Equal(DefaultRewards.All.Count - 2, roller.Pool.Count);
        Assert.NotEqual(archived.Id, result.Box!.Reward!.Id);
    }

    [Fact]
    public async Task A_default_copied_reward_behaves_exactly_like_a_custom_one()
    {
        // No default-vs-custom distinction - the point of copy-on-creation. Both are edited and
        // archived through the same path with the same result.
        using var db = TestDbContextFactory.Create();
        var (user, household) = await StockedHouseholdAsync(db);
        var service = new RewardService(db);

        var copied = await AnyRewardAsync(db, household.Id);
        var custom = (await service.CreateAsync(user.Id, new CreateRewardRequest("Custom treat", 60))).Reward!;

        Assert.Equal(RewardMutationStatus.Ok, (await service.UpdateAsync(user.Id, copied.Id, new PatchRewardRequest("A", 11))).Status);
        Assert.Equal(RewardMutationStatus.Ok, (await service.UpdateAsync(user.Id, custom.Id, new PatchRewardRequest("B", 12))).Status);
        Assert.Equal(RewardMutationStatus.Ok, (await service.DeleteAsync(user.Id, copied.Id)).Status);
        Assert.Equal(RewardMutationStatus.Ok, (await service.DeleteAsync(user.Id, custom.Id)).Status);

        var listed = await service.ListAsync(user.Id, new RewardQuery { PageSize = 100 });
        Assert.DoesNotContain(listed.Page!.Items, item => item.Id == copied.Id || item.Id == custom.Id);
    }
}
