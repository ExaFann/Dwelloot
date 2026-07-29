using API.Data;
using API.Entities;
using API.Services;
using Microsoft.EntityFrameworkCore;

namespace Dwelloot.Tests.Services;

public class HouseholdServiceQueryTests
{
    private static HouseholdService ServiceFor(AppDbContext db) =>
        new(db, new DefaultCatalogCopier(db), new InviteCodeGenerator());

    private static async Task<User> AddUserAsync(AppDbContext db, string email)
    {
        var user = new User { Name = email.Split('@')[0], Email = email, UserName = email };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        return user;
    }

    /// <summary>A household with both partners in it.</summary>
    private static async Task<(Household Household, User Owner, User Partner)> PairedHouseholdAsync(AppDbContext db)
    {
        var owner = await AddUserAsync(db, "owner@example.com");
        var partner = await AddUserAsync(db, "partner@example.com");

        var created = await ServiceFor(db).CreateAsync(owner.Id, "Our place");
        await ServiceFor(db).JoinAsync(partner.Id, created.Household!.InviteCode);

        return (created.Household, owner, partner);
    }

    [Fact]
    public async Task GetAsync_returns_the_household_with_both_members()
    {
        using var db = TestDbContextFactory.Create();
        var (household, owner, partner) = await PairedHouseholdAsync(db);

        var result = await ServiceFor(db).GetAsync(owner.Id, household.Id);

        Assert.Equal(HouseholdAccessStatus.Ok, result.Status);
        Assert.Equal(household.Id, result.Household!.Id);
        Assert.Equal(
            new[] { owner.Id, partner.Id }.OrderBy(i => i),
            result.Household.Members.Select(m => m.Id).OrderBy(i => i));
    }

    [Fact]
    public async Task GetAsync_refuses_a_non_member()
    {
        // The IDOR test. Without this check, GET /api/households/{id} hands a stranger another
        // household's invite code - the credential for joining it.
        using var db = TestDbContextFactory.Create();
        var (household, _, _) = await PairedHouseholdAsync(db);
        var stranger = await AddUserAsync(db, "stranger@example.com");

        var result = await ServiceFor(db).GetAsync(stranger.Id, household.Id);

        Assert.Equal(HouseholdAccessStatus.NotAMember, result.Status);
        Assert.Null(result.Household);
    }

    [Fact]
    public async Task GetAsync_reports_an_unknown_household()
    {
        using var db = TestDbContextFactory.Create();
        var user = await AddUserAsync(db, "alex@example.com");

        var result = await ServiceFor(db).GetAsync(user.Id, householdId: 999);

        Assert.Equal(HouseholdAccessStatus.HouseholdNotFound, result.Status);
    }

    [Fact]
    public async Task GetAsync_refuses_a_user_who_belongs_to_a_different_household()
    {
        using var db = TestDbContextFactory.Create();
        var (theirs, _, _) = await PairedHouseholdAsync(db);

        var outsider = await AddUserAsync(db, "outsider@example.com");
        await ServiceFor(db).CreateAsync(outsider.Id, "Own place");

        var result = await ServiceFor(db).GetAsync(outsider.Id, theirs.Id);

        Assert.Equal(HouseholdAccessStatus.NotAMember, result.Status);
    }

    [Fact]
    public async Task RenameAsync_changes_and_persists_the_name()
    {
        // Verified through a SECOND context over the same store. Querying through the context that
        // made the change returns the tracked entity, which shows the new name whether or not
        // SaveChanges ran - mutation testing caught this test passing against a service that never
        // saved.
        var dbName = TestDbContextFactory.NewDatabaseName();
        Household household;
        User owner;

        using (var db = TestDbContextFactory.Create(dbName))
        {
            (household, owner, _) = await PairedHouseholdAsync(db);

            var result = await ServiceFor(db).RenameAsync(owner.Id, household.Id, "The Nest");

            Assert.Equal(HouseholdAccessStatus.Ok, result.Status);
            Assert.Equal("The Nest", result.Household!.Name);
        }

        using var fresh = TestDbContextFactory.Create(dbName);
        Assert.Equal("The Nest", (await fresh.Households.SingleAsync(h => h.Id == household.Id)).Name);
    }

    [Fact]
    public async Task RenameAsync_can_be_done_by_either_partner()
    {
        // Both members are symmetric - there is no owner privilege in this app.
        using var db = TestDbContextFactory.Create();
        var (household, _, partner) = await PairedHouseholdAsync(db);

        var result = await ServiceFor(db).RenameAsync(partner.Id, household.Id, "The Nest");

        Assert.Equal(HouseholdAccessStatus.Ok, result.Status);
    }

    [Fact]
    public async Task RenameAsync_refuses_a_non_member_and_leaves_the_name_alone()
    {
        using var db = TestDbContextFactory.Create();
        var (household, _, _) = await PairedHouseholdAsync(db);
        var stranger = await AddUserAsync(db, "stranger@example.com");

        var result = await ServiceFor(db).RenameAsync(stranger.Id, household.Id, "Pwned");

        Assert.Equal(HouseholdAccessStatus.NotAMember, result.Status);

        // A rejected write that partially applied would be worse than a clean refusal.
        Assert.Equal("Our place", (await db.Households.SingleAsync(h => h.Id == household.Id)).Name);
    }
}
