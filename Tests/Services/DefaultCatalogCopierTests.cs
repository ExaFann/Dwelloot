using API.Data.Defaults;
using API.Entities;
using API.Services;
using Microsoft.EntityFrameworkCore;

namespace Dwelloot.Tests.Services;

public class DefaultCatalogCopierTests
{
    private static Household NewHousehold(string name = "Our place", string inviteCode = "7F3K9Q") =>
        new() { Name = name, InviteCode = inviteCode };

    [Fact]
    public void CopyDefaultsTo_copies_every_activity_template()
    {
        using var db = TestDbContextFactory.Create();
        var household = NewHousehold();

        new DefaultCatalogCopier(db).CopyDefaultsTo(household);
        db.SaveChanges();

        var copied = db.Activities.Where(a => a.HouseholdId == household.Id).ToList();

        // Counted from the source list rather than a literal, so this asserts "all of them" and
        // stays correct when a template is added or removed.
        Assert.Equal(DefaultActivities.All.Count, copied.Count);
        Assert.Equal(
            DefaultActivities.All.Select(t => t.Title).OrderBy(t => t),
            copied.Select(a => a.Title).OrderBy(t => t));
    }

    [Fact]
    public void CopyDefaultsTo_copies_every_reward_template()
    {
        using var db = TestDbContextFactory.Create();
        var household = NewHousehold();

        new DefaultCatalogCopier(db).CopyDefaultsTo(household);
        db.SaveChanges();

        var copied = db.Rewards.Where(r => r.HouseholdId == household.Id).ToList();

        Assert.Equal(DefaultRewards.All.Count, copied.Count);
        Assert.Equal(
            DefaultRewards.All.Select(t => t.Title).OrderBy(t => t),
            copied.Select(r => r.Title).OrderBy(t => t));
    }

    [Fact]
    public void CopyDefaultsTo_attaches_every_row_to_the_target_household()
    {
        using var db = TestDbContextFactory.Create();
        var household = NewHousehold();

        new DefaultCatalogCopier(db).CopyDefaultsTo(household);
        db.SaveChanges();

        Assert.NotEqual(0, household.Id);
        Assert.All(db.Activities.ToList(), a => Assert.Equal(household.Id, a.HouseholdId));
        Assert.All(db.Rewards.ToList(), r => Assert.Equal(household.Id, r.HouseholdId));
    }

    [Fact]
    public void CopyDefaultsTo_carries_activity_values_faithfully()
    {
        using var db = TestDbContextFactory.Create();
        var household = NewHousehold();

        new DefaultCatalogCopier(db).CopyDefaultsTo(household);
        db.SaveChanges();

        foreach (var template in DefaultActivities.All)
        {
            var copied = db.Activities.Single(a => a.Title == template.Title);
            Assert.Equal(template.Points, copied.Points);
            Assert.Equal(template.Category, copied.Category);
        }
    }

    [Fact]
    public void CopyDefaultsTo_carries_reward_values_faithfully_including_PausesCompetition()
    {
        using var db = TestDbContextFactory.Create();
        var household = NewHousehold();

        new DefaultCatalogCopier(db).CopyDefaultsTo(household);
        db.SaveChanges();

        foreach (var template in DefaultRewards.All)
        {
            var copied = db.Rewards.Single(r => r.Title == template.Title);
            Assert.Equal(template.CoinCost, copied.CoinCost);

            // PausesCompetition is the only non-default boolean in either template list. Losing it
            // in the copy would silently disable the "day off" mechanic - settlement would just
            // never find a paused day - rather than failing visibly anywhere.
            Assert.Equal(template.PausesCompetition, copied.PausesCompetition);
        }

        Assert.Equal(
            DefaultRewards.All.Count(t => t.PausesCompetition),
            db.Rewards.Count(r => r.PausesCompetition));
    }

    [Fact]
    public void CopyDefaultsTo_gives_each_household_independent_rows()
    {
        // The reason this design exists at all. relational-model.md rejects shared default rows
        // because a shared row is the same row every household sees, so one household's edit
        // leaks into every other. This reproduces that scenario end to end.
        using var db = TestDbContextFactory.Create();
        var copier = new DefaultCatalogCopier(db);

        var first = NewHousehold("First place", "AAA111");
        var second = NewHousehold("Second place", "BBB222");

        copier.CopyDefaultsTo(first);
        copier.CopyDefaultsTo(second);
        db.SaveChanges();

        var firstMow = db.Activities.Single(a => a.HouseholdId == first.Id && a.Title == "Mow the lawn");
        var secondMow = db.Activities.Single(a => a.HouseholdId == second.Id && a.Title == "Mow the lawn");

        Assert.NotEqual(firstMow.Id, secondMow.Id);

        // One household edits its copy and deletes another. The other household must not notice.
        firstMow.Title = "Mow the berm";
        firstMow.Points = 40;
        db.Activities.Remove(db.Activities.Single(a => a.HouseholdId == first.Id && a.Title == "Vacuum"));
        db.SaveChanges();

        var secondAfter = db.Activities.Where(a => a.HouseholdId == second.Id).ToList();
        Assert.Equal(DefaultActivities.All.Count, secondAfter.Count);
        Assert.Contains(secondAfter, a => a.Title == "Mow the lawn");
        Assert.Contains(secondAfter, a => a.Title == "Vacuum");
        Assert.Equal(
            DefaultActivities.All.Single(t => t.Title == "Mow the lawn").Points,
            secondAfter.Single(a => a.Title == "Mow the lawn").Points);
    }

    [Fact]
    public void CopyDefaultsTo_stages_rows_without_saving()
    {
        // The caller owns the unit of work, which is what lets task [14] create a household and
        // its catalog in a single atomic SaveChanges.
        using var db = TestDbContextFactory.Create();
        var household = NewHousehold();

        new DefaultCatalogCopier(db).CopyDefaultsTo(household);

        Assert.Equal(
            DefaultActivities.All.Count + DefaultRewards.All.Count + 1,
            db.ChangeTracker.Entries().Count(e => e.State == EntityState.Added));
        Assert.Empty(db.Activities.AsNoTracking().ToList());
    }

    [Fact]
    public void CopyDefaultsTo_rejects_a_null_household()
    {
        using var db = TestDbContextFactory.Create();
        Assert.Throws<ArgumentNullException>(() => new DefaultCatalogCopier(db).CopyDefaultsTo(null!));
    }
}
