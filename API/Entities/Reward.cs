namespace API.Entities;

/// <summary>
/// Something a partner can buy from the Store with Coins.
/// </summary>
/// <remarks>
/// Priced in <b>Coins</b>, never Points. That separation is the whole economy: Points measure
/// contribution and are never spent, Coins come out of winning a loot box. You cannot buy your
/// way to a reward just by doing routine chores — only by winning.
/// <para>
/// Like <see cref="Activity"/>, every row belongs to exactly one household. The suggested
/// defaults in <see cref="Data.Defaults.DefaultRewards"/> are copied into a household's own rows
/// at creation (tasks [12]/[14]) rather than shared, so either partner can edit or delete any of
/// them freely.
/// </para>
/// </remarks>
public class Reward
{
    public const int TitleMaxLength = 80;

    public int Id { get; set; }

    public required string Title { get; set; }

    /// <summary>Price in Coins. Always positive.</summary>
    public int CoinCost { get; set; }

    /// <summary>
    /// True for rewards like "full chore day off". Redeeming one voids that calendar day's
    /// daily competition for <em>both</em> partners — no winner, no loser, no daily loot box.
    /// </summary>
    /// <remarks>
    /// Without this, such a reward would be self-defeating: the redeemer contributes nothing
    /// that day, so ordinary win/lose rules would make them lose the daily competition every
    /// time they used the reward they had earned.
    /// <para>
    /// Two scoping rules for task [23], which is what actually reads this flag: the pause
    /// applies to the calendar day of redemption (there is no date picker for a future day),
    /// and weekly/monthly competitions are untouched — they are independent Points sums, not
    /// derived from daily results, so a paused day simply contributes fewer Points.
    /// </para>
    /// <para>
    /// This is the only reward property that changes how scoring behaves, so the store must
    /// spell out the consequence at the point of redemption — that today's duel is voided for
    /// <em>both</em> partners — rather than letting one of them find out when their loot box
    /// never arrives. Tasks [29]/[51] own that copy; it is derived from this flag rather than
    /// stored per row, so it cannot drift from what settlement actually does.
    /// </para>
    /// </remarks>
    public bool PausesCompetition { get; set; }

    public int HouseholdId { get; set; }

    public Household Household { get; set; } = null!;
}
