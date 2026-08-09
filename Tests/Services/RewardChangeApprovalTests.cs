using API.Data;
using API.Data.Defaults;
using API.Dtos.Rewards;
using API.Entities;
using API.Services;
using Microsoft.EntityFrameworkCore;

namespace Dwelloot.Tests.Services;

/// <summary>
/// Task [68] — store changes need the partner's agreement.
///
/// The hole being closed: either partner could re-price any reward at any moment, so
/// "make it cheap → redeem it → put the price back" was free money. Owner's report, 2026-08-07.
///
/// Every test that asserts a change was *queued* also asserts the store is **unchanged**. Those are
/// different claims, and only the second one is the fix — a gate that recorded a request and applied
/// the change anyway would pass any test that only counted requests.
/// </summary>
public class RewardChangeApprovalTests
{
    private static async Task<User> AddUserAsync(AppDbContext db, string email)
    {
        var user = new User { Name = email.Split('@')[0], Email = email, UserName = email };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        return user;
    }

    private static HouseholdService Households(AppDbContext db) =>
        new(db, new DefaultCatalogCopier(db), new InviteCodeGenerator());

    /// <summary>One member — changes apply immediately.</summary>
    private static async Task<(User Alex, Household Household)> SoloAsync(AppDbContext db)
    {
        var alex = await AddUserAsync(db, "alex@example.com");
        var created = await Households(db).CreateAsync(alex.Id, "Our place");
        return (alex, created.Household!);
    }

    /// <summary>Two members — every change needs approval.</summary>
    private static async Task<(User Alex, User Sam, Household Household)> PairedAsync(AppDbContext db)
    {
        var (alex, household) = await SoloAsync(db);
        var sam = await AddUserAsync(db, "sam@example.com");
        await Households(db).JoinAsync(sam.Id, household.InviteCode);
        return (alex, sam, household);
    }

    private static async Task<Reward> AnyRewardAsync(AppDbContext db, int householdId) =>
        await db.Rewards.FirstAsync(r => r.HouseholdId == householdId && !r.PausesCompetition);

    // ── The gate ────────────────────────────────────────────────────────────

    /// <summary>
    /// A household of one has nobody to ask. Freezing the store before pairing would make the app
    /// unusable for its first user.
    /// </summary>
    [Fact]
    public async Task A_solo_household_applies_changes_immediately()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, household) = await SoloAsync(db);
        var before = await db.Rewards.CountAsync(r => r.HouseholdId == household.Id);

        var result = await new RewardService(db).CreateAsync(
            alex.Id, new CreateRewardRequest("Breakfast in bed", 30));

        Assert.Equal(RewardMutationOutcome.Applied, result.Outcome);
        Assert.NotNull(result.Reward);
        Assert.Equal(before + 1, await db.Rewards.CountAsync(r => r.HouseholdId == household.Id));
        Assert.Empty(await db.RewardChangeRequests.ToListAsync());
    }

    [Fact]
    public async Task A_paired_household_queues_a_create_and_adds_nothing_to_the_store()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, _, household) = await PairedAsync(db);
        var before = await db.Rewards.CountAsync(r => r.HouseholdId == household.Id);

        var result = await new RewardService(db).CreateAsync(
            alex.Id, new CreateRewardRequest("Breakfast in bed", 30));

        Assert.Equal(RewardMutationOutcome.AwaitingApproval, result.Outcome);
        Assert.NotNull(result.ChangeRequestId);
        Assert.Equal(before, await db.Rewards.CountAsync(r => r.HouseholdId == household.Id));
        Assert.DoesNotContain(await db.Rewards.ToListAsync(), r => r.Title == "Breakfast in bed");
    }

    /// <summary>The attack in one test: the price must not move until the partner agrees.</summary>
    [Fact]
    public async Task A_paired_household_queues_a_reprice_and_the_price_does_not_move()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, _, household) = await PairedAsync(db);
        var reward = await AnyRewardAsync(db, household.Id);
        var originalCost = reward.CoinCost;

        var result = await new RewardService(db).UpdateAsync(
            alex.Id, reward.Id, new PatchRewardRequest(null, 1));

        Assert.Equal(RewardMutationOutcome.AwaitingApproval, result.Outcome);
        Assert.Equal(originalCost, (await db.Rewards.SingleAsync(r => r.Id == reward.Id)).CoinCost);
    }

    [Fact]
    public async Task A_paired_household_queues_a_delete_and_the_reward_stays_in_the_store()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, _, household) = await PairedAsync(db);
        var reward = await AnyRewardAsync(db, household.Id);

        var result = await new RewardService(db).DeleteAsync(alex.Id, reward.Id);

        Assert.Equal(RewardMutationOutcome.AwaitingApproval, result.Outcome);
        Assert.Null((await db.Rewards.SingleAsync(r => r.Id == reward.Id)).ArchivedAt);
    }

    /// <summary>
    /// Validation runs before queueing. A proposal the server would refuse anyway must not reach the
    /// partner, because approving it would then fail at the far end where nobody can fix it.
    /// </summary>
    [Fact]
    public async Task An_invalid_proposal_is_refused_rather_than_queued()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, _, _) = await PairedAsync(db);

        var blank = await new RewardService(db).CreateAsync(alex.Id, new CreateRewardRequest("   ", 30));
        var free = await new RewardService(db).CreateAsync(alex.Id, new CreateRewardRequest("Free", 0));

        Assert.Equal(RewardMutationStatus.InvalidTitle, blank.Status);
        Assert.Equal(RewardMutationStatus.InvalidCoinCost, free.Status);
        Assert.Empty(await db.RewardChangeRequests.ToListAsync());
    }

    /// <summary>
    /// Two pending changes to one reward would make "approve" mean "approve which one", and the
    /// queue has no way to ask. Enforced by a filtered unique index, so two concurrent taps cannot
    /// both win.
    /// </summary>
    [Fact]
    public async Task A_second_change_to_the_same_reward_is_refused()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, _, household) = await PairedAsync(db);
        var reward = await AnyRewardAsync(db, household.Id);
        var service = new RewardService(db);

        var first = await service.UpdateAsync(alex.Id, reward.Id, new PatchRewardRequest(null, 10));
        var second = await service.UpdateAsync(alex.Id, reward.Id, new PatchRewardRequest(null, 20));

        Assert.Equal(RewardMutationOutcome.AwaitingApproval, first.Outcome);
        Assert.Equal(RewardMutationStatus.ChangeAlreadyPending, second.Status);
        Assert.Equal(1, await db.RewardChangeRequests.CountAsync(r => r.RewardId == reward.Id));
    }

    /// <summary>A different reward is unaffected — the index is per reward, not per household.</summary>
    [Fact]
    public async Task A_change_to_a_different_reward_is_still_allowed()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, _, household) = await PairedAsync(db);
        var rewards = await db.Rewards
            .Where(r => r.HouseholdId == household.Id && !r.PausesCompetition)
            .Take(2).ToListAsync();
        var service = new RewardService(db);

        await service.UpdateAsync(alex.Id, rewards[0].Id, new PatchRewardRequest(null, 10));
        var other = await service.UpdateAsync(alex.Id, rewards[1].Id, new PatchRewardRequest(null, 20));

        Assert.Equal(RewardMutationOutcome.AwaitingApproval, other.Outcome);
        Assert.Equal(2, await db.RewardChangeRequests.CountAsync());
    }

    // ── The queue ───────────────────────────────────────────────────────────

    /// <summary>Layer one of no-self-approval: your own proposals are not in the queue you see.</summary>
    [Fact]
    public async Task The_queue_shows_the_partners_proposals_and_never_your_own()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedAsync(db);
        var reward = await AnyRewardAsync(db, household.Id);
        await new RewardService(db).UpdateAsync(alex.Id, reward.Id, new PatchRewardRequest(null, 7));

        var samSees = await new RewardChangeService(db).ListPendingAsync(sam.Id);
        var alexSees = await new RewardChangeService(db).ListPendingAsync(alex.Id);

        Assert.Single(samSees.Items!);
        Assert.Empty(alexSees.Items!);
    }

    /// <summary>The decision is "from what, to what", so both halves have to be on the row.</summary>
    [Fact]
    public async Task The_queue_carries_the_current_values_as_well_as_the_proposed_ones()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedAsync(db);
        var reward = await AnyRewardAsync(db, household.Id);
        var originalCost = reward.CoinCost;
        await new RewardService(db).UpdateAsync(alex.Id, reward.Id, new PatchRewardRequest(null, 7));

        var item = (await new RewardChangeService(db).ListPendingAsync(sam.Id)).Items!.Single();

        Assert.Equal("Update", item.Kind);
        Assert.Equal(reward.Title, item.CurrentTitle);
        Assert.Equal(originalCost, item.CurrentCoinCost);
        Assert.Equal(7, item.ProposedCoinCost);
        Assert.Equal(alex.Name, item.RequestedByName);
    }

    [Fact]
    public async Task Approving_a_reprice_applies_it()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedAsync(db);
        var reward = await AnyRewardAsync(db, household.Id);
        var queued = await new RewardService(db).UpdateAsync(
            alex.Id, reward.Id, new PatchRewardRequest(null, 7));

        var result = await new RewardChangeService(db).ApproveAsync(sam.Id, queued.ChangeRequestId!.Value);

        Assert.Equal(RewardChangeStatusCode.Ok, result.Status);
        Assert.Equal(7, (await db.Rewards.SingleAsync(r => r.Id == reward.Id)).CoinCost);
    }

    [Fact]
    public async Task Approving_a_create_adds_the_reward()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedAsync(db);
        var queued = await new RewardService(db).CreateAsync(
            alex.Id, new CreateRewardRequest("Breakfast in bed", 30));

        await new RewardChangeService(db).ApproveAsync(sam.Id, queued.ChangeRequestId!.Value);

        var added = await db.Rewards.SingleAsync(
            r => r.HouseholdId == household.Id && r.Title == "Breakfast in bed");
        Assert.Equal(30, added.CoinCost);
        // A reward created through the queue can never be a pausing one — task [69].
        Assert.False(added.PausesCompetition);
    }

    [Fact]
    public async Task Approving_a_delete_archives_the_reward()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedAsync(db);
        var reward = await AnyRewardAsync(db, household.Id);
        var queued = await new RewardService(db).DeleteAsync(alex.Id, reward.Id);

        await new RewardChangeService(db).ApproveAsync(sam.Id, queued.ChangeRequestId!.Value);

        Assert.NotNull((await db.Rewards.SingleAsync(r => r.Id == reward.Id)).ArchivedAt);
    }

    /// <summary>
    /// The whole reason the proposed values are snapshot columns: approving applies what the partner
    /// was shown, not whatever the reward happens to say by then.
    /// </summary>
    [Fact]
    public async Task Approving_applies_the_snapshot_not_the_rewards_current_values()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedAsync(db);
        var reward = await AnyRewardAsync(db, household.Id);
        var queued = await new RewardService(db).UpdateAsync(
            alex.Id, reward.Id, new PatchRewardRequest(null, 7));

        // Something changes the reward behind the queue's back.
        reward.CoinCost = 999;
        await db.SaveChangesAsync();

        await new RewardChangeService(db).ApproveAsync(sam.Id, queued.ChangeRequestId!.Value);

        Assert.Equal(7, (await db.Rewards.SingleAsync(r => r.Id == reward.Id)).CoinCost);
    }

    [Fact]
    public async Task Rejecting_leaves_the_store_alone_and_keeps_the_reason()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedAsync(db);
        var reward = await AnyRewardAsync(db, household.Id);
        var originalCost = reward.CoinCost;
        var queued = await new RewardService(db).UpdateAsync(
            alex.Id, reward.Id, new PatchRewardRequest(null, 1));

        var result = await new RewardChangeService(db).RejectAsync(
            sam.Id, queued.ChangeRequestId!.Value, "  That is far too cheap.  ");

        Assert.Equal(RewardChangeStatusCode.Ok, result.Status);
        Assert.Equal(originalCost, (await db.Rewards.SingleAsync(r => r.Id == reward.Id)).CoinCost);

        var stored = await db.RewardChangeRequests.SingleAsync();
        Assert.Equal(RewardChangeStatus.Rejected, stored.Status);
        // Normalised, like every other stored text field (task [32]).
        Assert.Equal("That is far too cheap.", stored.RejectReason);
    }

    [Fact]
    public async Task A_blank_rejection_reason_is_refused_and_changes_nothing()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedAsync(db);
        var reward = await AnyRewardAsync(db, household.Id);
        var queued = await new RewardService(db).UpdateAsync(
            alex.Id, reward.Id, new PatchRewardRequest(null, 1));

        var result = await new RewardChangeService(db).RejectAsync(
            sam.Id, queued.ChangeRequestId!.Value, "   ");

        Assert.Equal(RewardChangeStatusCode.InvalidReason, result.Status);
        Assert.Equal(
            RewardChangeStatus.Pending,
            (await db.RewardChangeRequests.SingleAsync()).Status);
    }

    // ── No self-approval, all three layers ──────────────────────────────────

    /// <summary>
    /// Layer two. The queue already excludes these, so reaching the service means a hand-made
    /// request — which is exactly the case a UI-level filter cannot defend against.
    /// </summary>
    [Fact]
    public async Task You_cannot_approve_your_own_proposal()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, _, household) = await PairedAsync(db);
        var reward = await AnyRewardAsync(db, household.Id);
        var queued = await new RewardService(db).UpdateAsync(
            alex.Id, reward.Id, new PatchRewardRequest(null, 1));
        var originalCost = reward.CoinCost;

        var result = await new RewardChangeService(db).ApproveAsync(
            alex.Id, queued.ChangeRequestId!.Value);

        Assert.Equal(RewardChangeStatusCode.SelfApproval, result.Status);
        Assert.Equal(originalCost, (await db.Rewards.SingleAsync(r => r.Id == reward.Id)).CoinCost);
    }

    [Fact]
    public async Task You_cannot_reject_your_own_proposal_either()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, _, household) = await PairedAsync(db);
        var reward = await AnyRewardAsync(db, household.Id);
        var queued = await new RewardService(db).UpdateAsync(
            alex.Id, reward.Id, new PatchRewardRequest(null, 1));

        var result = await new RewardChangeService(db).RejectAsync(
            alex.Id, queued.ChangeRequestId!.Value, "Changed my mind");

        Assert.Equal(RewardChangeStatusCode.SelfApproval, result.Status);
    }

    /// <summary>Deciding twice is not idempotent — a second approval would apply the change again.</summary>
    [Fact]
    public async Task A_decided_request_cannot_be_decided_again()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedAsync(db);
        var reward = await AnyRewardAsync(db, household.Id);
        var queued = await new RewardService(db).UpdateAsync(
            alex.Id, reward.Id, new PatchRewardRequest(null, 7));
        var service = new RewardChangeService(db);

        await service.ApproveAsync(sam.Id, queued.ChangeRequestId!.Value);
        var again = await service.ApproveAsync(sam.Id, queued.ChangeRequestId.Value);

        Assert.Equal(RewardChangeStatusCode.NotPending, again.Status);
    }

    /// <summary>Another household's request is a 404, not a 403 — the rule the rest of the API follows.</summary>
    [Fact]
    public async Task Another_households_request_is_not_found()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, _, household) = await PairedAsync(db);
        var reward = await AnyRewardAsync(db, household.Id);
        var queued = await new RewardService(db).UpdateAsync(
            alex.Id, reward.Id, new PatchRewardRequest(null, 7));

        var stranger = await AddUserAsync(db, "stranger@example.com");
        var theirs = await Households(db).CreateAsync(stranger.Id, "Their place");
        var theirPartner = await AddUserAsync(db, "theirpartner@example.com");
        await Households(db).JoinAsync(theirPartner.Id, theirs.Household!.InviteCode);

        var result = await new RewardChangeService(db).ApproveAsync(
            stranger.Id, queued.ChangeRequestId!.Value);

        Assert.Equal(RewardChangeStatusCode.NotFound, result.Status);
    }

    /// <summary>
    /// The target can vanish between proposing and deciding — the other partner may have had a
    /// delete approved meanwhile. Refused rather than silently skipped, because "approved" would
    /// otherwise report success for a change that did nothing.
    /// </summary>
    [Fact]
    public async Task Approving_a_change_to_a_reward_that_has_since_gone_is_refused()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedAsync(db);
        var reward = await AnyRewardAsync(db, household.Id);
        var queued = await new RewardService(db).UpdateAsync(
            alex.Id, reward.Id, new PatchRewardRequest(null, 7));

        reward.ArchivedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        var result = await new RewardChangeService(db).ApproveAsync(
            sam.Id, queued.ChangeRequestId!.Value);

        Assert.Equal(RewardChangeStatusCode.TargetGone, result.Status);
        Assert.Equal(
            RewardChangeStatus.Pending,
            (await db.RewardChangeRequests.SingleAsync()).Status);
    }

    /// <summary>
    /// Both decisions describe the request the same way.
    ///
    /// Found by reading a live response, not by a test: approve returned `currentTitle` populated
    /// and reject returned it null, because approve incidentally loads the reward in order to apply
    /// the change and reject does not. One endpoint's answer depending on another's code path is
    /// the kind of inconsistency a client works around silently.
    /// </summary>
    [Fact]
    public async Task Approving_and_rejecting_describe_the_request_identically()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedAsync(db);
        var rewards = await db.Rewards
            .Where(r => r.HouseholdId == household.Id && !r.PausesCompetition)
            .Take(2).ToListAsync();

        var toApprove = await new RewardService(db).UpdateAsync(
            alex.Id, rewards[0].Id, new PatchRewardRequest(null, 7));
        var toReject = await new RewardService(db).UpdateAsync(
            alex.Id, rewards[1].Id, new PatchRewardRequest(null, 9));

        var service = new RewardChangeService(db);
        var approved = await service.ApproveAsync(sam.Id, toApprove.ChangeRequestId!.Value);
        var rejected = await service.RejectAsync(sam.Id, toReject.ChangeRequestId!.Value, "No thanks");

        Assert.NotNull(approved.Request!.CurrentTitle);
        Assert.NotNull(rejected.Request!.CurrentTitle);
        Assert.NotNull(rejected.Request.CurrentCoinCost);
        Assert.Equal(rewards[1].Title, rejected.Request.CurrentTitle);
    }
}
