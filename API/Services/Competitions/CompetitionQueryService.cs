using API.Data;
using API.Dtos.Competitions;
using API.Entities;
using Microsoft.EntityFrameworkCore;

namespace API.Services.Competitions;

public enum CompetitionQueryStatus
{
    Ok,
    UserNotFound,
    NotAMember
}

public sealed record CurrentCompetitionResult(
    CompetitionQueryStatus Status,
    CurrentCompetitionResponse? Standing)
{
    public static CurrentCompetitionResult Ok(CurrentCompetitionResponse standing) =>
        new(CompetitionQueryStatus.Ok, standing);

    public static CurrentCompetitionResult Failed(CompetitionQueryStatus status) => new(status, null);
}

public interface ICompetitionQueryService
{
    Task<CurrentCompetitionResult> GetCurrentAsync(
        int userId,
        int householdId,
        CompetitionPeriodType periodType,
        DateTime asOfUtc,
        CancellationToken ct = default);
}

/// <summary>
/// Reads the live head-to-head standing, settling anything that closed on the way.
/// </summary>
public class CompetitionQueryService(
    AppDbContext db,
    IPeriodCalculator periods,
    ICompetitionSettlementService settlement) : ICompetitionQueryService
{
    public async Task<CurrentCompetitionResult> GetCurrentAsync(
        int userId,
        int householdId,
        CompetitionPeriodType periodType,
        DateTime asOfUtc,
        CancellationToken ct = default)
    {
        var user = await db.Users.SingleOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null)
        {
            return CurrentCompetitionResult.Failed(CompetitionQueryStatus.UserNotFound);
        }

        // The household id comes from the route, so membership is checked rather than assumed.
        // A non-member gets the same answer as a nonexistent household (see the controller).
        if (user.HouseholdId != householdId)
        {
            return CurrentCompetitionResult.Failed(CompetitionQueryStatus.NotAMember);
        }

        // The whole of "lazy settlement": no scheduler, and the first request after a period
        // boundary pays for it.
        await settlement.SettleDueAsync(householdId, asOfUtc, ct);

        var period = periods.PeriodContaining(periodType, asOfUtc);
        var standing = await settlement.GetStandingAsync(householdId, period, ct);

        var myPoints = standing.PointsByUserId.GetValueOrDefault(userId);
        var partnerPoints = standing.PointsByUserId
            .Where(entry => entry.Key != userId)
            .Sum(entry => entry.Value);

        var lootBox = await UnopenedLootBoxAsync(userId, householdId, ct);

        return CurrentCompetitionResult.Ok(new CurrentCompetitionResponse(
            period.Type,
            period.StartUtc,
            period.EndUtc,
            myPoints,
            partnerPoints,
            // Always false: this describes the period in progress, which by definition has not
            // closed. Kept because api-design.md documents it.
            Settled: false,
            standing.Voided,
            lootBox));
    }

    /// <summary>
    /// The oldest settled competition the caller is owed a box for and has not opened.
    /// </summary>
    /// <remarks>
    /// Oldest first, so a partner returning after several days works through them in order rather
    /// than seeing the most recent and silently losing the rest.
    /// </remarks>
    private async Task<UnopenedLootBoxResponse?> UnopenedLootBoxAsync(
        int userId,
        int householdId,
        CancellationToken ct)
    {
        var competition = await db.Competitions
            .Where(c => c.HouseholdId == householdId
                        && !c.IsVoided
                        // Won outright, or a win-win where both partners get one.
                        && (c.WinnerUserId == userId || c.IsWinWin)
                        && !db.CompetitionClaims.Any(claim =>
                            claim.CompetitionId == c.Id && claim.UserId == userId))
            .OrderBy(c => c.PeriodStart)
            .ThenBy(c => c.Id)
            .FirstOrDefaultAsync(ct);

        return competition is null
            ? null
            : new UnopenedLootBoxResponse(
                competition.Id,
                competition.PeriodType,
                Won: true,
                competition.IsWinWin);
    }
}
