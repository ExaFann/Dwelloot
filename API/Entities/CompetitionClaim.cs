namespace API.Entities;

/// <summary>
/// One partner opening the loot box from one settled <see cref="Competition"/>.
/// </summary>
/// <remarks>
/// A table rather than an <c>opened_at</c> column on <see cref="Competition"/> because opening is
/// per-user: on a win-win <em>both</em> partners open a box, so a single column would let whoever
/// opened first consume the reveal for both. Row counts by outcome — a win produces one, a win-win
/// two, a voided period none.
/// <para>
/// The prize itself still lives on <see cref="Competition"/>, so on a win-win both partners
/// receive the same rolled result. If independent rolls are wanted later, move
/// <see cref="Competition.CoinsAwarded"/> and <see cref="Competition.BonusRewardId"/> onto this
/// table — an additive change rather than a restructuring, which is why the claim lives here.
/// </para>
/// </remarks>
public class CompetitionClaim
{
    public int Id { get; set; }

    public int CompetitionId { get; set; }

    public Competition Competition { get; set; } = null!;

    public int UserId { get; set; }

    public User User { get; set; } = null!;

    /// <summary>When this partner revealed their box.</summary>
    public DateTime OpenedAt { get; set; }
}
