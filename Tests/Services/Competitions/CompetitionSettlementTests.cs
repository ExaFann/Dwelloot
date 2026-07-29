using API.Data;
using API.Entities;
using API.Services;
using API.Services.Competitions;
using Microsoft.EntityFrameworkCore;

namespace Dwelloot.Tests.Services.Competitions;

public class CompetitionSettlementTests
{
    private static readonly TimeZoneInfo Auckland = TimeZoneInfo.FindSystemTimeZoneById("Pacific/Auckland");

    private static readonly PeriodCalculator Calculator = new(Auckland);

    private static DateTime LocalAsUtc(int year, int month, int day, int hour = 0) =>
        TimeZoneInfo.ConvertTimeToUtc(
            new DateTime(year, month, day, hour, 0, 0, DateTimeKind.Unspecified),
            Auckland);

    /// <summary>The day of 15 July 2026, and an instant safely after it has closed.</summary>
    private static readonly CompetitionPeriod TheDay =
        Calculator.PeriodContaining(CompetitionPeriodType.Daily, LocalAsUtc(2026, 7, 15, 12));

    private static readonly DateTime WellAfterTheDay = TheDay.EndUtc.AddDays(3);

    private static CompetitionSettlementService ServiceFor(AppDbContext db) => new(db, Calculator);

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

    private static Task<Activity> ChoreAsync(AppDbContext db, int householdId, string title = "Vacuum") =>
        db.Activities.SingleAsync(a => a.HouseholdId == householdId && a.Title == title);

    /// <summary>Writes a log directly, so a test can place it at any instant and status.</summary>
    private static async Task<ActivityLog> AddLogAsync(
        AppDbContext db,
        int activityId,
        int userId,
        int points,
        DateTime completedAtUtc,
        ActivityLogStatus status = ActivityLogStatus.Approved,
        int? approvedByUserId = null)
    {
        var log = new ActivityLog
        {
            ActivityId = activityId,
            LoggedByUserId = userId,
            PointsAwarded = points,
            Status = status,
            CompletedAt = completedAtUtc,
            ApprovedByUserId = status == ActivityLogStatus.Approved ? approvedByUserId : null,
            ApprovedAt = status == ActivityLogStatus.Approved ? completedAtUtc : null
        };

        db.ActivityLogs.Add(log);
        await db.SaveChangesAsync();
        return log;
    }

    private static async Task AddRedemptionAsync(
        AppDbContext db,
        int householdId,
        int userId,
        DateTime redeemedAtUtc,
        bool pausesCompetition)
    {
        var reward = await db.Rewards.FirstAsync(r =>
            r.HouseholdId == householdId && r.PausesCompetition == pausesCompetition);

        db.Redemptions.Add(new Redemption
        {
            UserId = userId,
            RewardId = reward.Id,
            RedeemedAt = redeemedAtUtc
        });

        await db.SaveChangesAsync();
    }

    // ---------- outcomes ----------

    [Fact]
    public async Task A_clear_win_records_the_winner_and_both_scores()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var chore = await ChoreAsync(db, household.Id);

        await AddLogAsync(db, chore.Id, sam.Id, 30, TheDay.StartUtc.AddHours(2), approvedByUserId: alex.Id);
        await AddLogAsync(db, chore.Id, alex.Id, 10, TheDay.StartUtc.AddHours(3), approvedByUserId: sam.Id);

        var result = await ServiceFor(db).SettlePeriodAsync(household.Id, TheDay, WellAfterTheDay);

        Assert.Equal(SettlementOutcome.Settled, result.Outcome);
        Assert.Equal(sam.Id, result.Competition!.WinnerUserId);
        Assert.Equal(30, result.Competition.WinnerPoints);
        Assert.Equal(10, result.Competition.LoserPoints);
        Assert.False(result.Competition.IsWinWin);
        Assert.False(result.Competition.IsVoided);
    }

    [Fact]
    public async Task Equal_scores_with_both_partners_active_is_a_win_win()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var chore = await ChoreAsync(db, household.Id);

        await AddLogAsync(db, chore.Id, sam.Id, 15, TheDay.StartUtc.AddHours(2), approvedByUserId: alex.Id);
        await AddLogAsync(db, chore.Id, alex.Id, 15, TheDay.StartUtc.AddHours(3), approvedByUserId: sam.Id);

        var result = await ServiceFor(db).SettlePeriodAsync(household.Id, TheDay, WellAfterTheDay);

        Assert.True(result.Competition!.IsWinWin);
        Assert.Null(result.Competition.WinnerUserId);
        Assert.Equal(15, result.Competition.WinnerPoints);
        Assert.Equal(15, result.Competition.LoserPoints);
    }

    [Fact]
    public async Task A_day_where_neither_partner_did_anything_is_not_a_win_win()
    {
        // The loophole project-plan.md names: without the "both must have >= 1 approved log" rule,
        // an idle day would settle as a mutual win and hand out two loot boxes for nothing.
        using var db = TestDbContextFactory.Create();
        var (_, _, household) = await PairedHouseholdAsync(db);

        var result = await ServiceFor(db).SettlePeriodAsync(household.Id, TheDay, WellAfterTheDay);

        Assert.Equal(SettlementOutcome.Settled, result.Outcome);
        Assert.False(result.Competition!.IsWinWin);
        Assert.Null(result.Competition.WinnerUserId);
        Assert.Equal(0, result.Competition.WinnerPoints);
        Assert.Equal(0, result.Competition.LoserPoints);
    }

    [Fact]
    public async Task One_partner_active_and_the_other_not_is_a_win()
    {
        // The >= 1 rule gates the tie, not winning.
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var chore = await ChoreAsync(db, household.Id);

        await AddLogAsync(db, chore.Id, sam.Id, 5, TheDay.StartUtc.AddHours(2), approvedByUserId: alex.Id);

        var result = await ServiceFor(db).SettlePeriodAsync(household.Id, TheDay, WellAfterTheDay);

        Assert.Equal(sam.Id, result.Competition!.WinnerUserId);
        Assert.False(result.Competition.IsWinWin);
        Assert.Equal(5, result.Competition.WinnerPoints);
        Assert.Equal(0, result.Competition.LoserPoints);
    }

    [Fact]
    public async Task Only_approved_logs_count()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var chore = await ChoreAsync(db, household.Id);

        await AddLogAsync(db, chore.Id, sam.Id, 10, TheDay.StartUtc.AddHours(1), approvedByUserId: alex.Id);
        await AddLogAsync(db, chore.Id, sam.Id, 99, TheDay.StartUtc.AddHours(2), ActivityLogStatus.Pending);
        await AddLogAsync(db, chore.Id, sam.Id, 99, TheDay.StartUtc.AddHours(3), ActivityLogStatus.Rejected);

        // Settled past the grace window so the pending log does not defer it.
        var result = await ServiceFor(db).SettlePeriodAsync(
            household.Id, TheDay, TheDay.EndUtc + CompetitionSettlementService.PendingApprovalGrace);

        Assert.Equal(10, result.Competition!.WinnerPoints);
        Assert.Equal(sam.Id, result.Competition.WinnerUserId);
    }

    [Fact]
    public async Task Only_logs_inside_the_period_count()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var chore = await ChoreAsync(db, household.Id);

        await AddLogAsync(db, chore.Id, sam.Id, 7, TheDay.StartUtc.AddHours(5), approvedByUserId: alex.Id);
        await AddLogAsync(db, chore.Id, sam.Id, 99, TheDay.StartUtc.AddTicks(-1), approvedByUserId: alex.Id);
        await AddLogAsync(db, chore.Id, sam.Id, 99, TheDay.EndUtc, approvedByUserId: alex.Id);

        var result = await ServiceFor(db).SettlePeriodAsync(household.Id, TheDay, WellAfterTheDay);

        Assert.Equal(7, result.Competition!.WinnerPoints);
    }

    [Fact]
    public async Task Scores_use_the_snapshot_not_the_chores_current_points()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var chore = await ChoreAsync(db, household.Id);

        await AddLogAsync(db, chore.Id, sam.Id, 15, TheDay.StartUtc.AddHours(2), approvedByUserId: alex.Id);

        chore.Points = 999;
        await db.SaveChangesAsync();

        var result = await ServiceFor(db).SettlePeriodAsync(household.Id, TheDay, WellAfterTheDay);

        Assert.Equal(15, result.Competition!.WinnerPoints);
    }

    // ---------- the day-off void ----------

    [Fact]
    public async Task A_pausing_redemption_voids_the_daily_competition()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var chore = await ChoreAsync(db, household.Id);

        // Sam would otherwise have won outright.
        await AddLogAsync(db, chore.Id, sam.Id, 40, TheDay.StartUtc.AddHours(2), approvedByUserId: alex.Id);
        await AddRedemptionAsync(db, household.Id, alex.Id, TheDay.StartUtc.AddHours(6), pausesCompetition: true);

        var result = await ServiceFor(db).SettlePeriodAsync(household.Id, TheDay, WellAfterTheDay);

        Assert.True(result.Competition!.IsVoided);
        Assert.Null(result.Competition.WinnerUserId);
        Assert.False(result.Competition.IsWinWin);

        // Scores are still recorded, so history is honest about what happened.
        Assert.Equal(40, result.Competition.WinnerPoints);
    }

    [Fact]
    public async Task The_same_redemption_does_not_void_the_week_or_the_month()
    {
        // project-plan.md: weekly and monthly are independent Points sums, not tallies of daily
        // results, so a paused day simply contributes fewer points to them.
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var chore = await ChoreAsync(db, household.Id);

        await AddLogAsync(db, chore.Id, sam.Id, 40, TheDay.StartUtc.AddHours(2), approvedByUserId: alex.Id);
        await AddRedemptionAsync(db, household.Id, alex.Id, TheDay.StartUtc.AddHours(6), pausesCompetition: true);

        var week = Calculator.PeriodContaining(CompetitionPeriodType.Weekly, TheDay.StartUtc);
        var month = Calculator.PeriodContaining(CompetitionPeriodType.Monthly, TheDay.StartUtc);
        var afterBoth = month.EndUtc.AddDays(1);

        var service = ServiceFor(db);
        var weekly = await service.SettlePeriodAsync(household.Id, week, afterBoth);
        var monthly = await service.SettlePeriodAsync(household.Id, month, afterBoth);

        Assert.False(weekly.Competition!.IsVoided);
        Assert.Equal(sam.Id, weekly.Competition.WinnerUserId);
        Assert.False(monthly.Competition!.IsVoided);
        Assert.Equal(sam.Id, monthly.Competition.WinnerUserId);
    }

    [Fact]
    public async Task An_ordinary_redemption_voids_nothing()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var chore = await ChoreAsync(db, household.Id);

        await AddLogAsync(db, chore.Id, sam.Id, 40, TheDay.StartUtc.AddHours(2), approvedByUserId: alex.Id);
        await AddRedemptionAsync(db, household.Id, alex.Id, TheDay.StartUtc.AddHours(6), pausesCompetition: false);

        var result = await ServiceFor(db).SettlePeriodAsync(household.Id, TheDay, WellAfterTheDay);

        Assert.False(result.Competition!.IsVoided);
        Assert.Equal(sam.Id, result.Competition.WinnerUserId);
    }

    [Fact]
    public async Task A_pausing_redemption_outside_the_period_does_not_void_it()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var chore = await ChoreAsync(db, household.Id);

        await AddLogAsync(db, chore.Id, sam.Id, 40, TheDay.StartUtc.AddHours(2), approvedByUserId: alex.Id);
        await AddRedemptionAsync(db, household.Id, alex.Id, TheDay.EndUtc.AddHours(1), pausesCompetition: true);

        var result = await ServiceFor(db).SettlePeriodAsync(household.Id, TheDay, WellAfterTheDay);

        Assert.False(result.Competition!.IsVoided);
    }

    // ---------- guards ----------

    [Fact]
    public async Task A_household_with_one_member_is_not_settled()
    {
        using var db = TestDbContextFactory.Create();
        var alex = await AddUserAsync(db, "alex@example.com");
        var created = await new HouseholdService(db, new DefaultCatalogCopier(db), new InviteCodeGenerator())
            .CreateAsync(alex.Id, "Our place");

        var result = await ServiceFor(db).SettlePeriodAsync(created.Household!.Id, TheDay, WellAfterTheDay);

        Assert.Equal(SettlementOutcome.NotAContest, result.Outcome);
        Assert.Empty(await db.Competitions.ToListAsync());
    }

    [Fact]
    public async Task A_period_still_in_progress_is_not_settled()
    {
        using var db = TestDbContextFactory.Create();
        var (_, _, household) = await PairedHouseholdAsync(db);

        var result = await ServiceFor(db).SettlePeriodAsync(
            household.Id, TheDay, TheDay.StartUtc.AddHours(12));

        Assert.Equal(SettlementOutcome.NotClosed, result.Outcome);
        Assert.Empty(await db.Competitions.ToListAsync());
    }

    [Fact]
    public async Task Settlement_is_idempotent()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var chore = await ChoreAsync(db, household.Id);
        await AddLogAsync(db, chore.Id, sam.Id, 20, TheDay.StartUtc.AddHours(2), approvedByUserId: alex.Id);

        var service = ServiceFor(db);
        var first = await service.SettlePeriodAsync(household.Id, TheDay, WellAfterTheDay);
        var second = await service.SettlePeriodAsync(household.Id, TheDay, WellAfterTheDay);

        Assert.Equal(SettlementOutcome.Settled, first.Outcome);
        Assert.Equal(SettlementOutcome.AlreadySettled, second.Outcome);
        Assert.Equal(first.Competition!.Id, second.Competition!.Id);
        Assert.Single(await db.Competitions.ToListAsync());
    }

    // ---------- the pending-approval grace ----------

    [Fact]
    public async Task A_period_with_pending_logs_is_not_settled_inside_the_grace_window()
    {
        // The failure the grace exists for: a chore logged at 23:00 and approved at 09:00 would
        // otherwise count for nothing, because anyone opening the app in between settles the day.
        using var db = TestDbContextFactory.Create();
        var (_, sam, household) = await PairedHouseholdAsync(db);
        var chore = await ChoreAsync(db, household.Id);

        await AddLogAsync(db, chore.Id, sam.Id, 15, TheDay.EndUtc.AddHours(-1), ActivityLogStatus.Pending);

        var result = await ServiceFor(db).SettlePeriodAsync(
            household.Id, TheDay, TheDay.EndUtc.AddHours(9));

        Assert.Equal(SettlementOutcome.AwaitingApprovals, result.Outcome);
        Assert.Empty(await db.Competitions.ToListAsync());
    }

    [Fact]
    public async Task Approving_inside_the_grace_window_lets_the_period_settle_with_those_points()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var chore = await ChoreAsync(db, household.Id);

        var log = await AddLogAsync(db, chore.Id, sam.Id, 15, TheDay.EndUtc.AddHours(-1), ActivityLogStatus.Pending);
        var service = ServiceFor(db);

        Assert.Equal(
            SettlementOutcome.AwaitingApprovals,
            (await service.SettlePeriodAsync(household.Id, TheDay, TheDay.EndUtc.AddHours(9))).Outcome);

        await new ActivityLogService(db).ApproveAsync(alex.Id, log.Id);

        var result = await service.SettlePeriodAsync(household.Id, TheDay, TheDay.EndUtc.AddHours(10));

        Assert.Equal(SettlementOutcome.Settled, result.Outcome);
        Assert.Equal(sam.Id, result.Competition!.WinnerUserId);
        Assert.Equal(15, result.Competition.WinnerPoints);
    }

    [Fact]
    public async Task Once_the_grace_expires_the_period_settles_without_the_undecided_logs()
    {
        // A partner who never decides must not be able to freeze the competition.
        using var db = TestDbContextFactory.Create();
        var (_, sam, household) = await PairedHouseholdAsync(db);
        var chore = await ChoreAsync(db, household.Id);

        await AddLogAsync(db, chore.Id, sam.Id, 15, TheDay.EndUtc.AddHours(-1), ActivityLogStatus.Pending);

        var result = await ServiceFor(db).SettlePeriodAsync(
            household.Id, TheDay, TheDay.EndUtc + CompetitionSettlementService.PendingApprovalGrace);

        Assert.Equal(SettlementOutcome.Settled, result.Outcome);
        Assert.Equal(0, result.Competition!.WinnerPoints);
        Assert.Null(result.Competition.WinnerUserId);
    }

    [Fact]
    public async Task Pending_logs_outside_the_period_do_not_defer_it()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var chore = await ChoreAsync(db, household.Id);

        await AddLogAsync(db, chore.Id, sam.Id, 20, TheDay.StartUtc.AddHours(2), approvedByUserId: alex.Id);
        await AddLogAsync(db, chore.Id, sam.Id, 99, TheDay.EndUtc.AddHours(2), ActivityLogStatus.Pending);

        var result = await ServiceFor(db).SettlePeriodAsync(
            household.Id, TheDay, TheDay.EndUtc.AddHours(6));

        Assert.Equal(SettlementOutcome.Settled, result.Outcome);
        Assert.Equal(20, result.Competition!.WinnerPoints);
    }

    // ---------- backfill ----------

    [Fact]
    public async Task SettleDueAsync_settles_every_closed_period_and_leaves_the_current_one_alone()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var chore = await ChoreAsync(db, household.Id);

        await AddLogAsync(db, chore.Id, sam.Id, 10, TheDay.StartUtc.AddHours(2), approvedByUserId: alex.Id);

        var now = TheDay.EndUtc.AddDays(2);
        var settled = await ServiceFor(db).SettleDueAsync(household.Id, now);

        Assert.NotEmpty(settled);
        Assert.All(settled, c => Assert.True(c.PeriodEnd <= now));
        Assert.DoesNotContain(settled, c => c.PeriodStart <= now && now < c.PeriodEnd);

        // The day with the log is among them, with the right winner.
        var theDay = settled.Single(c =>
            c.PeriodType == CompetitionPeriodType.Daily && c.PeriodStart == TheDay.StartUtc);
        Assert.Equal(sam.Id, theDay.WinnerUserId);
    }

    [Fact]
    public async Task SettleDueAsync_is_idempotent_across_repeated_calls()
    {
        using var db = TestDbContextFactory.Create();
        var (_, _, household) = await PairedHouseholdAsync(db);
        var service = ServiceFor(db);
        var now = TheDay.EndUtc.AddDays(2);

        var first = await service.SettleDueAsync(household.Id, now);
        var second = await service.SettleDueAsync(household.Id, now);
        var total = await db.Competitions.CountAsync();

        Assert.NotEmpty(first);
        Assert.Empty(second);
        Assert.Equal(first.Count, total);
    }
}
