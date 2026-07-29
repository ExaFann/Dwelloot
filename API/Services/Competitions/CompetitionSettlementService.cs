using API.Data;
using API.Entities;
using API.Services.Progression;
using Microsoft.EntityFrameworkCore;

namespace API.Services.Competitions;

public enum SettlementOutcome
{
    /// <summary>A competition row was written.</summary>
    Settled,

    /// <summary>Already settled; the existing row is returned unchanged.</summary>
    AlreadySettled,

    /// <summary>The period has not ended yet.</summary>
    NotClosed,

    /// <summary>Closed, but pending logs remain and the grace window has not expired.</summary>
    AwaitingApprovals,

    /// <summary>Fewer than two members — there is no duel to settle.</summary>
    NotAContest,

    HouseholdNotFound
}

public sealed record SettlementResult(SettlementOutcome Outcome, Competition? Competition)
{
    public static SettlementResult Of(SettlementOutcome outcome, Competition? competition = null) =>
        new(outcome, competition);
}

/// <summary>Where a period stands right now: each member's points, and whether it is voided.</summary>
public sealed record CompetitionStanding(IReadOnlyDictionary<int, int> PointsByUserId, bool Voided);

public interface ICompetitionSettlementService
{
    Task<SettlementResult> SettlePeriodAsync(
        int householdId,
        CompetitionPeriod period,
        DateTime asOfUtc,
        CancellationToken ct = default);

    Task<IReadOnlyList<Competition>> SettleDueAsync(
        int householdId,
        DateTime asOfUtc,
        CancellationToken ct = default);

    /// <summary>
    /// Scores a period without settling it — what the dashboard shows for the day in progress.
    /// </summary>
    /// <remarks>
    /// Deliberately the same code path settlement uses. If the live standing and the settled result
    /// were computed separately they could disagree — a different timestamp, status filter or
    /// points column — and the dashboard would show one number all day while the recorded outcome
    /// showed another.
    /// </remarks>
    Task<CompetitionStanding> GetStandingAsync(
        int householdId,
        CompetitionPeriod period,
        CancellationToken ct = default);
}

/// <summary>
/// Decides who won a closed competition period, and writes it down once.
/// </summary>
/// <remarks>
/// Settlement is lazy: nothing runs on a schedule, and the first request after a period boundary
/// computes and persists the result. A row exists if and only if its period has been settled, which
/// is why <see cref="Competition.SettledAt"/> is not nullable.
/// <para>
/// <b>This service does not roll the loot box.</b> Log <c>009</c> assumed it would, so that
/// <c>open-box</c> could be idempotent by revealing a stored value — but that predates
/// <c>competition_claims</c>, which provides idempotency directly. Task [25] owns the weighted roll;
/// settled rows leave <see cref="Competition.CoinsAwarded"/> at 0 and
/// <see cref="Competition.BonusRewardId"/> null until then.
/// </para>
/// </remarks>
public class CompetitionSettlementService(
    AppDbContext db,
    IPeriodCalculator periods,
    IProgressionService progression) : ICompetitionSettlementService
{
    /// <summary>
    /// How long a closed period waits for outstanding approvals before settling without them.
    /// </summary>
    /// <remarks>
    /// Without this, the normal rhythm of the app produces wrong winners: a chore logged at 23:00
    /// and approved at 09:00 the next morning would count for nothing, because anyone opening the
    /// app in between would settle the day first. Capped rather than open-ended so a partner who
    /// never decides cannot freeze the competition.
    /// </remarks>
    public static readonly TimeSpan PendingApprovalGrace = TimeSpan.FromHours(48);

    /// <summary>
    /// How far back <see cref="SettleDueAsync"/> looks. A household inactive for months should not
    /// make the next request settle an unbounded backlog.
    /// </summary>
    public const int MaxBackfillPeriods = 30;

    public async Task<SettlementResult> SettlePeriodAsync(
        int householdId,
        CompetitionPeriod period,
        DateTime asOfUtc,
        CancellationToken ct = default)
    {
        if (!period.HasClosedBy(asOfUtc))
        {
            return SettlementResult.Of(SettlementOutcome.NotClosed);
        }

        var existing = await db.Competitions.SingleOrDefaultAsync(
            c => c.HouseholdId == householdId
                 && c.PeriodType == period.Type
                 && c.PeriodStart == period.StartUtc,
            ct);

        if (existing is not null)
        {
            return SettlementResult.Of(SettlementOutcome.AlreadySettled, existing);
        }

        var members = await db.Users
            .Where(u => u.HouseholdId == householdId)
            .Select(u => u.Id)
            .ToListAsync(ct);

        if (members.Count == 0)
        {
            return SettlementResult.Of(SettlementOutcome.HouseholdNotFound);
        }

        // A competition needs two people. A household mid-way through a partner change has no
        // meaningful duel, and inventing a winner would be worse than leaving it unsettled.
        if (members.Count < Household.MaxMembers)
        {
            return SettlementResult.Of(SettlementOutcome.NotAContest);
        }

        if (await HasPendingWithinGraceAsync(householdId, period, asOfUtc, ct))
        {
            return SettlementResult.Of(SettlementOutcome.AwaitingApprovals);
        }

        var scores = await ScoresAsync(householdId, members, period, ct);
        var voided = period.Type == CompetitionPeriodType.Daily
                     && await HasPausingRedemptionAsync(householdId, period, ct);

        var competition = BuildCompetition(householdId, period, scores, voided, asOfUtc);

        db.Competitions.Add(competition);

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            // The unique index on (household_id, period_type, period_start) fired: the other
            // partner's request settled this period first. Both opening the dashboard in the
            // morning is exactly the race that index exists for (log 009). Re-read theirs.
            db.Entry(competition).State = EntityState.Detached;

            var winner = await db.Competitions.SingleOrDefaultAsync(
                c => c.HouseholdId == householdId
                     && c.PeriodType == period.Type
                     && c.PeriodStart == period.StartUtc,
                ct);

            return winner is null
                ? throw new InvalidOperationException("Settlement failed and no competing row was found.")
                : SettlementResult.Of(SettlementOutcome.AlreadySettled, winner);
        }

        // Streaks and badges, after the competition row exists. Recomputed rather than incremented
        // (see ProgressionService), so calling this more than once for the same period cannot
        // corrupt a streak.
        await progression.ApplySettlementAsync(competition, ct);

        return SettlementResult.Of(SettlementOutcome.Settled, competition);
    }

    public async Task<IReadOnlyList<Competition>> SettleDueAsync(
        int householdId,
        DateTime asOfUtc,
        CancellationToken ct = default)
    {
        var settled = new List<Competition>();

        foreach (var type in Enum.GetValues<CompetitionPeriodType>())
        {
            foreach (var period in periods.ClosedPeriods(type, asOfUtc, MaxBackfillPeriods))
            {
                var result = await SettlePeriodAsync(householdId, period, asOfUtc, ct);

                if (result.Outcome == SettlementOutcome.Settled && result.Competition is not null)
                {
                    settled.Add(result.Competition);
                }
            }
        }

        return settled;
    }

    public async Task<CompetitionStanding> GetStandingAsync(
        int householdId,
        CompetitionPeriod period,
        CancellationToken ct = default)
    {
        var members = await db.Users
            .Where(u => u.HouseholdId == householdId)
            .Select(u => u.Id)
            .ToListAsync(ct);

        var scores = await ScoresAsync(householdId, members, period, ct);

        var voided = period.Type == CompetitionPeriodType.Daily
                     && await HasPausingRedemptionAsync(householdId, period, ct);

        return new CompetitionStanding(scores, voided);
    }

    /// <summary>
    /// True when the period still contains undecided logs and the grace window is open.
    /// </summary>
    private async Task<bool> HasPendingWithinGraceAsync(
        int householdId,
        CompetitionPeriod period,
        DateTime asOfUtc,
        CancellationToken ct)
    {
        if (asOfUtc >= period.EndUtc + PendingApprovalGrace)
        {
            return false;
        }

        return await db.ActivityLogs.AnyAsync(
            l => l.Activity.HouseholdId == householdId
                 && l.Status == ActivityLogStatus.Pending
                 && l.CompletedAt >= period.StartUtc
                 && l.CompletedAt < period.EndUtc,
            ct);
    }

    /// <summary>
    /// Each member's approved points in the period, keyed by user id.
    /// </summary>
    /// <remarks>
    /// Membership is by <see cref="ActivityLog.CompletedAt"/> — a log belongs to the period it was
    /// <em>done</em> in, not the one it happened to be approved in. Points come from
    /// <see cref="ActivityLog.PointsAwarded"/>, the task [19] snapshot, so editing a chore cannot
    /// rewrite a past competition.
    /// </remarks>
    private async Task<Dictionary<int, int>> ScoresAsync(
        int householdId,
        IReadOnlyList<int> members,
        CompetitionPeriod period,
        CancellationToken ct)
    {
        var totals = await db.ActivityLogs
            .Where(l => l.Activity.HouseholdId == householdId
                        && l.Status == ActivityLogStatus.Approved
                        && l.CompletedAt >= period.StartUtc
                        && l.CompletedAt < period.EndUtc)
            .GroupBy(l => l.LoggedByUserId)
            .Select(g => new { UserId = g.Key, Points = g.Sum(l => l.PointsAwarded) })
            .ToDictionaryAsync(x => x.UserId, x => x.Points, ct);

        foreach (var member in members)
        {
            totals.TryAdd(member, 0);
        }

        return totals;
    }

    /// <summary>
    /// Whether a "day off" style reward was redeemed inside the period.
    /// </summary>
    /// <remarks>
    /// Scoped through the reward rather than the redeemer, per log <c>007</c>: a user's
    /// <c>household_id</c> is nullable and cleared on leaving, so joining that way would lose a
    /// departed partner's redemptions. Rewards are permanently household-owned.
    /// </remarks>
    private Task<bool> HasPausingRedemptionAsync(
        int householdId,
        CompetitionPeriod period,
        CancellationToken ct) =>
        db.Redemptions.AnyAsync(
            r => r.Reward.HouseholdId == householdId
                 && r.Reward.PausesCompetition
                 && r.RedeemedAt >= period.StartUtc
                 && r.RedeemedAt < period.EndUtc,
            ct);

    private static Competition BuildCompetition(
        int householdId,
        CompetitionPeriod period,
        Dictionary<int, int> scores,
        bool voided,
        DateTime asOfUtc)
    {
        var ordered = scores.OrderByDescending(s => s.Value).ThenBy(s => s.Key).ToList();
        var top = ordered[0];
        var other = ordered[1];

        var competition = new Competition
        {
            HouseholdId = householdId,
            PeriodType = period.Type,
            PeriodStart = period.StartUtc,
            PeriodEnd = period.EndUtc,
            WinnerPoints = top.Value,
            LoserPoints = other.Value,
            SettledAt = asOfUtc
        };

        if (voided)
        {
            // No winner, no win-win, no loot box for either side - the day simply did not run a
            // competition. Scores are still recorded so the history is honest about what happened.
            competition.IsVoided = true;
            return competition;
        }

        if (top.Value != other.Value)
        {
            competition.WinnerUserId = top.Key;
            return competition;
        }

        // Equal scores. A win-win additionally requires both partners to have actually done
        // something: without that, a day where neither did anything would settle as a mutual win
        // and hand out two loot boxes for nothing (project-plan.md).
        competition.IsWinWin = top.Value > 0 && other.Value > 0;

        return competition;
    }
}
