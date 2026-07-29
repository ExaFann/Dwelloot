namespace API.Data.Defaults;

/// <summary>A suggested reward, ready to be copied into a household's own store.</summary>
public record RewardTemplate(string Title, int CoinCost, bool PausesCompetition = false);

/// <summary>
/// The store catalog every new household starts with.
/// </summary>
/// <remarks>
/// A code-level list rather than seeded rows, for the same reason as
/// <see cref="DefaultActivities"/>: a shared default row would be the same row every household
/// sees. Task [12] copies these into a household's own <see cref="Entities.Reward"/> rows.
/// <para>
/// <b>Rule for anything added here:</b> a default reward must be redeemable purely as a promise
/// between the two partners, with no state the system has to track. Rewards that waive a chore
/// or reassign one are deliberately excluded — the app tracks no chore obligations and no chore
/// ownership, so such a reward would either mean nothing or force "item used" bookkeeping onto
/// activity logs, the one-tap home screen and the win/loss calculation.
/// </para>
/// <para>
/// <see cref="Entities.Reward.PausesCompetition"/> is the single, deliberate exception, and only
/// "Full chore day off" uses it. Because it is the one reward that changes how scoring behaves,
/// the store UI must say so at the point of redemption rather than leaving a partner to discover
/// it after the fact — see tasks [29]/[51].
/// </para>
/// <para>
/// Prices run 15–80 Coins, with the day off most expensive since it voids a whole day.
/// </para>
/// </remarks>
public static class DefaultRewards
{
    public static IReadOnlyList<RewardTemplate> All { get; } =
    [
        new("Control the playlist for a day", 15),
        new("Movie night pick", 20),
        new("Foot massage", 25),
        new("Takeout of choice", 30),
        new("Board game night pick", 35),
        new("30-minute full body massage", 40),
        new("Partner plans a date night", 45),
        new("Full chore day off", 80, PausesCompetition: true)
    ];
}
