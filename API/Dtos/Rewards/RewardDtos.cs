using System.ComponentModel.DataAnnotations;
using API.Entities;
using API.Validation;

namespace API.Dtos.Rewards;

/// <summary>
/// Item shape for <c>GET /api/rewards</c>.
/// </summary>
/// <remarks>
/// <c>PausesCompetition</c> goes beyond <c>api-design.md</c>'s worked example, and is the one field
/// here that is not optional in practice. <see cref="Entities.Reward.PausesCompetition"/>,
/// <see cref="Data.Defaults.DefaultRewards"/> and <c>api-design.md</c> all require the store to spell
/// out at the point of redemption that a day-off reward voids that day's duel for <em>both</em>
/// partners — and all three say that copy is <b>derived from this flag</b> rather than stored per row,
/// so it cannot drift from what settlement does. Screen 4 is where Redeem lives, so the flag has to
/// reach it. Before this endpoint the column was read by settlement and the loot-box pool only, and
/// exposed by nothing; without it task [51] would have to match on the title.
/// <para>
/// There is deliberately no per-item <c>affordable</c>. It is <c>coinCost &lt;= coins</c>, and the
/// client holds both halves — the cost is right here and the balance comes from
/// <c>GET /api/auth/me</c>. Echoing a derived boolean is the padding that kept <c>category</c> out of
/// <see cref="Activities.ActivityResponse"/>.
/// </para>
/// </remarks>
public record RewardResponse(int Id, string Title, int CoinCost, bool PausesCompetition);

/// <summary>Query options bound from the request's query string.</summary>
public record RewardQuery
{
    /// <summary>
    /// The store's filter axis, settled in task [28]. Null means no filter; <c>true</c> narrows to
    /// what the caller's Coin balance covers; <c>false</c> is the complement — the "what am I saving
    /// for" view.
    /// </summary>
    /// <remarks>
    /// All three states are honoured on purpose. Accepting a nullable bool and then ignoring
    /// <c>false</c> would hand back the entire catalog to a client that asked for the complement,
    /// with nothing in the response to reveal the filter had been dropped.
    /// </remarks>
    public bool? Affordable { get; init; }

    public string? Search { get; init; }

    /// <summary>One of <see cref="Services.RewardSortFields.All"/>. Defaults to title.</summary>
    public string? Sort { get; init; }

    public bool Descending { get; init; }

    public int? Page { get; init; }

    public int? PageSize { get; init; }
}

/// <remarks>
/// Attributes target the constructor parameters — see the note in <c>AuthDtos.cs</c>.
/// No <c>HouseholdId</c>: the household comes from the caller's token, so a client cannot create a
/// reward in someone else's store.
/// <para>
/// <c>PausesCompetition</c> is <b>not</b> settable here — reversed by the owner in task [69].
/// </para>
/// <para>
/// The original reasoning is kept because the reversal is a change of goal, not a correction: task
/// [29] argued that price already gates abuse, that withholding the flag would break "every row
/// equally editable", and that the seeded pausing reward would become impossible to recreate. All
/// three are still true. What changed is what the flag is <em>for</em>: the owner wants voiding a
/// day to be a single special prize rather than a property any back rub can be given, because a
/// checkbox labelled "pauses the duel" on every reward form is an invitation to create a second one
/// by accident and a puzzle for the partner who then meets it.
/// </para>
/// <para>
/// So the flag now belongs to the seeded catalogue alone (<see cref="Data.Defaults.DefaultRewards"/>),
/// and the recreate-once-archived objection is answered from the other end: task [69] also refuses
/// to archive a pausing reward at all. Its <em>price</em> stays editable, which is what preserved the
/// abuse gate the original note relied on.
/// </para>
/// <para>
/// Disclosure is unchanged and still derived from the flag rather than the title, which is why task
/// [28] returns it per item.
/// </para>
/// </remarks>
public record CreateRewardRequest(
    [Required, CleanText(Reward.TitleMaxLength)]
    string Title,
    [Range(1, int.MaxValue)]
    int CoinCost);

/// <summary>
/// Partial update. A null field means "leave it alone", which is what separates this from a PUT.
/// </summary>
/// <remarks>
/// <c>HouseholdId</c> is absent by design, so no request can move a reward between households — a
/// body that cannot express the change beats one that is filtered afterwards.
/// </remarks>
/// <remarks>
/// No <c>PausesCompetition</c> — task [69]. A body that cannot express the change beats one that is
/// filtered afterwards, the same argument this record already makes about <c>HouseholdId</c>.
/// </remarks>
public record PatchRewardRequest(
    [CleanText(Reward.TitleMaxLength)]
    string? Title,
    [Range(1, int.MaxValue)]
    int? CoinCost);
