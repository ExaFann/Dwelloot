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
