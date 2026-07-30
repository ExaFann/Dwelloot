using System.ComponentModel.DataAnnotations;
using API.Data;
using API.Dtos.ActivityLogs;
using API.Dtos.Activities;
using API.Dtos.Auth;
using API.Dtos.Households;
using API.Dtos.Redemptions;
using API.Dtos.Rewards;
using API.Entities;
using API.Services;
using API.Services.Progression;
using Microsoft.EntityFrameworkCore;

namespace Dwelloot.Tests.Validation;

public class InputValidationTests
{
    private static async Task<User> AddUserAsync(AppDbContext db, string email)
    {
        var user = new User { Name = email.Split('@')[0], Email = email, UserName = email };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        return user;
    }

    private static HouseholdService HouseholdsFor(AppDbContext db) =>
        new(db, new DefaultCatalogCopier(db), new InviteCodeGenerator());

    private static async Task<(User User, Household Household)> StockedHouseholdAsync(AppDbContext db)
    {
        var decoy = await AddUserAsync(db, "decoy@example.com");
        await HouseholdsFor(db).CreateAsync(decoy.Id, "Decoy place");

        var user = await AddUserAsync(db, "alex@example.com");
        var created = await HouseholdsFor(db).CreateAsync(user.Id, "Our place");
        return (user, created.Household!);
    }

    /// <summary>
    /// Names of the request's parameters whose validation attributes reject its current value.
    /// </summary>
    /// <remarks>
    /// Reflects over the <b>constructor parameters</b>, not the properties, because that is where the
    /// attributes live — every request record in this project annotates positional parameters, since a
    /// <c>[property:]</c> target makes MVC throw at request time (log <c>012</c>). MVC validates record
    /// constructor parameters natively; <c>Validator.TryValidateObject</c> does not, and reports a
    /// clean bill of health for a record whose annotations it cannot see. The first version of this
    /// helper used it and reported nothing at all — a check that could not fail.
    /// </remarks>
    private static IReadOnlyList<string> Validate(object request)
    {
        var type = request.GetType();
        var constructor = type.GetConstructors()
            .OrderByDescending(c => c.GetParameters().Length)
            .First();

        var failures = new List<string>();

        foreach (var parameter in constructor.GetParameters())
        {
            var value = type.GetProperty(parameter.Name!)?.GetValue(request);

            if (parameter.GetCustomAttributes(typeof(ValidationAttribute), inherit: true)
                .Cast<ValidationAttribute>()
                .Any(attribute => !attribute.IsValid(value)))
            {
                failures.Add(parameter.Name!);
            }
        }

        return failures;
    }

    // ------------------------------------------------------ the defect this task was written for

    [Fact]
    public async Task PATCH_with_a_whitespace_only_title_is_refused_and_the_chore_is_unchanged()
    {
        // Before task [32] this returned Ok and stored "": the nullable field carries no [Required] -
        // correctly, since null means "leave alone" - and [StringLength(MinimumLength = 1)] counts
        // "   " as three characters. The service then trimmed it to nothing.
        using var db = TestDbContextFactory.Create();
        var (user, household) = await StockedHouseholdAsync(db);
        var chore = await db.Activities.FirstAsync(a => a.HouseholdId == household.Id);
        var original = chore.Title;

        var result = await new ActivityService(db).UpdateAsync(
            user.Id, chore.Id, new PatchActivityRequest("   ", null, null));

        Assert.Equal(ActivityMutationStatus.InvalidTitle, result.Status);
        Assert.Equal(original, (await db.Activities.SingleAsync(a => a.Id == chore.Id)).Title);
    }

    [Fact]
    public async Task PATCH_with_a_whitespace_only_title_is_refused_and_the_reward_is_unchanged()
    {
        using var db = TestDbContextFactory.Create();
        var (user, household) = await StockedHouseholdAsync(db);
        var reward = await db.Rewards.FirstAsync(r => r.HouseholdId == household.Id);
        var original = reward.Title;

        var result = await new RewardService(db).UpdateAsync(
            user.Id, reward.Id, new PatchRewardRequest("\t\n ", null, null));

        Assert.Equal(RewardMutationStatus.InvalidTitle, result.Status);
        Assert.Equal(original, (await db.Rewards.SingleAsync(r => r.Id == reward.Id)).Title);
    }

    [Theory]
    [InlineData("   ")]
    [InlineData("\t\n")]
    [InlineData("\0")]
    [InlineData("​")]
    public async Task Creating_with_a_blank_title_is_refused_and_nothing_is_inserted(string title)
    {
        using var db = TestDbContextFactory.Create();
        var (user, household) = await StockedHouseholdAsync(db);
        var before = await db.Activities.CountAsync(a => a.HouseholdId == household.Id);

        var result = await new ActivityService(db).CreateAsync(user.Id, new CreateActivityRequest(title, 10, null));

        Assert.Equal(ActivityMutationStatus.InvalidTitle, result.Status);
        Assert.Equal(before, await db.Activities.CountAsync(a => a.HouseholdId == household.Id));
    }

    // ------------------------------------------------------ normalisation at the point of storage

    [Fact]
    public async Task A_created_title_is_stored_normalised()
    {
        using var db = TestDbContextFactory.Create();
        var (user, _) = await StockedHouseholdAsync(db);

        var result = await new ActivityService(db).CreateAsync(
            user.Id, new CreateActivityRequest("  Wash\nthe\0  dishes​  ", 10, null));

        Assert.Equal("Wash the dishes", result.Activity!.Title);
        Assert.Equal("Wash the dishes", (await db.Activities.SingleAsync(a => a.Id == result.Activity.Id)).Title);
    }

    [Fact]
    public async Task A_patched_reward_title_is_stored_normalised()
    {
        using var db = TestDbContextFactory.Create();
        var (user, household) = await StockedHouseholdAsync(db);
        var reward = await db.Rewards.FirstAsync(r => r.HouseholdId == household.Id);

        await new RewardService(db).UpdateAsync(
            user.Id, reward.Id, new PatchRewardRequest("  Movie\tnight   pick ", null, null));

        Assert.Equal("Movie night pick", (await db.Rewards.SingleAsync(r => r.Id == reward.Id)).Title);
    }

    [Fact]
    public async Task A_patched_chore_title_is_stored_normalised()
    {
        // The activity half. Written only after mutation testing showed that swapping the activity
        // patch's Normalize back to a plain Trim broke nothing - the reward test above was covering
        // one service and quietly standing in for both.
        using var db = TestDbContextFactory.Create();
        var (user, household) = await StockedHouseholdAsync(db);
        var chore = await db.Activities.FirstAsync(a => a.HouseholdId == household.Id);

        await new ActivityService(db).UpdateAsync(
            user.Id, chore.Id, new PatchActivityRequest("  Wash\tthe   dishes\0 ", null, null));

        Assert.Equal("Wash the dishes", (await db.Activities.SingleAsync(a => a.Id == chore.Id)).Title);
    }

    [Fact]
    public async Task Household_names_are_normalised_on_create_and_on_rename()
    {
        // Household names got no treatment at all before task [32] - not even a trim - while activity
        // and reward titles were trimmed.
        using var db = TestDbContextFactory.Create();
        var user = await AddUserAsync(db, "alex@example.com");
        var households = HouseholdsFor(db);

        var created = await households.CreateAsync(user.Id, "   Our    Place\n");
        Assert.Equal("Our Place", created.Household!.Name);

        var renamed = await households.RenameAsync(user.Id, created.Household.Id, "  The   Nest  ");
        Assert.Equal(HouseholdAccessStatus.Ok, renamed.Status);
        Assert.Equal("The Nest", (await db.Households.SingleAsync(h => h.Id == created.Household.Id)).Name);
    }

    [Fact]
    public async Task A_blank_household_name_is_refused_on_create_and_on_rename()
    {
        using var db = TestDbContextFactory.Create();
        var user = await AddUserAsync(db, "alex@example.com");
        var households = HouseholdsFor(db);

        Assert.Equal(CreateHouseholdStatus.InvalidName, (await households.CreateAsync(user.Id, "  ")).Status);

        var created = await households.CreateAsync(user.Id, "Our place");
        var renamed = await households.RenameAsync(user.Id, created.Household!.Id, "\t\0 ");
        Assert.Equal(HouseholdAccessStatus.InvalidName, renamed.Status);
        Assert.Equal("Our place", (await db.Households.SingleAsync(h => h.Id == created.Household.Id)).Name);
    }

    [Fact]
    public async Task A_reject_reason_is_stored_normalised()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, household) = await StockedHouseholdAsync(db);
        var sam = await AddUserAsync(db, "sam@example.com");
        await HouseholdsFor(db).JoinAsync(sam.Id, household.InviteCode);

        var chore = await db.Activities.FirstAsync(a => a.HouseholdId == household.Id);
        var logs = new ActivityLogService(db, new ProgressionService(db));
        var logId = (await logs.CreateAsync(sam.Id, chore.Id)).Log!.Id;

        await logs.RejectAsync(alex.Id, logId, "  Not\tactually   done\n");

        Assert.Equal("Not actually done", (await db.ActivityLogs.SingleAsync(l => l.Id == logId)).RejectReason);
    }

    // ------------------------------------------------------ the annotations are actually applied

    [Theory]
    [InlineData("   ")]
    [InlineData("\t\n")]
    [InlineData("\0")]
    public void Every_text_carrying_request_rejects_a_blank_value(string blank)
    {
        // Exercised through Validator.TryValidateObject on the real record types rather than by calling
        // CleanTextAttribute directly - that is what catches a field somebody forgot to annotate.
        Assert.Contains("Title", Validate(new CreateActivityRequest(blank, 10, null)));
        Assert.Contains("Title", Validate(new PatchActivityRequest(blank, null, null)));
        Assert.Contains("Title", Validate(new CreateRewardRequest(blank, 10)));
        Assert.Contains("Title", Validate(new PatchRewardRequest(blank, null, null)));
        Assert.Contains("Name", Validate(new CreateHouseholdRequest(blank)));
        Assert.Contains("Name", Validate(new RenameHouseholdRequest(blank)));
        Assert.Contains("Name", Validate(new RegisterRequest(blank, "a@example.com", "Dwelloot2026")));
        Assert.Contains("Reason", Validate(new RejectActivityLogRequest(blank)));
    }

    [Fact]
    public void A_null_patch_field_still_means_leave_it_alone()
    {
        // CleanText must pass on null, or PATCH would lose its whole point.
        Assert.DoesNotContain("Title", Validate(new PatchActivityRequest(null, 5, null)));
        Assert.DoesNotContain("Title", Validate(new PatchRewardRequest(null, 5, null)));
    }

    [Fact]
    public void A_padded_value_within_the_limit_once_normalised_is_accepted()
    {
        var padded = "  " + new string('x', 78) + "  ";
        Assert.DoesNotContain("Title", Validate(new CreateActivityRequest(padded, 10, null)));
        Assert.Contains("Title", Validate(new CreateActivityRequest(new string('x', 81), 10, null)));
    }

    [Fact]
    public void Passwords_are_never_normalised()
    {
        // Silently trimming a password changes the credential - the user's manager stores one string
        // and the server verifies another. Asserted through the normaliser rather than through Identity,
        // since the point is that nothing in this layer touches it.
        const string padded = "  Dwelloot 2026  ";
        Assert.DoesNotContain("Password", Validate(new RegisterRequest("Alex", "a@example.com", padded)));
        Assert.NotEqual(padded, API.Validation.TextInput.Normalize(padded));
    }

    // ------------------------------------------------------ negative and zero values

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(int.MinValue)]
    public void Non_positive_numbers_are_refused_by_the_annotations(int value)
    {
        Assert.Contains("Points", Validate(new CreateActivityRequest("Wash dishes", value, null)));
        Assert.Contains("Points", Validate(new PatchActivityRequest(null, value, null)));
        Assert.Contains("CoinCost", Validate(new CreateRewardRequest("Foot massage", value)));
        Assert.Contains("CoinCost", Validate(new PatchRewardRequest(null, value, null)));
        Assert.Contains("ActivityId", Validate(new CreateActivityLogRequest(value)));
        Assert.Contains("RewardId", Validate(new CreateRedemptionRequest(value)));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    public async Task Non_positive_numbers_are_refused_by_the_services_too(int value)
    {
        // Not redundant with the annotations: the service guard is what makes this a property of the
        // domain rather than of the request pipeline, and it is the layer a direct caller hits.
        using var db = TestDbContextFactory.Create();
        var (user, household) = await StockedHouseholdAsync(db);
        var chore = await db.Activities.FirstAsync(a => a.HouseholdId == household.Id);
        var reward = await db.Rewards.FirstAsync(r => r.HouseholdId == household.Id);
        var originalPoints = chore.Points;

        Assert.Equal(
            ActivityMutationStatus.InvalidPoints,
            (await new ActivityService(db).CreateAsync(user.Id, new CreateActivityRequest("Wash dishes", value, null))).Status);
        Assert.Equal(
            ActivityMutationStatus.InvalidPoints,
            (await new ActivityService(db).UpdateAsync(user.Id, chore.Id, new PatchActivityRequest(null, value, null))).Status);
        Assert.Equal(
            RewardMutationStatus.InvalidCoinCost,
            (await new RewardService(db).CreateAsync(user.Id, new CreateRewardRequest("Foot massage", value))).Status);
        Assert.Equal(
            RewardMutationStatus.InvalidCoinCost,
            (await new RewardService(db).UpdateAsync(user.Id, reward.Id, new PatchRewardRequest(null, value, null))).Status);

        Assert.Equal(originalPoints, (await db.Activities.SingleAsync(a => a.Id == chore.Id)).Points);
    }

    // ------------------------------------------------------ paging clamps rather than errors

    [Theory]
    [InlineData(0)]
    [InlineData(-5)]
    public async Task Out_of_range_paging_clamps_on_every_list_endpoint(int value)
    {
        // Clamped, not rejected - a client asking for page 0 wants the first page. Pinned because a
        // clamp that quietly became a rejection would break the documented ?take=5.
        using var db = TestDbContextFactory.Create();
        var (alex, household) = await StockedHouseholdAsync(db);
        var sam = await AddUserAsync(db, "sam@example.com");
        await HouseholdsFor(db).JoinAsync(sam.Id, household.InviteCode);
        var redemptions = new RedemptionService(db, new ProgressionService(db));

        Assert.Equal(
            ActivityQueryStatus.Ok,
            (await new ActivityService(db).ListAsync(alex.Id, new ActivityQuery { Page = value, PageSize = value })).Status);
        Assert.Equal(
            RewardQueryStatus.Ok,
            (await new RewardService(db).ListAsync(alex.Id, new RewardQuery { Page = value, PageSize = value })).Status);

        var logs = new ActivityLogService(db, new ProgressionService(db));
        Assert.Equal(
            ActivityLogStatusCode.Ok,
            (await logs.ListForApprovalAsync(alex.Id, new ActivityLogQuery { Page = value, PageSize = value })).Status);
        Assert.Equal(
            ActivityLogStatusCode.Ok,
            (await logs.ListMineAsync(alex.Id, new MyActivityLogQuery { Page = value, Take = value })).Status);
        Assert.Equal(
            RedemptionStatus.Ok,
            (await redemptions.ListMineAsync(alex.Id, new MyRedemptionQuery { Page = value, Take = value })).Status);
        Assert.Equal(
            RedemptionStatus.Ok,
            (await redemptions.ListForHouseholdAsync(alex.Id, new HouseholdRedemptionQuery { Page = value, Take = value })).Status);
    }

    [Fact]
    public async Task A_clamped_page_returns_the_first_page_rather_than_nothing()
    {
        using var db = TestDbContextFactory.Create();
        var (user, _) = await StockedHouseholdAsync(db);
        var service = new ActivityService(db);

        var first = await service.ListAsync(user.Id, new ActivityQuery { Sort = "title", Page = 1, PageSize = 3 });
        var clamped = await service.ListAsync(user.Id, new ActivityQuery { Sort = "title", Page = -5, PageSize = -5 });

        Assert.NotEmpty(clamped.Page!.Items);
        Assert.Equal(first.Page!.Items[0].Id, clamped.Page.Items[0].Id);
    }
}
