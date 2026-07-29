namespace API.Entities;

/// <summary>
/// One thing a partner can log doing — a chore, in v1. Called "Chores" everywhere in the UI;
/// the entity and route keep the broader name so one flexible table serves later categories
/// instead of a table per category.
/// </summary>
/// <remarks>
/// Every row belongs to exactly one household. The suggested defaults in
/// <see cref="Data.Defaults.DefaultActivities"/> are copied into a household's own rows when it
/// is created (tasks [12]/[14]) rather than living as shared rows, so either partner can freely
/// edit or delete any of them without affecting anyone else's household.
/// </remarks>
public class Activity
{
    public const int TitleMaxLength = 80;

    public int Id { get; set; }

    public required string Title { get; set; }

    /// <summary>Points awarded to the logger once the partner approves. Always positive.</summary>
    public int Points { get; set; }

    public ActivityCategory Category { get; set; } = ActivityCategory.Chore;

    public int HouseholdId { get; set; }

    public Household Household { get; set; } = null!;

    /// <summary>
    /// When this chore was removed from the catalog, or null while it is still offered.
    /// </summary>
    /// <remarks>
    /// Removing a chore archives it rather than deleting the row, because
    /// <see cref="ActivityLog.ActivityId"/> cascades: a hard delete would take every log of that
    /// chore with it. That is not merely a lost audit trail —
    /// <list type="bullet">
    /// <item>the <em>current</em> competition period is computed live from approved logs, so
    /// deleting a chore mid-period would silently reduce whoever logged it;</item>
    /// <item>either partner may remove any household chore, so that reduction is something one
    /// partner could inflict on the other.</item>
    /// </list>
    /// Archiving keeps the row, so history, points and settlement are all untouched, while the
    /// chore stops appearing in the catalog and in one-tap logging.
    /// </remarks>
    public DateTime? ArchivedAt { get; set; }
}
