namespace API.Entities;

/// <summary>
/// A shared home. Exactly two people, fully symmetric — there is no owner/member
/// hierarchy between them.
/// </summary>
/// <remarks>
/// The two-member cap is enforced in application code (the join endpoint, task [15]),
/// not by a database constraint: a CHECK counting related rows is not portable across
/// SQL engines. See the notes in <c>relational-model.md</c>.
/// </remarks>
public class Household
{
    public const int NameMaxLength = 60;

    /// <summary>Length of <see cref="InviteCode"/>, e.g. "7F3K9Q".</summary>
    public const int InviteCodeLength = 6;

    /// <summary>
    /// The app's central invariant. Everything downstream — the head-to-head widget, peer
    /// approval, win/lose settlement — assumes exactly two people, and the join endpoint
    /// (task [15]) is the one place that assumption is defended.
    /// </summary>
    public const int MaxMembers = 2;

    public int Id { get; set; }

    public required string Name { get; set; }

    /// <summary>
    /// The code the second partner enters to pair up. Unique across all households —
    /// joining resolves a household by code alone, so a collision would put someone
    /// in the wrong home.
    /// </summary>
    public required string InviteCode { get; set; }

    /// <summary>True once the second member has joined, closing the household.</summary>
    public bool IsFull { get; set; }

    /// <summary>
    /// The one or two partners in this household. Capped at two in application code — see
    /// the remarks above.
    /// </summary>
    public ICollection<User> Members { get; set; } = [];
}
