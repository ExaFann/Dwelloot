namespace API.Entities;

/// <summary>
/// A purchase from the Store: one partner spending Coins on one <see cref="Reward"/>.
/// </summary>
/// <remarks>
/// Whether the buyer could afford it is checked in application code (task [30]), not by a
/// database constraint — the rule compares against <see cref="User.Coins"/> in another table,
/// which a portable row-level CHECK cannot see. Same reasoning as the max-two-members rule.
/// </remarks>
public class Redemption
{
    public int Id { get; set; }

    /// <summary>Who spent the Coins.</summary>
    public int UserId { get; set; }

    public User User { get; set; } = null!;

    public int RewardId { get; set; }

    public Reward Reward { get; set; } = null!;

    /// <summary>
    /// What this purchase actually cost, copied from <see cref="Reward.CoinCost"/> when the redemption
    /// was created — <b>not</b> a live read through the foreign key. Constrained <c>&gt; 0</c>.
    /// </summary>
    /// <remarks>
    /// The mirror of <see cref="ActivityLog.PointsAwarded"/>, and added for the mirror-image reason.
    /// Task [29] made reward prices editable, so without this column editing a reward from 30 Coins to
    /// 5 would make every past purchase of it read as having cost 5. One is a catalog edit rewriting
    /// what a chore was worth, the other a catalog edit rewriting what a reward cost; the schema now
    /// refuses both.
    /// <para>
    /// The Coin balance itself is a stored running total on <see cref="User.Coins"/> rather than a
    /// replay of these rows, so this column is the record of the charge, not the source of the balance.
    /// </para>
    /// </remarks>
    public int CoinsSpent { get; set; }

    /// <summary>
    /// When the purchase happened. More than an audit field: task [23] reads the calendar day of
    /// this timestamp to decide whether a <see cref="Reward.PausesCompetition"/> redemption voided
    /// that day's competition, so it is part of the scoring rules.
    /// </summary>
    /// <remarks>
    /// Always "now" at insert time — there is deliberately no scheduling, so a pause can never be
    /// booked for a future day.
    /// </remarks>
    public DateTime RedeemedAt { get; set; }
}
