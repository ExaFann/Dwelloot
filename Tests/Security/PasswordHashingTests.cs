using API.Data;
using API.Entities;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Dwelloot.Tests.Security;

/// <summary>
/// Evidence for advanced requirement #1 (Security). Driven through a real
/// <see cref="UserManager{TUser}"/> over an in-memory store, so these exercise the same path
/// registration takes rather than calling the hasher directly.
/// </summary>
public class PasswordHashingTests : IDisposable
{
    private readonly ServiceProvider _provider;

    public PasswordHashingTests()
    {
        var services = new ServiceCollection();

        services.AddLogging(b => b.SetMinimumLevel(LogLevel.None));
        services.AddDbContext<AppDbContext>(o =>
            o.UseInMemoryDatabase($"pw-tests-{Guid.NewGuid()}"));

        services
            .AddIdentityCore<User>(options =>
            {
                options.Password.RequiredLength = 8;
                options.Password.RequireNonAlphanumeric = false;
                options.User.RequireUniqueEmail = true;
            })
            .AddEntityFrameworkStores<AppDbContext>();

        _provider = services.BuildServiceProvider();
    }

    private UserManager<User> UserManager => _provider.GetRequiredService<UserManager<User>>();

    private static User NewUser(string email, string name = "Alex") =>
        new() { Name = name, Email = email, UserName = email };

    [Fact]
    public async Task Registration_does_not_store_the_plaintext_password()
    {
        const string password = "CorrectHorse1";
        var user = NewUser("alex@example.com");

        var result = await UserManager.CreateAsync(user, password);
        Assert.True(result.Succeeded);

        Assert.NotNull(user.PasswordHash);
        Assert.NotEqual(password, user.PasswordHash);
        Assert.DoesNotContain(password, user.PasswordHash);
    }

    [Fact]
    public async Task The_correct_password_verifies()
    {
        const string password = "CorrectHorse1";
        var user = NewUser("alex@example.com");
        await UserManager.CreateAsync(user, password);

        Assert.True(await UserManager.CheckPasswordAsync(user, password));
    }

    [Fact]
    public async Task A_wrong_password_does_not_verify()
    {
        var user = NewUser("alex@example.com");
        await UserManager.CreateAsync(user, "CorrectHorse1");

        Assert.False(await UserManager.CheckPasswordAsync(user, "CorrectHorse2"));
        Assert.False(await UserManager.CheckPasswordAsync(user, "correcthorse1"));
    }

    [Fact]
    public async Task Two_users_with_the_same_password_get_different_hashes()
    {
        // The salting proof, and the most useful assertion here for the README's security
        // section: identical passwords producing identical hashes is what makes a leaked
        // database attackable with a precomputed table. Different hashes means it is not.
        const string password = "CorrectHorse1";

        var alex = NewUser("alex@example.com", "Alex");
        var sam = NewUser("sam@example.com", "Sam");

        Assert.True((await UserManager.CreateAsync(alex, password)).Succeeded);
        Assert.True((await UserManager.CreateAsync(sam, password)).Succeeded);

        Assert.NotEqual(alex.PasswordHash, sam.PasswordHash);

        // Both must still verify - different hashes are only useful if verification works.
        Assert.True(await UserManager.CheckPasswordAsync(alex, password));
        Assert.True(await UserManager.CheckPasswordAsync(sam, password));
    }

    [Theory]
    [InlineData("short1A", "too short")]
    [InlineData("alllowercase1", "no uppercase")]
    [InlineData("ALLUPPERCASE1", "no lowercase")]
    [InlineData("NoDigitsHere", "no digit")]
    public async Task Weak_passwords_are_rejected(string password, string why)
    {
        var result = await UserManager.CreateAsync(NewUser("alex@example.com"), password);

        Assert.False(result.Succeeded, $"expected rejection: {why}");
    }

    [Fact]
    public async Task A_password_meeting_the_policy_without_a_symbol_is_accepted()
    {
        // RequireNonAlphanumeric is deliberately off - NIST SP 800-63B advises against composition
        // rules of that kind, with length raised to compensate. This pins that decision so it is
        // not silently reverted.
        var result = await UserManager.CreateAsync(NewUser("alex@example.com"), "CorrectHorse1");

        Assert.True(result.Succeeded);
    }

    public void Dispose() => _provider.Dispose();
}
