using API.Data;
using API.Entities;
using API.Services;
using API.Services.Competitions;
using API.Services.Progression;
using Microsoft.EntityFrameworkCore;

namespace Dwelloot.Tests.Services.Progression;

public class StreakTests
{
    private static readonly TimeZoneInfo Auckland = TimeZoneInfo.FindSystemTimeZoneById("Pacific/Auckland");
    private static readonly PeriodCalculator Calculator = new(Auckland);

    /// <summary>Local midnight on 1 July 2026, so "day n" is n days later.</summary>
    private static readonly DateTime Day0 = TimeZoneInfo.ConvertTimeToUtc(
        new DateTime(2026, 7, 1, 0, 0, 0, DateTimeKind.Unspecified), Auckland);

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

    /// <summary>Writes a settled daily competition for "day n" and applies progression.</summary>
    private static async Task<Competition> SettleDayAsync(
        AppDbContext db,
        int householdId,
        int dayOffset,
        int? winnerUserId,
        bool isWinWin = false,
        bool isVoided = false,
        CompetitionPeriodType periodType = CompetitionPeriodType.Daily)
    {
        var start = Day0.AddDays(dayOffset);

        var competition = new Competition
        {
            HouseholdId = householdId,
            PeriodType = periodType,
            PeriodStart = start,
            PeriodEnd = start.AddDays(1),
            WinnerUserId = winnerUserId,
            WinnerPoints = winnerUserId is null ? 0 : 20,
            LoserPoints = 10,
            IsWinWin = isWinWin,
            IsVoided = isVoided,
            SettledAt = start.AddDays(1)
        };

        db.Competitions.Add(competition);
        await db.SaveChangesAsync();

        await new ProgressionService(db).ApplySettlementAsync(competition);
        return competition;
    }

    private static Task<User> ReloadAsync(AppDbContext db, int userId) =>
        db.Users.SingleAsync(u => u.Id == userId);

    [Fact]
    public async Task An_outright_win_increments_the_winner_and_zeroes_the_other()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);

        await SettleDayAsync(db, household.Id, 0, sam.Id);

        Assert.Equal(1, (await ReloadAsync(db, sam.Id)).CurrentWinStreak);
        Assert.Equal(0, (await ReloadAsync(db, alex.Id)).CurrentWinStreak);
    }

    [Fact]
    public async Task Consecutive_wins_accumulate()
    {
        using var db = TestDbContextFactory.Create();
        var (_, sam, household) = await PairedHouseholdAsync(db);

        for (var day = 0; day < 4; day++)
        {
            await SettleDayAsync(db, household.Id, day, sam.Id);
        }

        Assert.Equal(4, (await ReloadAsync(db, sam.Id)).CurrentWinStreak);
    }

    [Fact]
    public async Task A_loss_resets_the_streak()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);

        await SettleDayAsync(db, household.Id, 0, sam.Id);
        await SettleDayAsync(db, household.Id, 1, sam.Id);
        await SettleDayAsync(db, household.Id, 2, alex.Id);

        Assert.Equal(0, (await ReloadAsync(db, sam.Id)).CurrentWinStreak);
        Assert.Equal(1, (await ReloadAsync(db, alex.Id)).CurrentWinStreak);
    }

    [Fact]
    public async Task A_win_win_leaves_both_streaks_untouched()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);

        await SettleDayAsync(db, household.Id, 0, sam.Id);
        await SettleDayAsync(db, household.Id, 1, winnerUserId: null, isWinWin: true);

        Assert.Equal(1, (await ReloadAsync(db, sam.Id)).CurrentWinStreak);
        Assert.Equal(0, (await ReloadAsync(db, alex.Id)).CurrentWinStreak);
    }

    [Fact]
    public async Task A_tie_in_the_middle_of_a_run_neither_extends_nor_breaks_it()
    {
        // The rule's sharpest edge: project-plan.md says a tie does neither, so a run must survive
        // one without growing.
        using var db = TestDbContextFactory.Create();
        var (_, sam, household) = await PairedHouseholdAsync(db);

        await SettleDayAsync(db, household.Id, 0, sam.Id);
        await SettleDayAsync(db, household.Id, 1, winnerUserId: null, isWinWin: true);
        await SettleDayAsync(db, household.Id, 2, sam.Id);

        // Two wins with a tie between them: the run continues, the tie adds nothing.
        Assert.Equal(2, (await ReloadAsync(db, sam.Id)).CurrentWinStreak);
    }

    [Fact]
    public async Task A_voided_day_leaves_both_streaks_untouched_and_does_not_break_a_run()
    {
        // project-plan.md describes a voided day as "the same as if that day simply didn't run a
        // competition", so it can neither extend nor break.
        using var db = TestDbContextFactory.Create();
        var (_, sam, household) = await PairedHouseholdAsync(db);

        await SettleDayAsync(db, household.Id, 0, sam.Id);
        await SettleDayAsync(db, household.Id, 1, winnerUserId: null, isVoided: true);
        await SettleDayAsync(db, household.Id, 2, sam.Id);

        Assert.Equal(2, (await ReloadAsync(db, sam.Id)).CurrentWinStreak);
    }

    [Fact]
    public async Task A_voided_day_is_skipped_even_if_it_somehow_records_a_winner()
    {
        // Settlement never produces this - BuildCompetition returns early when voided, leaving no
        // winner - so the null-winner check alone already skips voided days and the IsVoided clause
        // is redundant against today's code. Mutation testing showed removing it broke nothing.
        //
        // Kept and tested here because voided-with-a-winner is exactly what a future "record who
        // would have won" change would introduce, and a voided day quietly extending someone's
        // streak is a real bug. Same reasoning as the equivalent guard in log 024.
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);

        await SettleDayAsync(db, household.Id, 0, sam.Id);

        // Alex "wins" a voided day. It must not start a run for him, nor end Sam's.
        await SettleDayAsync(db, household.Id, 1, alex.Id, isVoided: true);

        Assert.Equal(0, (await ReloadAsync(db, alex.Id)).CurrentWinStreak);
        Assert.Equal(1, (await ReloadAsync(db, sam.Id)).CurrentWinStreak);
    }

    [Fact]
    public async Task A_day_nobody_won_leaves_both_streaks_untouched()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);

        await SettleDayAsync(db, household.Id, 0, sam.Id);
        await SettleDayAsync(db, household.Id, 1, winnerUserId: null);

        Assert.Equal(1, (await ReloadAsync(db, sam.Id)).CurrentWinStreak);
        Assert.Equal(0, (await ReloadAsync(db, alex.Id)).CurrentWinStreak);
    }

    [Fact]
    public async Task LongestWinStreak_records_the_high_water_mark_and_never_falls_back()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);

        for (var day = 0; day < 3; day++)
        {
            await SettleDayAsync(db, household.Id, day, sam.Id);
        }

        Assert.Equal(3, (await ReloadAsync(db, sam.Id)).LongestWinStreak);

        await SettleDayAsync(db, household.Id, 3, alex.Id);

        var samAfter = await ReloadAsync(db, sam.Id);
        Assert.Equal(0, samAfter.CurrentWinStreak);
        Assert.Equal(3, samAfter.LongestWinStreak);
    }

    [Fact]
    public async Task Weekly_and_monthly_settlements_do_not_affect_streaks()
    {
        // "Winning the daily competition on consecutive days" - the rule names the daily period.
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);

        await SettleDayAsync(db, household.Id, 0, sam.Id);
        await SettleDayAsync(db, household.Id, 10, alex.Id, periodType: CompetitionPeriodType.Weekly);
        await SettleDayAsync(db, household.Id, 20, alex.Id, periodType: CompetitionPeriodType.Monthly);

        Assert.Equal(1, (await ReloadAsync(db, sam.Id)).CurrentWinStreak);
        Assert.Equal(0, (await ReloadAsync(db, alex.Id)).CurrentWinStreak);
    }

    [Fact]
    public async Task Applying_progression_twice_gives_the_same_streak()
    {
        // The reason streaks are recomputed rather than incremented: a second application must not
        // double a run. An increment-based implementation would report 2 here.
        using var db = TestDbContextFactory.Create();
        var (_, sam, household) = await PairedHouseholdAsync(db);

        var competition = await SettleDayAsync(db, household.Id, 0, sam.Id);
        Assert.Equal(1, (await ReloadAsync(db, sam.Id)).CurrentWinStreak);

        await new ProgressionService(db).ApplySettlementAsync(competition);

        Assert.Equal(1, (await ReloadAsync(db, sam.Id)).CurrentWinStreak);
    }

    [Fact]
    public async Task Settlement_unlocks_a_streak_badge_for_the_partner_who_earned_it()
    {
        // Covers the settlement-to-badge wiring for BOTH members, not just the first. Evaluating
        // badges for members[0] regardless of who won passed every other test here, because none
        // of them looked at badges after a settlement.
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);

        for (var day = 0; day < ProgressionService.ThreeDayStreak; day++)
        {
            await SettleDayAsync(db, household.Id, day, sam.Id);
        }

        var samBadges = await db.UserBadges.Where(ub => ub.UserId == sam.Id).Select(ub => ub.BadgeId).ToListAsync();
        var alexBadges = await db.UserBadges.Where(ub => ub.UserId == alex.Id).Select(ub => ub.BadgeId).ToListAsync();

        Assert.Contains((int)BadgeCode.ThreeDayWinStreak, samBadges);
        Assert.DoesNotContain((int)BadgeCode.ThreeDayWinStreak, alexBadges);
    }

    [Fact]
    public async Task A_weekly_competition_is_not_counted_in_the_streak()
    {
        // The real rule, asserted against the recomputation rather than the early-out guard: a
        // weekly win sitting between two daily ones must neither extend nor break the daily run.
        // The guard in ApplySettlementAsync is only an optimisation - the recomputation already
        // filters to daily competitions - which is why removing it changes nothing.
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);

        await SettleDayAsync(db, household.Id, 0, sam.Id);
        await SettleDayAsync(db, household.Id, 1, alex.Id, periodType: CompetitionPeriodType.Weekly);
        await SettleDayAsync(db, household.Id, 2, sam.Id);

        Assert.Equal(2, (await ReloadAsync(db, sam.Id)).CurrentWinStreak);
        Assert.Equal(0, (await ReloadAsync(db, alex.Id)).CurrentWinStreak);
    }

    [Fact]
    public async Task Settlement_drives_streaks_end_to_end()
    {
        // Through the real settlement path rather than hand-written competitions, so the wiring
        // between the two services is covered as well as the rule.
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedHouseholdAsync(db);
        var chore = await db.Activities.FirstAsync(a => a.HouseholdId == household.Id);

        var period = Calculator.PeriodContaining(CompetitionPeriodType.Daily, Day0.AddHours(12));

        db.ActivityLogs.Add(new ActivityLog
        {
            ActivityId = chore.Id,
            LoggedByUserId = sam.Id,
            PointsAwarded = 20,
            Status = ActivityLogStatus.Approved,
            CompletedAt = period.StartUtc.AddHours(2),
            ApprovedAt = period.StartUtc.AddHours(3)
        });
        await db.SaveChangesAsync();

        await new CompetitionSettlementService(db, Calculator, new ProgressionService(db))
            .SettlePeriodAsync(household.Id, period, period.EndUtc.AddDays(3));

        Assert.Equal(1, (await ReloadAsync(db, sam.Id)).CurrentWinStreak);
        Assert.Equal(0, (await ReloadAsync(db, alex.Id)).CurrentWinStreak);
    }
}
