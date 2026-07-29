using API.Data;
using API.Data.Defaults;
using API.Entities;
using API.Services;
using Microsoft.EntityFrameworkCore;

namespace Dwelloot.Tests.Services;

public class HouseholdServiceTests
{
    /// <summary>Returns the queued codes in order, then falls back to a real generator.</summary>
    private sealed class StubInviteCodeGenerator(params string[] codes) : IInviteCodeGenerator
    {
        private readonly Queue<string> _queued = new(codes);
        private readonly InviteCodeGenerator _fallback = new();

        public int Calls { get; private set; }

        public string Generate()
        {
            Calls++;
            return _queued.Count > 0 ? _queued.Dequeue() : _fallback.Generate();
        }
    }

    private static HouseholdService ServiceFor(AppDbContext db, IInviteCodeGenerator? generator = null) =>
        new(db, new DefaultCatalogCopier(db), generator ?? new InviteCodeGenerator());

    private static async Task<User> AddUserAsync(AppDbContext db, string email = "alex@example.com")
    {
        var user = new User { Name = "Alex", Email = email, UserName = email };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        return user;
    }

    [Fact]
    public async Task CreateAsync_creates_the_household_with_the_given_name_and_not_full()
    {
        using var db = TestDbContextFactory.Create();
        var user = await AddUserAsync(db);

        var result = await ServiceFor(db).CreateAsync(user.Id, "Our place");

        Assert.Equal(CreateHouseholdStatus.Created, result.Status);
        Assert.NotNull(result.Household);
        Assert.Equal("Our place", result.Household!.Name);
        Assert.False(result.Household.IsFull);
        Assert.Equal(Household.InviteCodeLength, result.Household.InviteCode.Length);
    }

    [Fact]
    public async Task CreateAsync_assigns_the_creator_to_the_new_household()
    {
        using var db = TestDbContextFactory.Create();
        var user = await AddUserAsync(db);

        var result = await ServiceFor(db).CreateAsync(user.Id, "Our place");

        var saved = await db.Users.SingleAsync(u => u.Id == user.Id);
        Assert.Equal(result.Household!.Id, saved.HouseholdId);
    }

    [Fact]
    public async Task CreateAsync_copies_every_default_activity_and_reward_into_the_household()
    {
        using var db = TestDbContextFactory.Create();
        var user = await AddUserAsync(db);

        var result = await ServiceFor(db).CreateAsync(user.Id, "Our place");
        var householdId = result.Household!.Id;

        // Counts from the source lists, so this asserts "all of them" rather than "twelve".
        Assert.Equal(
            DefaultActivities.All.Count,
            await db.Activities.CountAsync(a => a.HouseholdId == householdId));
        Assert.Equal(
            DefaultRewards.All.Count,
            await db.Rewards.CountAsync(r => r.HouseholdId == householdId));
    }

    [Fact]
    public async Task CreateAsync_rejects_a_user_who_already_has_a_household_and_writes_nothing()
    {
        using var db = TestDbContextFactory.Create();
        var user = await AddUserAsync(db);
        await ServiceFor(db).CreateAsync(user.Id, "First place");

        var householdsBefore = await db.Households.CountAsync();
        var activitiesBefore = await db.Activities.CountAsync();
        var rewardsBefore = await db.Rewards.CountAsync();

        var second = await ServiceFor(db).CreateAsync(user.Id, "Second place");

        Assert.Equal(CreateHouseholdStatus.AlreadyInHousehold, second.Status);
        Assert.Null(second.Household);

        // Asserting the absence matters more than the status code: a partial write - a household
        // row with no catalog, or catalog rows with no household - is the failure that would
        // actually hurt.
        Assert.Equal(householdsBefore, await db.Households.CountAsync());
        Assert.Equal(activitiesBefore, await db.Activities.CountAsync());
        Assert.Equal(rewardsBefore, await db.Rewards.CountAsync());
        Assert.False(await db.Households.AnyAsync(h => h.Name == "Second place"));
    }

    [Fact]
    public async Task CreateAsync_returns_UserNotFound_for_an_unknown_user()
    {
        using var db = TestDbContextFactory.Create();

        var result = await ServiceFor(db).CreateAsync(userId: 999, "Our place");

        Assert.Equal(CreateHouseholdStatus.UserNotFound, result.Status);
        Assert.Empty(await db.Households.ToListAsync());
    }

    [Fact]
    public async Task CreateAsync_gives_two_households_different_invite_codes()
    {
        using var db = TestDbContextFactory.Create();
        var alex = await AddUserAsync(db, "alex@example.com");
        var sam = await AddUserAsync(db, "sam@example.com");

        var first = await ServiceFor(db).CreateAsync(alex.Id, "First place");
        var second = await ServiceFor(db).CreateAsync(sam.Id, "Second place");

        Assert.NotEqual(first.Household!.InviteCode, second.Household!.InviteCode);
    }

    [Fact]
    public async Task CreateAsync_retries_when_the_generated_code_is_already_taken()
    {
        using var db = TestDbContextFactory.Create();
        var alex = await AddUserAsync(db, "alex@example.com");
        var sam = await AddUserAsync(db, "sam@example.com");

        // First household takes "AAAAAA". The second generator hands out "AAAAAA" again before
        // yielding a free code, so the service must notice and retry.
        //
        // Driven through a stub rather than the database on purpose: the in-memory provider does
        // not enforce unique indexes (see log 011), so a real collision would be silently accepted
        // there and the retry would be untestable.
        await ServiceFor(db, new StubInviteCodeGenerator("AAAAAA")).CreateAsync(alex.Id, "First place");

        var stub = new StubInviteCodeGenerator("AAAAAA", "BBBBBB");
        var second = await ServiceFor(db, stub).CreateAsync(sam.Id, "Second place");

        Assert.Equal(CreateHouseholdStatus.Created, second.Status);
        Assert.Equal("BBBBBB", second.Household!.InviteCode);
        Assert.Equal(2, stub.Calls);
    }

    [Fact]
    public async Task CreateAsync_gives_up_when_no_free_code_can_be_found()
    {
        using var db = TestDbContextFactory.Create();
        var alex = await AddUserAsync(db, "alex@example.com");
        var sam = await AddUserAsync(db, "sam@example.com");

        await ServiceFor(db, new StubInviteCodeGenerator("AAAAAA")).CreateAsync(alex.Id, "First place");

        // A generator that only ever returns the taken code must terminate, not spin.
        var stuck = new StubInviteCodeGenerator(Enumerable.Repeat("AAAAAA", 50).ToArray());
        var result = await ServiceFor(db, stuck).CreateAsync(sam.Id, "Second place");

        Assert.Equal(CreateHouseholdStatus.CouldNotGenerateInviteCode, result.Status);
        Assert.Equal(10, stuck.Calls);
        Assert.False(await db.Households.AnyAsync(h => h.Name == "Second place"));
    }
}
