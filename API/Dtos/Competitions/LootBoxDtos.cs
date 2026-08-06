using System.Text.Json.Serialization;

namespace API.Dtos.Competitions;

/// <summary>
/// Discriminator for <c>POST .../open-box</c>.
/// </summary>
/// <remarks>
/// Named member-by-member rather than by switching the global naming policy: <c>api-design.md</c>
/// uses PascalCase for activity-log status (<c>"Pending"</c>) and camelCase here, so a global
/// camelCase policy would break every documented status string.
/// </remarks>
public enum LootBoxResultType
{
    [JsonStringEnumMemberName("coins")]
    Coins,

    [JsonStringEnumMemberName("bonusReward")]
    BonusReward
}

public record LootBoxRewardResponse(int Id, string Title);

/// <summary>Shape of <c>POST /api/households/{id}/competitions/{id}/open-box</c>.</summary>
public record OpenLootBoxResponse(
    int CompetitionId,
    LootBoxResultType Result,
    int? CoinsAwarded,
    LootBoxRewardResponse? Reward);

/// <summary>
/// One opened loot box, as the household's prize feed shows it — task [36a].
/// </summary>
/// <remarks>
/// Reuses <see cref="LootBoxResultType"/> and <see cref="LootBoxRewardResponse"/> rather than
/// minting parallel types: the client already has that exact union typed for
/// <c>POST .../open-box</c>, so the feed costs it no new shape to learn.
/// <para>
/// <c>Reward</c> is joined **live** through the FK rather than snapshotted, which is correct here
/// and worth stating because the neighbouring redemption feed does the opposite: a redemption
/// snapshots <c>CoinsSpent</c> because a later re-price would misreport what was paid. A prize has
/// no price — the reward's identity is all that was won — so its current title is the right title.
/// The reward may since have been archived; that must **not** filter the row out, the same rule
/// <see cref="Entities.Reward.ArchivedAt"/> states for the two other readers of archived rows.
/// </para>
/// </remarks>
public record HouseholdPrizeResponse(
    int CompetitionId,
    int UserId,
    Entities.CompetitionPeriodType PeriodType,
    LootBoxResultType Result,
    int? CoinsAwarded,
    LootBoxRewardResponse? Reward,
    DateTime OpenedAt);

/// <summary>Paging for the prize feed. Same trio as every other list endpoint.</summary>
public record HouseholdPrizeQuery
{
    /// <summary>Treated as a page size — "the first 5" is exactly `page=1&amp;pageSize=5`.</summary>
    public int? Take { get; init; }

    public int? Page { get; init; }

    public int? PageSize { get; init; }

    /// <summary><c>PageSize</c> wins when both are supplied.</summary>
    public int? EffectivePageSize => PageSize ?? Take;
}
