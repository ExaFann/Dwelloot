namespace API.Entities;

/// <summary>
/// One user having unlocked one <see cref="Badge"/>, and when.
/// </summary>
/// <remarks>
/// A table rather than a plain link because it carries <see cref="UnlockedAt"/>. A user may
/// unlock a given badge only once — enforced by a unique index on
/// (<see cref="UserId"/>, <see cref="BadgeId"/>), which matters because task [26] re-checks
/// criteria on every settlement and would otherwise insert a duplicate every time a streak badge's
/// threshold stayed satisfied.
/// </remarks>
public class UserBadge
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public User User { get; set; } = null!;

    public int BadgeId { get; set; }

    public Badge Badge { get; set; } = null!;

    public DateTime UnlockedAt { get; set; }
}
