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
