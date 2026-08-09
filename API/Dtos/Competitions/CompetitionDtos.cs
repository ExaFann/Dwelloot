using API.Entities;

namespace API.Dtos.Competitions;

/// <summary>
/// A settled competition the caller won (or drew) and has not yet opened.
/// </summary>
/// <remarks>
/// <c>Won</c> is always true as things stand: this is only populated when there is a box to open,
/// so a loss produces null rather than <c>won: false</c>. That redundancy is deliberate and named
/// rather than hidden — <c>api-design.md</c> includes the field, and the alternative reading
/// (populate on losses too, so the dashboard can announce the partner's win) would stretch both
/// this field's name and <see cref="CompetitionClaim"/>, which task [11] defined as opening a box
/// rather than acknowledging an outcome. Task [25]/[53] owns that call.
/// </remarks>
public record UnopenedLootBoxResponse(
    int CompetitionId,
    CompetitionPeriodType PeriodType,
    bool Won,
    bool IsWinWin);

/// <summary>Shape of <c>GET /api/households/{id}/competitions/current</c>.</summary>
public record CurrentCompetitionResponse(
    CompetitionPeriodType PeriodType,
    DateTime PeriodStart,
    DateTime PeriodEnd,
    int MyPoints,
    int PartnerPoints,
    bool Settled,
    bool Voided,
    UnopenedLootBoxResponse? UnopenedLootBox);
