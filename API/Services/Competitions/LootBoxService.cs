using API.Data;
using API.Dtos.Competitions;
using API.Entities;
using Microsoft.EntityFrameworkCore;

namespace API.Services.Competitions;

public enum LootBoxStatus
{
    Ok,
    UserNotFound,
    NotAMember,

    /// <summary>No such competition, or it belongs to another household.</summary>
    CompetitionNotFound,

    /// <summary>The period was voided, so no box was awarded to anyone.</summary>
    Voided,

    /// <summary>The caller neither won nor drew — there is no box for them.</summary>
    NotYours
}

public sealed record OpenLootBoxResult(LootBoxStatus Status, OpenLootBoxResponse? Box)
{
    public static OpenLootBoxResult Ok(OpenLootBoxResponse box) => new(LootBoxStatus.Ok, box);

    public static OpenLootBoxResult Failed(LootBoxStatus status) => new(status, null);
}

public interface ILootBoxService
{
    Task<OpenLootBoxResult> OpenAsync(
        int userId,
        int householdId,
        int competitionId,
        CancellationToken ct = default);
}

/// <summary>
/// Reveals the loot box from a settled competition, rolling it on first open.
/// </summary>
/// <remarks>
/// Task [23] deliberately settles without rolling, so the roll lives here. Idempotency comes from
/// <see cref="CompetitionClaim"/>: a partner who has already opened has a row, and re-opening
/// replays the stored result instead of rolling again or crediting twice.
/// <para>
/// On a win-win both partners open the <em>same</em> prize — the first opener's roll is stored on
/// the competition and the second reuses it. Rolling independently per partner is a later option
/// and would mean moving the result columns onto <c>competition_claims</c>, which is why the claim
/// is a table rather than a flag.
/// </para>
/// </remarks>
public class LootBoxService(AppDbContext db, ILootBoxRoller roller) : ILootBoxService
{
    public async Task<OpenLootBoxResult> OpenAsync(
        int userId,
        int householdId,
        int competitionId,
        CancellationToken ct = default)
    {
        var user = await db.Users.SingleOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null)
        {
            return OpenLootBoxResult.Failed(LootBoxStatus.UserNotFound);
        }

        if (user.HouseholdId != householdId)
        {
            return OpenLootBoxResult.Failed(LootBoxStatus.NotAMember);
        }

        var competition = await db.Competitions.SingleOrDefaultAsync(
            c => c.Id == competitionId && c.HouseholdId == householdId, ct);

        if (competition is null)
        {
            return OpenLootBoxResult.Failed(LootBoxStatus.CompetitionNotFound);
        }

        if (competition.IsVoided)
        {
            return OpenLootBoxResult.Failed(LootBoxStatus.Voided);
        }

        // Winners and both partners on a win-win. Losers get nothing at all - no box and no
        // reveal - which is the behaviour confirmed in review and the reason task [24]'s
        // unopenedLootBox stays null for them.
        if (competition.WinnerUserId != userId && !competition.IsWinWin)
        {
            return OpenLootBoxResult.Failed(LootBoxStatus.NotYours);
        }

        var alreadyOpened = await db.CompetitionClaims.AnyAsync(
            c => c.CompetitionId == competitionId && c.UserId == userId, ct);

        if (alreadyOpened)
        {
            // Replay, without rolling or crediting again.
            return OpenLootBoxResult.Ok(await DescribeAsync(competition, ct));
        }

        // Only the first opener rolls. On a win-win the second partner finds a result already
        // stored and receives the same prize.
        if (competition.CoinsAwarded == 0 && competition.BonusRewardId is null)
        {
            var pool = await EligibleRewardPoolAsync(householdId, ct);
            var roll = roller.Roll(competition.PeriodType, pool);

            competition.CoinsAwarded = roll.Coins;
            competition.BonusRewardId = roll.BonusRewardId;
        }

        if (competition.BonusRewardId is not null)
        {
            // Storing the id alone would leave the user holding a label with nothing to claim, so
            // the prize becomes a real redemption at zero cost. It then appears in the partner's
            // Notices feed alongside ordinary redemptions.
            db.Redemptions.Add(new Redemption
            {
                UserId = userId,
                RewardId = competition.BonusRewardId.Value,
                RedeemedAt = DateTime.UtcNow
            });
        }
        else
        {
            user.Coins += competition.CoinsAwarded;
        }

        db.CompetitionClaims.Add(new CompetitionClaim
        {
            CompetitionId = competitionId,
            UserId = userId,
            OpenedAt = DateTime.UtcNow
        });

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            // The unique index on (competition_id, user_id) fired: a double-submitted open. Replay
            // rather than crediting twice.
            foreach (var entry in db.ChangeTracker.Entries().ToList())
            {
                await entry.ReloadAsync(ct);
            }

            return OpenLootBoxResult.Ok(await DescribeAsync(competition, ct));
        }

        return OpenLootBoxResult.Ok(await DescribeAsync(competition, ct));
    }

    /// <summary>
    /// The household's rewards that a loot box may award.
    /// </summary>
    /// <remarks>
    /// <b>Excludes <see cref="Reward.PausesCompetition"/> rewards.</b> Winning a free "full chore
    /// day off" sounds like the best prize available and is exactly the one that must not be handed
    /// out automatically: redeeming it voids that day's competition, so a loot box could silently
    /// cancel the competition the user is currently standing in. Archived rewards are excluded too
    /// — they are no longer part of the store.
    /// </remarks>
    private Task<List<int>> EligibleRewardPoolAsync(int householdId, CancellationToken ct) =>
        db.Rewards
            .Where(r => r.HouseholdId == householdId
                        && !r.PausesCompetition
                        // Added in task [29] along with the column. This comment already claimed
                        // archived rewards were excluded when written in task [25], against a column
                        // that did not exist yet - the filter is what makes it true. It matters
                        // because opening a box writes a zero-cost Redemption for the prize, which
                        // would put a reward the household removed back in front of them.
                        && r.ArchivedAt == null)
            .Select(r => r.Id)
            .ToListAsync(ct);

    private async Task<OpenLootBoxResponse> DescribeAsync(Competition competition, CancellationToken ct)
    {
        if (competition.BonusRewardId is null)
        {
            return new OpenLootBoxResponse(
                competition.Id, LootBoxResultType.Coins, competition.CoinsAwarded, Reward: null);
        }

        var reward = await db.Rewards
            .Where(r => r.Id == competition.BonusRewardId)
            .Select(r => new LootBoxRewardResponse(r.Id, r.Title))
            .SingleAsync(ct);

        return new OpenLootBoxResponse(
            competition.Id, LootBoxResultType.BonusReward, CoinsAwarded: null, reward);
    }
}
