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
}
