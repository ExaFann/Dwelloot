using API.Data;
using API.Entities;
using API.Services;
using Microsoft.EntityFrameworkCore;

namespace Dwelloot.Tests.Services;

public class HouseholdServiceLeaveTests
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

    private static async Task<(Household Household, User Owner, User Partner)> PairedHouseholdAsync(AppDbContext db)
    {
        var owner = await AddUserAsync(db, "owner@example.com");
        var partner = await AddUserAsync(db, "partner@example.com");

        var created = await ServiceFor(db).CreateAsync(owner.Id, "Our place");
        await ServiceFor(db).JoinAsync(partner.Id, created.Household!.InviteCode);

        return (created.Household, owner, partner);
    }

    [Fact]
    public async Task LeaveAsync_detaches_one_of_two_and_keeps_the_household()
    {
        // Asserted through a second context, so this proves the detach was persisted rather than
        // only applied to a tracked entity. See the note on TestDbContextFactory.
        var dbName = TestDbContextFactory.NewDatabaseName();
        Household household;
        User owner;

        using (var db = TestDbContextFactory.Create(dbName))
        {
            (household, owner, _) = await PairedHouseholdAsync(db);

            var result = await ServiceFor(db).LeaveAsync(owner.Id, household.Id);

            Assert.Equal(HouseholdAccessStatus.Ok, result.Status);
            Assert.False(result.HouseholdDeleted);
        }

        using var fresh = TestDbContextFactory.Create(dbName);
        Assert.Null((await fresh.Users.SingleAsync(u => u.Id == owner.Id)).HouseholdId);
        Assert.True(await fresh.Households.AnyAsync(h => h.Id == household.Id));
    }

    [Fact]
    public async Task LeaveAsync_clears_IsFull_so_the_slot_is_free_again()
    {
        using var db = TestDbContextFactory.Create();
        var (household, owner, _) = await PairedHouseholdAsync(db);
        Assert.True(await db.Households.AnyAsync(h => h.Id == household.Id && h.IsFull));

        await ServiceFor(db).LeaveAsync(owner.Id, household.Id);

        Assert.False((await db.Households.SingleAsync(h => h.Id == household.Id)).IsFull);
    }

    [Fact]
    public async Task LeaveAsync_leaves_the_remaining_partner_attached()
    {
        using var db = TestDbContextFactory.Create();
        var (household, owner, partner) = await PairedHouseholdAsync(db);

        await ServiceFor(db).LeaveAsync(owner.Id, household.Id);

        Assert.Equal(household.Id, (await db.Users.SingleAsync(u => u.Id == partner.Id)).HouseholdId);
    }

    [Fact]
    public async Task A_freed_household_can_be_joined_by_someone_new()
    {
        // The real point of resetting IsFull, and the assertion that fails if this task forgets.
        using var db = TestDbContextFactory.Create();
        var (household, owner, _) = await PairedHouseholdAsync(db);
        var newcomer = await AddUserAsync(db, "newcomer@example.com");

        await ServiceFor(db).LeaveAsync(owner.Id, household.Id);
        var join = await ServiceFor(db).JoinAsync(newcomer.Id, household.InviteCode);

        Assert.Equal(JoinHouseholdStatus.Joined, join.Status);
        Assert.Equal(
            Household.MaxMembers,
            await db.Users.CountAsync(u => u.HouseholdId == household.Id));
    }

    [Fact]
    public async Task LeaveAsync_deletes_the_household_when_the_last_member_leaves()
    {
        using var db = TestDbContextFactory.Create();
        var owner = await AddUserAsync(db, "owner@example.com");
        var created = await ServiceFor(db).CreateAsync(owner.Id, "Our place");

        var result = await ServiceFor(db).LeaveAsync(owner.Id, created.Household!.Id);

        Assert.Equal(HouseholdAccessStatus.Ok, result.Status);
        Assert.True(result.HouseholdDeleted);
        Assert.False(await db.Households.AnyAsync(h => h.Id == created.Household.Id));
    }

    [Fact]
    public async Task Deleting_the_household_takes_its_catalog_with_it()
    {
        // Verifies the cascade actually fires rather than assuming it from the configuration.
        using var db = TestDbContextFactory.Create();
        var owner = await AddUserAsync(db, "owner@example.com");
        var created = await ServiceFor(db).CreateAsync(owner.Id, "Our place");
        var householdId = created.Household!.Id;

        Assert.NotEmpty(await db.Activities.Where(a => a.HouseholdId == householdId).ToListAsync());

        await ServiceFor(db).LeaveAsync(owner.Id, householdId);

        Assert.Empty(await db.Activities.Where(a => a.HouseholdId == householdId).ToListAsync());
        Assert.Empty(await db.Rewards.Where(r => r.HouseholdId == householdId).ToListAsync());
    }

    [Fact]
    public async Task The_leaver_survives_the_household_deletion()
    {
        using var db = TestDbContextFactory.Create();
        var owner = await AddUserAsync(db, "owner@example.com");
        var created = await ServiceFor(db).CreateAsync(owner.Id, "Our place");

        await ServiceFor(db).LeaveAsync(owner.Id, created.Household!.Id);

        var stillThere = await db.Users.SingleOrDefaultAsync(u => u.Id == owner.Id);
        Assert.NotNull(stillThere);
        Assert.Null(stillThere!.HouseholdId);
    }

    [Fact]
    public async Task Both_partners_leaving_in_turn_removes_the_household_entirely()
    {
        using var db = TestDbContextFactory.Create();
        var (household, owner, partner) = await PairedHouseholdAsync(db);

        var first = await ServiceFor(db).LeaveAsync(owner.Id, household.Id);
        var second = await ServiceFor(db).LeaveAsync(partner.Id, household.Id);

        Assert.False(first.HouseholdDeleted);
        Assert.True(second.HouseholdDeleted);
        Assert.Empty(await db.Households.ToListAsync());
        Assert.Equal(2, await db.Users.CountAsync(u => u.HouseholdId == null));
    }

    [Fact]
    public async Task LeaveAsync_refuses_a_household_the_caller_is_not_in()
    {
        using var db = TestDbContextFactory.Create();
        var (household, _, _) = await PairedHouseholdAsync(db);
        var stranger = await AddUserAsync(db, "stranger@example.com");

        var result = await ServiceFor(db).LeaveAsync(stranger.Id, household.Id);

        Assert.Equal(HouseholdAccessStatus.NotAMember, result.Status);
        Assert.Equal(
            Household.MaxMembers,
            await db.Users.CountAsync(u => u.HouseholdId == household.Id));
    }
}
