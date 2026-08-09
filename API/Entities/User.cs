using Microsoft.AspNetCore.Identity;

namespace API.Entities;

/// <summary>
/// One partner in a household. Both members are fully symmetric — there is deliberately
/// no Role field, since the app has no owner/member hierarchy to express.
/// </summary>
/// <remarks>
/// Keyed by <see cref="int"/> rather than Identity's default GUID string, so the foreign keys
/// pointing here from activity logs, redemptions, badges and competitions stay integers as
/// described in <c>relational-model.md</c>.
/// <para>
/// <c>Email</c> and <c>PasswordHash</c> are inherited from <see cref="IdentityUser{TKey}"/>;
/// hashing is Identity's, which is half of the Security advanced requirement.
/// </para>
/// </remarks>
public class User : IdentityUser<int>
{
    public const int NameMaxLength = 60;

    /// <summary>
    /// Display name shown to the partner, e.g. "Alex". Distinct from Identity's
    /// <see cref="IdentityUser{TKey}.UserName"/>, which task [13] sets to the email
    /// address because login is by email.
    /// </summary>
    public required string Name { get; set; }

    /// <summary>
    /// Null until the user creates or joins a household. This is what
    /// <c>GET /api/auth/me</c> reports as <c>householdId</c>, and what the frontend routes
    /// on: null sends them to pairing, set sends them into the app.
    /// </summary>
    public int? HouseholdId { get; set; }

    public Household? Household { get; set; }

    /// <summary>
    /// Which preset avatar this user picked, or null for the generated identicon — task [72].
    /// </summary>
    /// <remarks>
    /// Validated against <see cref="AvatarPresets.All"/> on the way in. Null is the default and
    /// stays valid forever: a user who never opens the picker, and one who picks and then clears,
    /// are the same state, and `Avatar.tsx` already draws something for both.
    /// </remarks>
    public string? AvatarKey { get; set; }

    /// <summary>Never-spent contribution measure. Decides who wins a competition period.</summary>
    public int LifetimePoints { get; set; }

    /// <summary>Spendable currency. Earned only from loot boxes, never directly from chores.</summary>
    public int Coins { get; set; }

    public int CurrentWinStreak { get; set; }

    public int LongestWinStreak { get; set; }
}
