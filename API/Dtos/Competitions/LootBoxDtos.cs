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
