using System.ComponentModel.DataAnnotations;

namespace API.Dtos.Redemptions;

/// <remarks>
/// The whole body. <b>There is deliberately no cost field</b> — the price is read from the reward row on
/// the server, so a "tampered cost" is not something a client can express, in the same way
/// <see cref="Activities.CreateActivityRequest"/> has no <c>HouseholdId</c>. Filtering a value out is
/// weaker than never accepting one.
/// </remarks>
public record CreateRedemptionRequest(
    [Range(1, int.MaxValue)]
    int RewardId);

/// <summary>
/// Shape of <c>POST /api/redemptions</c>'s 201 response.
/// </summary>
/// <remarks>
/// Two fields go beyond <c>api-design.md</c>'s worked example.
/// <para>
/// <c>CoinsSpent</c> is the snapshot taken at purchase time
/// (<see cref="Entities.Redemption.CoinsSpent"/>), so the confirmation can state what was actually
/// charged rather than what the reward happens to cost when the screen next loads.
/// </para>
/// <para>
/// <c>CoinsRemaining</c> is the authoritative post-spend balance. The store disables Redeem on an
/// insufficient balance, so it has to re-evaluate the moment a purchase succeeds — returning the
/// server's figure saves a round trip to <c>/auth/me</c> and avoids showing a wrong number if the
/// client's cached balance was stale.
/// </para>
/// </remarks>
public record RedemptionResponse(
    int Id,
    int RewardId,
    int CoinsSpent,
    int CoinsRemaining,
    DateTime RedeemedAt);

/// <summary>Query options for <c>GET /api/redemptions/mine</c>.</summary>
/// <remarks>
/// No status filter: redemptions have no status, so the sibling
/// <see cref="ActivityLogs.MyActivityLogQuery"/>'s <c>?status=</c> has no counterpart here.
/// </remarks>
public record MyRedemptionQuery
{
    /// <summary>
    /// Treated as a page size, matching the decision log <c>022</c> made for the sibling endpoint —
    /// "the first 5" is exactly <c>page=1&amp;pageSize=5</c>. <see cref="PageSize"/> wins if both are
    /// supplied, being the more specific of the two.
    /// </summary>
    public int? Take { get; init; }

    public int? Page { get; init; }

    public int? PageSize { get; init; }

    public int? EffectivePageSize => PageSize ?? Take;
}

/// <summary>
/// Item shape for <c>GET /api/redemptions/mine</c>.
/// </summary>
/// <remarks>
/// <c>RewardTitle</c> is what makes this a history rather than a list of ids, and it doubles as the
/// visible payoff of task [29]: a purchase of a since-archived reward still resolves its title, because
/// the row was archived rather than deleted.
/// <para>
/// <c>CoinsSpent</c> is the snapshot stored on the redemption
/// (<see cref="Entities.Redemption.CoinsSpent"/>), not the reward's current price. Reading it back here
/// is what makes the snapshot observable — before this endpoint the column was written and never shown.
/// </para>
/// <para>
/// <c>PausesCompetition</c> is deliberately absent. It would explain why a past day was voided, but no
/// documented screen asks for it, and a field added on a guess is the padding that kept
/// <c>category</c> out of <see cref="Activities.ActivityResponse"/>.
/// </para>
/// </remarks>
public record MyRedemptionResponse(
    int Id,
    int RewardId,
    string RewardTitle,
    int CoinsSpent,
    DateTime RedeemedAt);
