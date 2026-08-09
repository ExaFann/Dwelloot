using API.Entities;

namespace API.Services;

/// <summary>
/// Copies the code-level default chore and reward templates into a household's own rows.
/// </summary>
/// <remarks>
/// Not a database seed, and deliberately not named one. A shared default row would be the
/// <em>same row</em> every household sees, so one household editing "Mow the lawn" would rename it
/// for everyone — see the "Default catalog seeding" note in <c>relational-model.md</c>. Copying
/// makes every row household-owned and freely editable by either partner.
/// </remarks>
public interface IDefaultCatalogCopier
{
    /// <summary>
    /// Stages a fresh copy of every default template against <paramref name="household"/>.
    /// </summary>
    /// <remarks>
    /// Takes the household rather than its id, and does not save. A household's id does not exist
    /// until it has been inserted, so an id-based signature would force the caller to save twice —
    /// and a failure between those saves leaves a household with an empty catalog. Attaching
    /// through the navigation property instead lets task [14] create the household and its catalog
    /// in one <c>SaveChanges</c>, atomic by construction rather than by remembering to open a
    /// transaction.
    /// </remarks>
    void CopyDefaultsTo(Household household);
}
