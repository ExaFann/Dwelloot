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

    /// <summary>
    /// Whether this chore appears on the dashboard's one-tap quick-log wall — task [73].
    /// </summary>
    /// <remarks>
    /// The wall was never a shortlist. `QuickLogTiles` asked for the whole catalogue and rendered
    /// whatever came back, capped only by <c>ActivityService.DefaultPageSize</c> — so a household
    /// with thirty chores got thirty tiles and no way to thin them. Owner's report.
    /// <para>
    /// <b>A household-shared column, not a per-device preference.</b> Both partners see one wall;
    /// keeping the choice in each browser's storage would let them disagree about what the household
    /// considers routine, and lose it on a new phone.
    /// </para>
    /// <para>
    /// <b>Defaults to true, including for the seeded catalogue.</b> The alternative — start empty and
    /// make everyone opt in — would empty the dashboard of every existing household on deploy. The
    /// migration therefore backfills true, which is exactly the behaviour that shipped before this
    /// flag existed; what is new is the ability to take a chore off the wall.
    /// </para>
    /// </remarks>
    public bool IsQuick { get; set; } = true;

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
