using API.Data;
using API.Entities;
using API.Services;
using API.Services.Competitions;
using Microsoft.EntityFrameworkCore;

namespace Dwelloot.Tests.Services.Competitions;

public class CompetitionsCurrentTests
{
    private static readonly TimeZoneInfo Auckland = TimeZoneInfo.FindSystemTimeZoneById("Pacific/Auckland");

    private static readonly PeriodCalculator Calculator = new(Auckland);

    private static DateTime LocalAsUtc(int year, int month, int day, int hour = 0) =>
        TimeZoneInfo.ConvertTimeToUtc(
            new DateTime(year, month, day, hour, 0, 0, DateTimeKind.Unspecified),
            Auckland);

    /// <summary>Midday on 15 July 2026 — inside the day, so the daily period is in progress.</summary>
    private static readonly DateTime Midday = LocalAsUtc(2026, 7, 15, 12);

    private static readonly CompetitionPeriod Today =
        Calculator.PeriodContaining(CompetitionPeriodType.Daily, Midday);

    private static CompetitionQueryService ServiceFor(AppDbContext db) =>
        new(db, Calculator, new CompetitionSettlementService(db, Calculator));

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

    private static Task<Activity> ChoreAsync(AppDbContext db, int householdId) =>
        db.Activities.SingleAsync(a => a.HouseholdId == householdId && a.Title == "Vacuum");

    private static async Task AddApprovedLogAsync(
        AppDbContext db,
        int activityId,
        int userId,
        int points,
        DateTime completedAtUtc)
    {
        db.ActivityLogs.Add(new ActivityLog
        {
            ActivityId = activityId,
            LoggedByUserId = userId,
            PointsAwarded = points,
            Status = ActivityLogStatus.Approved,
            CompletedAt = completedAtUtc,
            ApprovedAt = completedAtUtc
        });

        await db.SaveChangesAsync();
    }

    private static async Task AddPausingRedemptionAsync(AppDbContext db, int householdId, int userId, DateTime atUtc)
    {
        var reward = await db.Rewards.FirstAsync(r => r.HouseholdId == householdId && r.PausesCompetition);
        db.Redemptions.Add(new Redemption { UserId = userId, RewardId = reward.Id, RedeemedAt = atUtc });
        await db.SaveChangesAsync();
    }

    // ---------- the live standing ----------

    [Fact]
    public async Task Returns_the_current_daily_period_bounds()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, _, household) = await PairedHouseholdAsync(db);

        var result = await ServiceFor(db).GetCurrentAsync(
            alex.Id, household.Id, CompetitionPeriodType.Daily, Midday);

        Assert.Equal(CompetitionQueryStatus.Ok, result.Status);
        Assert.Equal(CompetitionPeriodType.Daily, result.Standing!.PeriodType);
        Assert.Equal(Today.StartUtc, result.Standing.PeriodStart);
        Assert.Equal(Today.EndUtc, result.Standing.PeriodEnd);
        Assert.False(result.Standing.Settled);
    }

    [Fact]
    public async Task MyPoints_and_PartnerPoints_swap_when_the_other_partner_asks()
    {
        // The perspective flip. A single-caller test cannot distinguish "my points" from "the
        // higher score", so both directions are asserted against the same data.
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var chore = await ChoreAsync(db, household.Id);

        await AddApprovedLogAsync(db, chore.Id, alex.Id, 10, Today.StartUtc.AddHours(2));
        await AddApprovedLogAsync(db, chore.Id, sam.Id, 25, Today.StartUtc.AddHours(3));

        var service = ServiceFor(db);
        var forAlex = await service.GetCurrentAsync(alex.Id, household.Id, CompetitionPeriodType.Daily, Midday);
        var forSam = await service.GetCurrentAsync(sam.Id, household.Id, CompetitionPeriodType.Daily, Midday);

        Assert.Equal(10, forAlex.Standing!.MyPoints);
        Assert.Equal(25, forAlex.Standing.PartnerPoints);
        Assert.Equal(25, forSam.Standing!.MyPoints);
        Assert.Equal(10, forSam.Standing.PartnerPoints);
    }

    [Fact]
    public async Task Only_approved_logs_inside_the_period_count()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, _, household) = await PairedHouseholdAsync(db);
        var chore = await ChoreAsync(db, household.Id);

        await AddApprovedLogAsync(db, chore.Id, alex.Id, 10, Today.StartUtc.AddHours(2));
        await AddApprovedLogAsync(db, chore.Id, alex.Id, 99, Today.StartUtc.AddTicks(-1));

        db.ActivityLogs.Add(new ActivityLog
        {
            ActivityId = chore.Id,
            LoggedByUserId = alex.Id,
            PointsAwarded = 99,
            Status = ActivityLogStatus.Pending,
            CompletedAt = Today.StartUtc.AddHours(4)
        });
        await db.SaveChangesAsync();

        var result = await ServiceFor(db).GetCurrentAsync(
            alex.Id, household.Id, CompetitionPeriodType.Daily, Midday);

        Assert.Equal(10, result.Standing!.MyPoints);
    }

    [Fact]
    public async Task The_live_standing_matches_what_settlement_records_for_the_same_data()
    {
        // The two paths must agree, or the dashboard shows one number all day and the settled
        // result shows another.
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var chore = await ChoreAsync(db, household.Id);

        await AddApprovedLogAsync(db, chore.Id, alex.Id, 10, Today.StartUtc.AddHours(2));
        await AddApprovedLogAsync(db, chore.Id, sam.Id, 25, Today.StartUtc.AddHours(3));

        var live = await ServiceFor(db).GetCurrentAsync(
            alex.Id, household.Id, CompetitionPeriodType.Daily, Midday);

        var settled = await new CompetitionSettlementService(db, Calculator)
            .SettlePeriodAsync(household.Id, Today, Today.EndUtc.AddDays(3));

        Assert.Equal(settled.Competition!.WinnerPoints, live.Standing!.PartnerPoints);
        Assert.Equal(settled.Competition.LoserPoints, live.Standing.MyPoints);
    }

    [Fact]
    public async Task Voided_is_true_when_a_pausing_reward_was_redeemed_in_the_period()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, _, household) = await PairedHouseholdAsync(db);

        var before = await ServiceFor(db).GetCurrentAsync(
            alex.Id, household.Id, CompetitionPeriodType.Daily, Midday);
        Assert.False(before.Standing!.Voided);

        await AddPausingRedemptionAsync(db, household.Id, alex.Id, Today.StartUtc.AddHours(4));

        var after = await ServiceFor(db).GetCurrentAsync(
            alex.Id, household.Id, CompetitionPeriodType.Daily, Midday);

        Assert.True(after.Standing!.Voided);
    }

    [Fact]
    public async Task A_weekly_window_can_be_requested()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, _, household) = await PairedHouseholdAsync(db);

        var result = await ServiceFor(db).GetCurrentAsync(
            alex.Id, household.Id, CompetitionPeriodType.Weekly, Midday);

        var week = Calculator.PeriodContaining(CompetitionPeriodType.Weekly, Midday);
        Assert.Equal(CompetitionPeriodType.Weekly, result.Standing!.PeriodType);
        Assert.Equal(week.StartUtc, result.Standing.PeriodStart);
        Assert.Equal(week.EndUtc, result.Standing.PeriodEnd);
    }

    // ---------- lazy settlement ----------

    [Fact]
    public async Task Calling_the_endpoint_settles_a_newly_closed_period()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var chore = await ChoreAsync(db, household.Id);
        await AddApprovedLogAsync(db, chore.Id, sam.Id, 20, Today.StartUtc.AddHours(2));

        Assert.Empty(await db.Competitions.ToListAsync());

        // Asked on the following day, so "today" has closed.
        await ServiceFor(db).GetCurrentAsync(
            alex.Id, household.Id, CompetitionPeriodType.Daily, Today.EndUtc.AddDays(3).AddHours(12));

        var settled = await db.Competitions.SingleOrDefaultAsync(c =>
            c.PeriodType == CompetitionPeriodType.Daily && c.PeriodStart == Today.StartUtc);

        Assert.NotNull(settled);
        Assert.Equal(sam.Id, settled!.WinnerUserId);
    }

    // ---------- the loot box ----------

    [Fact]
    public async Task No_loot_box_when_nothing_has_closed()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, _, household) = await PairedHouseholdAsync(db);

        var result = await ServiceFor(db).GetCurrentAsync(
            alex.Id, household.Id, CompetitionPeriodType.Daily, Midday);

        Assert.Null(result.Standing!.UnopenedLootBox);
    }

    [Fact]
    public async Task A_win_surfaces_a_box_for_the_winner_and_not_the_loser()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var chore = await ChoreAsync(db, household.Id);

        await AddApprovedLogAsync(db, chore.Id, sam.Id, 30, Today.StartUtc.AddHours(2));
        await AddApprovedLogAsync(db, chore.Id, alex.Id, 10, Today.StartUtc.AddHours(3));

        var asOf = Today.EndUtc.AddDays(3).AddHours(12);
        var service = ServiceFor(db);

        var forSam = await service.GetCurrentAsync(sam.Id, household.Id, CompetitionPeriodType.Daily, asOf);
        var forAlex = await service.GetCurrentAsync(alex.Id, household.Id, CompetitionPeriodType.Daily, asOf);

        Assert.NotNull(forSam.Standing!.UnopenedLootBox);
        Assert.True(forSam.Standing.UnopenedLootBox!.Won);
        Assert.False(forSam.Standing.UnopenedLootBox.IsWinWin);
        Assert.Null(forAlex.Standing!.UnopenedLootBox);
    }

    [Fact]
    public async Task A_win_win_surfaces_a_box_for_both_partners()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var chore = await ChoreAsync(db, household.Id);

        await AddApprovedLogAsync(db, chore.Id, sam.Id, 15, Today.StartUtc.AddHours(2));
        await AddApprovedLogAsync(db, chore.Id, alex.Id, 15, Today.StartUtc.AddHours(3));

        var asOf = Today.EndUtc.AddDays(3).AddHours(12);
        var service = ServiceFor(db);

        var forSam = await service.GetCurrentAsync(sam.Id, household.Id, CompetitionPeriodType.Daily, asOf);
        var forAlex = await service.GetCurrentAsync(alex.Id, household.Id, CompetitionPeriodType.Daily, asOf);

        Assert.True(forSam.Standing!.UnopenedLootBox!.IsWinWin);
        Assert.True(forAlex.Standing!.UnopenedLootBox!.IsWinWin);
        Assert.Equal(forSam.Standing.UnopenedLootBox.CompetitionId, forAlex.Standing.UnopenedLootBox.CompetitionId);
    }

    [Fact]
    public async Task A_voided_period_surfaces_no_box_for_either_partner()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var chore = await ChoreAsync(db, household.Id);

        await AddApprovedLogAsync(db, chore.Id, sam.Id, 30, Today.StartUtc.AddHours(2));
        await AddPausingRedemptionAsync(db, household.Id, alex.Id, Today.StartUtc.AddHours(6));

        var asOf = Today.EndUtc.AddDays(3).AddHours(12);
        var service = ServiceFor(db);

        Assert.Null((await service.GetCurrentAsync(sam.Id, household.Id, CompetitionPeriodType.Daily, asOf)).Standing!.UnopenedLootBox);
        Assert.Null((await service.GetCurrentAsync(alex.Id, household.Id, CompetitionPeriodType.Daily, asOf)).Standing!.UnopenedLootBox);
    }

    [Fact]
    public async Task A_voided_period_offers_no_box_even_if_it_somehow_records_a_winner()
    {
        // Settlement never produces this: BuildCompetition returns early when voided, leaving no
        // winner and no win-win, so the winner check alone already excludes voided periods and the
        // !IsVoided guard is redundant against today's code. Mutation testing showed exactly that -
        // deleting the guard broke nothing.
        //
        // The guard is kept because voided-with-a-winner is precisely what a future "record who
        // would have won" change to settlement would introduce, and silently handing out loot boxes
        // for a day that did not run a competition is a real bug. Constructed by hand here so the
        // guard is actually tested rather than merely present.
        using var db = TestDbContextFactory.Create();
        var (_, sam, household) = await PairedHouseholdAsync(db);

        db.Competitions.Add(new Competition
        {
            HouseholdId = household.Id,
            PeriodType = CompetitionPeriodType.Daily,
            PeriodStart = Today.StartUtc,
            PeriodEnd = Today.EndUtc,
            WinnerUserId = sam.Id,
            WinnerPoints = 30,
            LoserPoints = 0,
            IsVoided = true,
            SettledAt = Today.EndUtc
        });
        await db.SaveChangesAsync();

        var result = await ServiceFor(db).GetCurrentAsync(
            sam.Id, household.Id, CompetitionPeriodType.Daily, Today.EndUtc.AddDays(3).AddHours(12));

        Assert.Null(result.Standing!.UnopenedLootBox);
    }

    [Fact]
    public async Task Claiming_removes_the_box_from_the_response()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var chore = await ChoreAsync(db, household.Id);
        await AddApprovedLogAsync(db, chore.Id, sam.Id, 30, Today.StartUtc.AddHours(2));

        var asOf = Today.EndUtc.AddDays(3).AddHours(12);
        var service = ServiceFor(db);

        var before = await service.GetCurrentAsync(sam.Id, household.Id, CompetitionPeriodType.Daily, asOf);
        var competitionId = before.Standing!.UnopenedLootBox!.CompetitionId;

        db.CompetitionClaims.Add(new CompetitionClaim
        {
            CompetitionId = competitionId,
            UserId = sam.Id,
            OpenedAt = asOf
        });
        await db.SaveChangesAsync();

        var after = await service.GetCurrentAsync(sam.Id, household.Id, CompetitionPeriodType.Daily, asOf);

        Assert.Null(after.Standing!.UnopenedLootBox);
        Assert.NotEqual(0, alex.Id);
    }

    [Fact]
    public async Task The_oldest_unopened_box_is_offered_first()
    {
        // A partner returning after several days should work through them in order rather than
        // seeing the most recent and silently losing the rest.
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var chore = await ChoreAsync(db, household.Id);

        var yesterday = Calculator.PeriodContaining(CompetitionPeriodType.Daily, Today.StartUtc.AddTicks(-1));
        await AddApprovedLogAsync(db, chore.Id, sam.Id, 30, yesterday.StartUtc.AddHours(2));
        await AddApprovedLogAsync(db, chore.Id, sam.Id, 30, Today.StartUtc.AddHours(2));

        var asOf = Today.EndUtc.AddDays(3).AddHours(12);
        var result = await ServiceFor(db).GetCurrentAsync(sam.Id, household.Id, CompetitionPeriodType.Daily, asOf);

        var offered = await db.Competitions.SingleAsync(c => c.Id == result.Standing!.UnopenedLootBox!.CompetitionId);
        Assert.Equal(yesterday.StartUtc, offered.PeriodStart);
        Assert.NotEqual(0, alex.Id);
    }

    // ---------- access ----------

    [Fact]
    public async Task A_non_member_is_refused()
    {
        using var db = TestDbContextFactory.Create();
        var (_, _, household) = await PairedHouseholdAsync(db);
        var stranger = await AddUserAsync(db, "stranger@example.com");

        var result = await ServiceFor(db).GetCurrentAsync(
            stranger.Id, household.Id, CompetitionPeriodType.Daily, Midday);

        Assert.Equal(CompetitionQueryStatus.NotAMember, result.Status);
        Assert.Null(result.Standing);
    }
}
