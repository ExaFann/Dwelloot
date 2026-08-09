using API.Data;
using API.Data.Defaults;
using API.Entities;

namespace API.Services;

/// <inheritdoc cref="IDefaultCatalogCopier"/>
public class DefaultCatalogCopier(AppDbContext db) : IDefaultCatalogCopier
{
    public void CopyDefaultsTo(Household household)
    {
        ArgumentNullException.ThrowIfNull(household);

        // Household is assigned through the navigation rather than HouseholdId, so this works
        // before the household has been inserted and has an id. EF resolves the foreign keys when
        // the caller saves.
        db.Activities.AddRange(DefaultActivities.All.Select(template => new Activity
        {
            Household = household,
            Title = template.Title,
            Points = template.Points,
            Category = template.Category
        }));

        db.Rewards.AddRange(DefaultRewards.All.Select(template => new Reward
        {
            Household = household,
            Title = template.Title,
            CoinCost = template.CoinCost,
            PausesCompetition = template.PausesCompetition
        }));
    }
}
