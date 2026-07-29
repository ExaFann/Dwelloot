using API.Data;
using API.Data.Defaults;
using API.Entities;
using API.Services;
using Microsoft.EntityFrameworkCore;

namespace Dwelloot.Tests.Services;

public class HouseholdServiceJoinTests
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

    /// <summary>Creates a household owned by a fresh user and returns its invite code.</summary>
    private static async Task<(Household Household, User Owner)> SeedHouseholdAsync(AppDbContext db)
    {
        var owner = await AddUserAsync(db, "owner@example.com");
        var created = await ServiceFor(db).CreateAsync(owner.Id, "Our place");
        return (created.Household!, owner);
    }

    [Fact]
    public async Task JoinAsync_assigns_the_joining_user_to_the_household()
    {
        using var db = TestDbContextFactory.Create();
        var (household, _) = await SeedHouseholdAsync(db);
        var partner = await AddUserAsync(db, "partner@example.com");

        var result = await ServiceFor(db).JoinAsync(partner.Id, household.InviteCode);

        Assert.Equal(JoinHouseholdStatus.Joined, result.Status);
        Assert.Equal(household.Id, (await db.Users.SingleAsync(u => u.Id == partner.Id)).HouseholdId);
    }

    [Fact]
    public async Task JoinAsync_marks_the_household_full_once_the_second_member_joins()
    {
        using var db = TestDbContextFactory.Create();
        var (household, _) = await SeedHouseholdAsync(db);
        var partner = await AddUserAsync(db, "partner@example.com");

        Assert.False(household.IsFull);

        var result = await ServiceFor(db).JoinAsync(partner.Id, household.InviteCode);

        Assert.True(result.Household!.IsFull);
        Assert.True((await db.Households.SingleAsync(h => h.Id == household.Id)).IsFull);
    }

    [Fact]
    public async Task JoinAsync_rejects_a_third_member_and_leaves_them_unattached()
    {
        // The headline rule of this task. Everything downstream assumes exactly two people.
        using var db = TestDbContextFactory.Create();
        var (household, _) = await SeedHouseholdAsync(db);
        var partner = await AddUserAsync(db, "partner@example.com");
        var gatecrasher = await AddUserAsync(db, "third@example.com");

        await ServiceFor(db).JoinAsync(partner.Id, household.InviteCode);
        var result = await ServiceFor(db).JoinAsync(gatecrasher.Id, household.InviteCode);

        Assert.Equal(JoinHouseholdStatus.HouseholdFull, result.Status);

        // A rejection that half-applied would be worse than one that failed outright.
        Assert.Null((await db.Users.SingleAsync(u => u.Id == gatecrasher.Id)).HouseholdId);
        Assert.Equal(
            Household.MaxMembers,
            await db.Users.CountAsync(u => u.HouseholdId == household.Id));
    }

    [Fact]
    public async Task JoinAsync_rejects_a_user_who_already_has_a_household()
    {
        using var db = TestDbContextFactory.Create();
        var (first, _) = await SeedHouseholdAsync(db);

        var other = await AddUserAsync(db, "other@example.com");
        var second = await ServiceFor(db).CreateAsync(other.Id, "Second place");

        var result = await ServiceFor(db).JoinAsync(other.Id, first.InviteCode);

        Assert.Equal(JoinHouseholdStatus.AlreadyInHousehold, result.Status);
        Assert.Equal(
            second.Household!.Id,
            (await db.Users.SingleAsync(u => u.Id == other.Id)).HouseholdId);
    }

    [Fact]
    public async Task JoinAsync_rejects_an_unknown_invite_code()
    {
        using var db = TestDbContextFactory.Create();
        await SeedHouseholdAsync(db);
        var partner = await AddUserAsync(db, "partner@example.com");

        var result = await ServiceFor(db).JoinAsync(partner.Id, "ZZZZZZ");

        Assert.Equal(JoinHouseholdStatus.InviteCodeNotFound, result.Status);
        Assert.Null((await db.Users.SingleAsync(u => u.Id == partner.Id)).HouseholdId);
    }

    [Theory]
    [InlineData("lower")]
    [InlineData("padded")]
    [InlineData("both")]
    public async Task JoinAsync_accepts_a_code_that_needs_normalising(string variant)
    {
        using var db = TestDbContextFactory.Create();
        var (household, _) = await SeedHouseholdAsync(db);
        var partner = await AddUserAsync(db, "partner@example.com");

        var code = variant switch
        {
            "lower" => household.InviteCode.ToLowerInvariant(),
            "padded" => $"  {household.InviteCode}  ",
            _ => $"  {household.InviteCode.ToLowerInvariant()}  "
        };

        var result = await ServiceFor(db).JoinAsync(partner.Id, code);

        Assert.Equal(JoinHouseholdStatus.Joined, result.Status);
    }

    [Fact]
    public async Task JoinAsync_does_not_copy_the_default_catalog_a_second_time()
    {
        // Easy to get wrong by reusing the create path; the symptom would be a store showing
        // every reward twice rather than an error.
        using var db = TestDbContextFactory.Create();
        var (household, _) = await SeedHouseholdAsync(db);
        var partner = await AddUserAsync(db, "partner@example.com");

        await ServiceFor(db).JoinAsync(partner.Id, household.InviteCode);

        Assert.Equal(
            DefaultActivities.All.Count,
            await db.Activities.CountAsync(a => a.HouseholdId == household.Id));
        Assert.Equal(
            DefaultRewards.All.Count,
            await db.Rewards.CountAsync(r => r.HouseholdId == household.Id));
    }

    [Fact]
    public async Task JoinAsync_returns_UserNotFound_for_an_unknown_user()
    {
        using var db = TestDbContextFactory.Create();
        var (household, _) = await SeedHouseholdAsync(db);

        var result = await ServiceFor(db).JoinAsync(userId: 999, household.InviteCode);

        Assert.Equal(JoinHouseholdStatus.UserNotFound, result.Status);
    }
}
