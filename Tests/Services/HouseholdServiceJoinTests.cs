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

    /// <summary>
    /// The behaviour this replaces was the bug, not the rule.
    ///
    /// Two people who each created a household had no way to pair afterwards: this returned
    /// <see cref="JoinHouseholdStatus.AlreadyInHousehold"/> for every caller who had one, and the
    /// pairing screen is only reachable before you have joined anything. Owner's report, 2026-08-07.
    /// </summary>
    [Fact]
    public async Task JoinAsync_lets_a_solo_user_leave_their_own_household_to_accept_an_invitation()
    {
        using var db = TestDbContextFactory.Create();
        var (first, _) = await SeedHouseholdAsync(db);

        var other = await AddUserAsync(db, "other@example.com");
        var second = await ServiceFor(db).CreateAsync(other.Id, "Second place");
        var abandonedId = second.Household!.Id;

        var result = await ServiceFor(db).JoinAsync(other.Id, first.InviteCode);

        Assert.Equal(JoinHouseholdStatus.Joined, result.Status);
        Assert.Equal(first.Id, (await db.Users.SingleAsync(u => u.Id == other.Id)).HouseholdId);
        // The emptied household goes, exactly as it would if they had used `POST /leave`.
        Assert.Null(await db.Households.SingleOrDefaultAsync(h => h.Id == abandonedId));
    }

    /// <summary>
    /// A household of **two** is not the caller's alone to abandon. Leaving evicts them from a
    /// household someone else also lives in, which is `POST /leave`'s job and should be a decision
    /// the user makes explicitly rather than a side effect of typing a code.
    /// </summary>
    [Fact]
    public async Task JoinAsync_still_rejects_a_user_who_is_already_paired()
    {
        using var db = TestDbContextFactory.Create();
        var (target, _) = await SeedHouseholdAsync(db);

        // A second, fully paired household.
        var other = await AddUserAsync(db, "other@example.com");
        var second = await ServiceFor(db).CreateAsync(other.Id, "Second place");
        var theirPartner = await AddUserAsync(db, "theirpartner@example.com");
        await ServiceFor(db).JoinAsync(theirPartner.Id, second.Household!.InviteCode);

        var result = await ServiceFor(db).JoinAsync(other.Id, target.InviteCode);

        Assert.Equal(JoinHouseholdStatus.AlreadyInHousehold, result.Status);
        // Nothing moved, and the household they were in is untouched.
        Assert.Equal(
            second.Household.Id,
            (await db.Users.SingleAsync(u => u.Id == other.Id)).HouseholdId);
        Assert.NotNull(await db.Households.SingleOrDefaultAsync(h => h.Id == second.Household.Id));
    }

    /// <summary>
    /// A bad code must cost nothing. This is the whole reason the move lives in the service rather
    /// than being a leave-then-join from the client: two calls would delete the caller's household
    /// and *then* discover the typo, leaving them with nothing and no way back.
    /// </summary>
    [Fact]
    public async Task JoinAsync_leaves_a_solo_household_intact_when_the_code_is_wrong()
    {
        using var db = TestDbContextFactory.Create();
        var other = await AddUserAsync(db, "other@example.com");
        var mine = await ServiceFor(db).CreateAsync(other.Id, "My place");
        var choresBefore = await db.Activities.CountAsync(a => a.HouseholdId == mine.Household!.Id);

        var result = await ServiceFor(db).JoinAsync(other.Id, "ZZZ999");

        Assert.Equal(JoinHouseholdStatus.InviteCodeNotFound, result.Status);
        Assert.Equal(mine.Household!.Id, (await db.Users.SingleAsync(u => u.Id == other.Id)).HouseholdId);
        Assert.NotNull(await db.Households.SingleOrDefaultAsync(h => h.Id == mine.Household.Id));
        // The copied catalogue survives too — it cascades with the household, so its survival is
        // the observable proof that nothing was deleted.
        Assert.True(choresBefore > 0);
        Assert.Equal(
            choresBefore,
            await db.Activities.CountAsync(a => a.HouseholdId == mine.Household.Id));
    }

    /// <summary>The target being full must also cost the caller nothing.</summary>
    [Fact]
    public async Task JoinAsync_leaves_a_solo_household_intact_when_the_target_is_full()
    {
        using var db = TestDbContextFactory.Create();
        var (target, _) = await SeedHouseholdAsync(db);
        var filler = await AddUserAsync(db, "filler@example.com");
        await ServiceFor(db).JoinAsync(filler.Id, target.InviteCode);

        var other = await AddUserAsync(db, "other@example.com");
        var mine = await ServiceFor(db).CreateAsync(other.Id, "My place");

        var result = await ServiceFor(db).JoinAsync(other.Id, target.InviteCode);

        Assert.Equal(JoinHouseholdStatus.HouseholdFull, result.Status);
        Assert.Equal(mine.Household!.Id, (await db.Users.SingleAsync(u => u.Id == other.Id)).HouseholdId);
        Assert.NotNull(await db.Households.SingleOrDefaultAsync(h => h.Id == mine.Household.Id));
    }

    /// <summary>
    /// Typing your own code into your own screen. Previously unreachable — the blanket guard caught
    /// it — and now it has to be handled, because the move path would otherwise delete the
    /// household out from under the user and then try to join them to it.
    /// </summary>
    [Fact]
    public async Task JoinAsync_is_a_no_op_when_the_code_is_your_own()
    {
        using var db = TestDbContextFactory.Create();
        var other = await AddUserAsync(db, "other@example.com");
        var mine = await ServiceFor(db).CreateAsync(other.Id, "My place");

        var result = await ServiceFor(db).JoinAsync(other.Id, mine.Household!.InviteCode);

        Assert.Equal(JoinHouseholdStatus.Joined, result.Status);
        Assert.Equal(mine.Household.Id, (await db.Users.SingleAsync(u => u.Id == other.Id)).HouseholdId);
        Assert.NotNull(await db.Households.SingleOrDefaultAsync(h => h.Id == mine.Household.Id));
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
