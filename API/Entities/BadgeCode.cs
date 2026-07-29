namespace API.Entities;

/// <summary>
/// Stable handles for the seeded <see cref="Badge"/> rows. <b>Each member's value is that
/// badge's primary key</b>, so task [26] can unlock a specific badge by symbol instead of a
/// magic number.
/// </summary>
/// <remarks>
/// Changing a value here silently repoints an unlock at a different badge — treat these as a
/// contract with the seed data in <c>BadgeConfiguration</c>, not as an ordinary enum.
/// Ids 2 and 3 are additionally fixed by the <c>GET /api/badges</c> example in
/// <c>api-design.md</c>.
/// </remarks>
public enum BadgeCode
{
    FirstChore = 1,
    ThreeDayWinStreak = 2,
    FirstRedemption = 3,
    SevenDayWinStreak = 4,
    Century = 5,
    BigSpender = 6
}
