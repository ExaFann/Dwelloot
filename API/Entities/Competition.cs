namespace API.Entities;

/// <summary>
/// One settled competition period for a household — who won, what the loot box held, and the
/// scores it was decided on.
/// </summary>
/// <remarks>
/// <b>A row exists if and only if the period has been settled.</b> Settlement is lazy: the first
/// request after a period boundary computes the result and persists it, so nothing is written
/// while a period is still live. That is why <see cref="SettledAt"/> is not nullable and why
/// there is no separate "settled" flag — the row's existence is the answer.
/// <para>
/// The row is deliberately self-contained. Scores, void status and the loot box result are all
/// stored rather than recomputed, because the data they would be recomputed from is deletable:
/// deleting a chore cascades away its logs, and deleting a reward cascades away its redemptions.
/// A settled period must not change its story afterwards.
/// </para>
/// </remarks>
public class Competition
{
    public int Id { get; set; }

    public int HouseholdId { get; set; }

    public Household Household { get; set; } = null!;

    public CompetitionPeriodType PeriodType { get; set; }

    /// <summary>Inclusive start of the period.</summary>
    public DateTime PeriodStart { get; set; }

    /// <summary>Exclusive end of the period — the window is half-open, [start, end).</summary>
    public DateTime PeriodEnd { get; set; }

    /// <summary>
    /// Null on a win-win and on a voided period. Nullable is the whole reason this column needs
    /// care: "no winner" is a normal outcome here, not a missing value.
    /// </summary>
    public int? WinnerUserId { get; set; }

    public User? Winner { get; set; }

    /// <summary>Winning score. Equal to <see cref="LoserPoints"/> on a win-win.</summary>
    public int WinnerPoints { get; set; }

    public int LoserPoints { get; set; }

    /// <summary>
    /// A genuine tie: equal Points <em>and</em> both partners logged at least one approved
    /// activity. Without the second half a zero-activity day would trivially "win-win", which is
    /// a loophole rather than a feature.
    /// </summary>
    public bool IsWinWin { get; set; }

    /// <summary>
    /// A <see cref="Reward.PausesCompetition"/> reward was redeemed during this period, so it
    /// settles with no winner and no loot box for either partner. Recorded rather than derived,
    /// because the redemption that caused it can later be deleted.
    /// </summary>
    public bool IsVoided { get; set; }

    /// <summary>
    /// Coins in the loot box, rolled once at settlement. Zero when voided. On a win-win both
    /// partners receive this same amount rather than rolling separately.
    /// </summary>
    public int CoinsAwarded { get; set; }

    /// <summary>
    /// Set instead of Coins when the roll produced the rare bonus drop. Persisting it here is
    /// what makes <c>POST .../open-box</c> idempotent — the endpoint reveals a stored result
    /// rather than rolling on each call.
    /// </summary>
    public int? BonusRewardId { get; set; }

    public Reward? BonusReward { get; set; }

    public DateTime SettledAt { get; set; }
}
