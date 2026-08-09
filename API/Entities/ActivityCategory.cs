namespace API.Entities;

/// <summary>
/// What kind of contribution an <see cref="Activity"/> represents. Stored as a string
/// column so new members can be added without migrating existing rows.
/// </summary>
/// <remarks>
/// v1 ships with <see cref="Chore"/> only. "Together" and "wellbeing" categories are designed
/// for but deliberately not built — adding them as unused members now would be 
/// dead code against a UI that cannot produce them.
/// </remarks>
public enum ActivityCategory
{
    Chore
}
