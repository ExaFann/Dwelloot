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

/// <summary>Accepted values for <c>GET /api/redemptions?scope=</c>.</summary>
public static class RedemptionScopes
{
    public const string Household = "household";

    public static readonly IReadOnlyList<string> All = [Household];
}

/// <summary>Query options for the household redemption feed, <c>GET /api/redemptions</c>.</summary>
public record HouseholdRedemptionQuery
{
    /// <summary>
    /// Optional; <see cref="RedemptionScopes.Household"/> is the only implemented value and the
    /// default. Compared case-insensitively.
    /// </summary>
    /// <remarks>
    /// An unrecognised value is a <b>400</b> rather than a silent fallback. That follows the sort-field
    /// precedent from log <c>016</c>, but for a stronger reason: the fallback direction is dangerous
    /// here. A client that mistypes this and is quietly given the whole household's rows has been
    /// handed <em>more</em> data than it asked for, so when the two failure modes are "return less" and
    /// "return more", the parameter is strict.
    /// </remarks>
    public string? Scope { get; init; }

    /// <summary>
    /// Drops the caller's own redemptions, leaving the partner's. What the Notices feed asks for.
    /// </summary>
    /// <remarks>
    /// Defaults to false: an unfiltered household query honestly means the whole household. With this
    /// set, the result and <c>GET /api/redemptions/mine</c> partition the household's redemptions —
    /// every row is in exactly one of them.
    /// </remarks>
    public bool ExcludeMine { get; init; }

    /// <summary>Treated as a page size — see <see cref="MyRedemptionQuery.Take"/>.</summary>
    public int? Take { get; init; }

    public int? Page { get; init; }

    public int? PageSize { get; init; }

    public int? EffectivePageSize => PageSize ?? Take;
}

/// <summary>
/// Item shape for <c>GET /api/redemptions</c>, the Notices tab's partner-achievements feed.
/// </summary>
/// <remarks>
/// Two fields go beyond <c>api-design.md</c>'s worked example.
/// <para>
/// <c>CoinsSpent</c> is the snapshot from task [30]. Without it the feed would show the reward's
/// <em>current</em> price against a past purchase — exactly the drift that column exists to prevent, and
/// the difference between "they redeemed the day off for 80 Coins" and whatever it was repriced to
/// afterwards. It is also what gives this section the competitive weight <c>wireframes.md</c> asks of it.
/// </para>
/// <para>
/// <c>RewardId</c> so a feed entry naming a catalog item carries its identifier instead of forcing the
/// client to match on title — the fragility task [28] avoided by returning <c>pausesCompetition</c>
/// rather than letting the UI recognise the day off by name.
/// </para>
/// <para>
/// <c>UserName</c> is deliberately absent: the client already has both members from
/// <c>GET /api/households/{id}</c>, and copying a name into every row invites it going stale.
/// </para>
/// </remarks>
public record HouseholdRedemptionResponse(
    int Id,
    int UserId,
    int RewardId,
    string RewardTitle,
    int CoinsSpent,
    DateTime RedeemedAt);
