using API.Data;
using API.Entities;
using Microsoft.EntityFrameworkCore;

namespace API.Services.Progression;

public interface IProgressionService
{
    /// <summary>
    /// Recomputes both partners' win streaks from settled daily competitions, then evaluates their
    /// badges. Safe to call more than once for the same competition.
    /// </summary>
    Task ApplySettlementAsync(Competition competition, CancellationToken ct = default);

    /// <summary>
    /// Unlocks any badge whose criteria the user now meets. Returns what was newly unlocked.
    /// </summary>
    Task<IReadOnlyList<BadgeCode>> EvaluateBadgesAsync(int userId, CancellationToken ct = default);
}

/// <summary>
/// Win streaks and badge unlocks — the progression layer over settled competitions.
/// </summary>
public class ProgressionService(AppDbContext db) : IProgressionService
{
    /// <summary>
    /// How far back a streak recomputation walks. A streak longer than this is not a scenario a
    /// two-person chores app needs to represent exactly.
    /// </summary>
    public const int MaxStreakLookback = 400;

    public const int ThreeDayStreak = 3;
    public const int SevenDayStreak = 7;
    public const int CenturyPoints = 100;
    public const int BigSpenderRedemptions = 5;

    public async Task ApplySettlementAsync(Competition competition, CancellationToken ct = default)
    {
        // "Winning the daily competition on consecutive days builds a win streak" - the rule names
        // the daily period. This is an early-out rather than the enforcement: the recomputation
        // below only reads daily competitions, so removing this changes no result, only the number
        // of queries a weekly or monthly settlement makes.
        if (competition.PeriodType != CompetitionPeriodType.Daily)
        {
            return;
        }

        var members = await db.Users
            .Where(u => u.HouseholdId == competition.HouseholdId)
            .ToListAsync(ct);

        var dailyResults = await db.Competitions
            .Where(c => c.HouseholdId == competition.HouseholdId
                        && c.PeriodType == CompetitionPeriodType.Daily)
            .OrderByDescending(c => c.PeriodStart)
            .Take(MaxStreakLookback)
            .Select(c => new { c.WinnerUserId, c.IsWinWin, c.IsVoided })
            .ToListAsync(ct);

        foreach (var member in members)
        {
            var current = 0;

            foreach (var day in dailyResults)
            {
                // A tie, a voided day, and a day nobody won all leave the streak alone -
                // "only an outright win does" (project-plan.md). Skipping rather than breaking is
                // what lets a run survive a quiet Sunday.
                if (day.IsVoided || day.IsWinWin || day.WinnerUserId is null)
                {
                    continue;
                }

                if (day.WinnerUserId == member.Id)
                {
                    current++;
                }
                else
                {
                    // Someone else won this day, so the run ends here.
                    break;
                }
            }

            member.CurrentWinStreak = current;
            member.LongestWinStreak = Math.Max(member.LongestWinStreak, current);
        }

        await db.SaveChangesAsync(ct);

        foreach (var member in members)
        {
            await EvaluateBadgesAsync(member.Id, ct);
        }
    }

    public async Task<IReadOnlyList<BadgeCode>> EvaluateBadgesAsync(int userId, CancellationToken ct = default)
    {
        var user = await db.Users.SingleOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null)
        {
            return [];
        }

        var alreadyUnlocked = await db.UserBadges
            .Where(ub => ub.UserId == userId)
            .Select(ub => ub.BadgeId)
            .ToListAsync(ct);

        // Nothing left to earn: skip the counting queries entirely.
        if (alreadyUnlocked.Count == Enum.GetValues<BadgeCode>().Length)
        {
            return [];
        }

        var approvedLogs = await db.ActivityLogs
            .CountAsync(l => l.LoggedByUserId == userId && l.Status == ActivityLogStatus.Approved, ct);

        var redemptions = await db.Redemptions.CountAsync(r => r.UserId == userId, ct);

        var earned = new List<BadgeCode>();

        void Check(BadgeCode code, bool met)
        {
            if (met && !alreadyUnlocked.Contains((int)code))
            {
                earned.Add(code);
            }
        }

        Check(BadgeCode.FirstChore, approvedLogs >= 1);
        Check(BadgeCode.ThreeDayWinStreak, user.CurrentWinStreak >= ThreeDayStreak);
        Check(BadgeCode.FirstRedemption, redemptions >= 1);
        Check(BadgeCode.SevenDayWinStreak, user.CurrentWinStreak >= SevenDayStreak);
        Check(BadgeCode.Century, user.LifetimePoints >= CenturyPoints);
        Check(BadgeCode.BigSpender, redemptions >= BigSpenderRedemptions);

        if (earned.Count == 0)
        {
            return [];
        }

        var unlockedAt = DateTime.UtcNow;

        db.UserBadges.AddRange(earned.Select(code => new UserBadge
        {
            UserId = userId,
            BadgeId = (int)code,
            UnlockedAt = unlockedAt
        }));

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            // The unique index on (user_id, badge_id) fired: another request unlocked the same
            // badge concurrently. Already-unlocked is the desired end state, so this is not an
            // error - just report nothing newly earned.
            foreach (var entry in db.ChangeTracker.Entries<UserBadge>()
                         .Where(e => e.State == EntityState.Added)
                         .ToList())
            {
                entry.State = EntityState.Detached;
            }

            return [];
        }

        return earned;
    }
}
