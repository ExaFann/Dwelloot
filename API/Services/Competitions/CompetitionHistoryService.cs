using API.Data;
using API.Dtos;
using API.Dtos.Competitions;
using API.Entities;
using Microsoft.EntityFrameworkCore;

namespace API.Services.Competitions;

public sealed record PrizeHistoryResult(
    CompetitionQueryStatus Status,
    PagedResponse<HouseholdPrizeResponse>? Page)
{
    public static PrizeHistoryResult Ok(PagedResponse<HouseholdPrizeResponse> page) =>
        new(CompetitionQueryStatus.Ok, page);

    public static PrizeHistoryResult Failed(CompetitionQueryStatus status) => new(status, null);
}

public interface ICompetitionHistoryService
{
    Task<PrizeHistoryResult> ListPrizesAsync(
        int userId,
        int householdId,
        HouseholdPrizeQuery query,
        CancellationToken ct = default);
}

/// <summary>
/// What this household has **won** — task [36a], the endpoint `api-design.md` listed from the design
/// phase and no task ever built.
/// </summary>
/// <remarks>
/// The Notices tab's section is called "Prizes &amp; rewards" and until now every row in it read
/// "<em>someone</em> redeemed <em>something</em>" with a <b>−N</b> Coin figure. A section named for
/// prizes showed only Coins leaving, never arriving.
/// <para>
/// <b>Driven off <see cref="CompetitionClaim"/>, not <see cref="Competition"/>.</b> A competition is
/// a settled period; a claim is one person opening their box. On a win-win both partners open the
/// same competition at different moments, so the competition has no single "when" and no single
/// "who" — the claim has both. It also means an <em>unopened</em> box never appears: the feed is a
/// record of prizes received, and a box nobody has opened has awarded nothing.
/// </para>
/// <para>
/// <b>Scoped through <see cref="Competition.HouseholdId"/>, never the claimant's
/// <c>users.household_id</c>.</b> That column is nullable and cleared when someone leaves, so
/// joining through it would erase a departed partner's history — the rule log <c>007</c> set and
/// <see cref="RedemptionService"/> follows.
/// </para>
/// </remarks>
public class CompetitionHistoryService(AppDbContext db) : ICompetitionHistoryService
{
    public async Task<PrizeHistoryResult> ListPrizesAsync(
        int userId,
        int householdId,
        HouseholdPrizeQuery query,
        CancellationToken ct = default)
    {
        var user = await db.Users.AsNoTracking().SingleOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null)
        {
            return PrizeHistoryResult.Failed(CompetitionQueryStatus.UserNotFound);
        }

        // Nested under /api/households/{id}, so a non-member is a 404 rather than a 409 — the
        // convention this controller already follows, and it stops household ids being enumerated.
        if (user.HouseholdId is null || user.HouseholdId != householdId)
        {
            return PrizeHistoryResult.Failed(CompetitionQueryStatus.NotAMember);
        }

        var claims = db.CompetitionClaims
            .AsNoTracking()
            .Where(c => c.Competition.HouseholdId == householdId);

        // Counted before Skip/Take, so a capped page size never truncates the total.
        var total = await claims.CountAsync(ct);

        var pageSize = Math.Clamp(
            query.EffectivePageSize ?? ActivityService.DefaultPageSize,
            1,
            ActivityService.MaxPageSize);
        var page = Math.Max(query.Page ?? 1, 1);

        var items = await claims
            // Newest first, tiebroken on Id: PostgreSQL guarantees no order without one, and rows
            // would repeat or vanish across page boundaries (log `016`).
            .OrderByDescending(c => c.OpenedAt)
            .ThenByDescending(c => c.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(c => new HouseholdPrizeResponse(
                c.CompetitionId,
                c.UserId,
                c.Competition.PeriodType,
                c.Competition.BonusRewardId == null
                    ? LootBoxResultType.Coins
                    : LootBoxResultType.BonusReward,
                /*
                 * `result` is the discriminator, never the shape of the payload — log `053`'s rule.
                 * Both payload fields are nullable, so the prize kind is answerable two ways and
                 * only one of them is the contract.
                 */
                c.Competition.BonusRewardId == null ? c.Competition.CoinsAwarded : null,
                c.Competition.BonusReward == null
                    ? null
                    : new LootBoxRewardResponse(
                        c.Competition.BonusReward.Id,
                        c.Competition.BonusReward.Title),
                c.OpenedAt))
            .ToListAsync(ct);

        return PrizeHistoryResult.Ok(new PagedResponse<HouseholdPrizeResponse>(items, total));
    }
}
