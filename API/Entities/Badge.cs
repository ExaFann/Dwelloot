namespace API.Entities;

/// <summary>
/// An achievement any user can unlock. Unlike <see cref="Activity"/> and <see cref="Reward"/>,
/// badges are a single app-wide catalog with no <c>HouseholdId</c>.
/// </summary>
/// <remarks>
/// That difference is why badges are seeded as real rows rather than copied per household: the
/// copy-on-creation model exists because partners can edit their chores and rewards, so a shared
/// row would leak one household's edit everywhere. Nobody edits a badge, so the problem does not
/// arise — and <see cref="UserBadge.BadgeId"/> is a foreign key, so these have to be rows anyway.
/// <para>
/// Refer to a specific badge from code through <see cref="BadgeCode"/>, never by literal id.
/// </para>
/// </remarks>
public class Badge
{
    public const int NameMaxLength = 60;
    public const int CriteriaMaxLength = 200;

    public int Id { get; set; }

    public required string Name { get; set; }

    /// <summary>
    /// Human-readable "how do I earn this", shown on the badge grid — not a machine-parsed rule.
    /// The evaluation itself is code in task [26], keyed by <see cref="BadgeCode"/>; a parser for
    /// six fixed badges would be more machinery than six checks, and harder to test.
    /// </summary>
    public required string Criteria { get; set; }
}
