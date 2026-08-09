using API.Data;
using API.Dtos.Badges;
using Microsoft.EntityFrameworkCore;

namespace API.Services.Progression;

public enum BadgeQueryStatus
{
    Ok,

    /// <summary>
    /// The token names a user who no longer exists. Not reachable in v1 — user FKs are
    /// <c>Restrict</c> and nothing deletes a user — but the alternative to checking is a cheerful
    /// 200 listing six locked badges for a deleted account.
    /// </summary>
    UserNotFound
}

public sealed record BadgeListResult(BadgeQueryStatus Status, BadgeListResponse? Badges)
{
    public static BadgeListResult Ok(BadgeListResponse badges) => new(BadgeQueryStatus.Ok, badges);

    public static BadgeListResult Failed(BadgeQueryStatus status) => new(status, null);
}

public interface IBadgeQueryService
{
    /// <summary>
    /// The whole badge catalog with the caller's unlock state on each entry.
    /// </summary>
    Task<BadgeListResult> ListAsync(int userId, CancellationToken ct = default);
}

/// <summary>
/// The read side of progression, sibling to <see cref="IProgressionService"/>'s write side — the
/// same split as <see cref="Competitions.ICompetitionQueryService"/> against
/// <see cref="Competitions.ICompetitionSettlementService"/>.
/// </summary>
public class BadgeQueryService(AppDbContext db) : IBadgeQueryService
{
    public async Task<BadgeListResult> ListAsync(int userId, CancellationToken ct = default)
    {
        // No household check, unlike every other list endpoint in this project. Badges are the one
        // catalog with no household_id (log 008) and user_badges hangs off the user, so a caller
        // without a household gets the honest answer: all six, all locked. Copying the 409 from the
        // activity and reward lists would be copying a guard rather than applying one.
        var userExists = await db.Users.AnyAsync(u => u.Id == userId, ct);
        if (!userExists)
        {
            return BadgeListResult.Failed(BadgeQueryStatus.UserNotFound);
        }

        // Ordered by id, which is the seeded order and reads as rough progression order. Stability
        // is the real reason: a grid that reshuffles as badges unlock is a worse grid, which is why
        // unlocked-first was not chosen. PostgreSQL guarantees no order without an ORDER BY, and
        // log 016 established that the in-memory provider hides a missing one - so the test for
        // this inserts two badge rows out of id order to make the sort observable rather than
        // asserting the seeded 1..6, which passes with no ORDER BY at all.
        var badges = await db.Badges
            .OrderBy(b => b.Id)
            .Select(b => new { b.Id, b.Name, b.Criteria })
            .ToListAsync(ct);

        var unlockedAt = await db.UserBadges
            .Where(ub => ub.UserId == userId)
            .ToDictionaryAsync(ub => ub.BadgeId, ub => ub.UnlockedAt, ct);

        // Joined in memory rather than as a GroupJoin: six catalog rows against at most six unlock
        // rows. Deliberately no EvaluateBadgesAsync call - every write that can satisfy a criterion
        // already evaluates (settlement, approve, bulk-approve, and redemption in task [30]), so
        // unlike GET .../competitions/current this read has nothing it alone could notice.
        var items = badges
            .Select(b =>
            {
                var unlocked = unlockedAt.TryGetValue(b.Id, out var at);
                return new BadgeResponse(b.Id, b.Name, b.Criteria, unlocked, unlocked ? at : null);
            })
            .ToList();

        return BadgeListResult.Ok(new BadgeListResponse(items));
    }
}
