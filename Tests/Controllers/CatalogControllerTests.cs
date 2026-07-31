using API.Controllers;
using API.Dtos;
using API.Dtos.Activities;
using API.Dtos.Rewards;
using API.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Dwelloot.Tests.Controllers;

/// <summary>Activities and rewards — the same shape of mapping, so the same shape of test.</summary>
public class CatalogControllerTests
{
    // ------------------------------------------------------------------ activities

    private sealed class StubActivityService : IActivityService
    {
        public ActivityQueryStatus ListStatus { get; init; } = ActivityQueryStatus.Ok;
        public ActivityMutationStatus MutationStatus { get; init; } = ActivityMutationStatus.Ok;
        public bool WasCalled { get; private set; }

        private static readonly ActivityResponse Sample = new(3, "Wash dishes", 10);

        public Task<ActivityListResult> ListAsync(int userId, ActivityQuery query, CancellationToken ct = default)
        {
            WasCalled = true;
            return Task.FromResult(ListStatus == ActivityQueryStatus.Ok
                ? ActivityListResult.Ok(new PagedResponse<ActivityResponse>([Sample], 1))
                : ActivityListResult.Failed(ListStatus));
        }

        private Task<ActivityMutationResult> Mutate()
        {
            WasCalled = true;
            return Task.FromResult(MutationStatus == ActivityMutationStatus.Ok
                ? ActivityMutationResult.Ok(Sample)
                : ActivityMutationResult.Failed(MutationStatus));
        }

        public Task<ActivityMutationResult> CreateAsync(int userId, CreateActivityRequest request, CancellationToken ct = default) => Mutate();
        public Task<ActivityMutationResult> UpdateAsync(int userId, int activityId, PatchActivityRequest request, CancellationToken ct = default) => Mutate();
        public Task<ActivityMutationResult> DeleteAsync(int userId, int activityId, CancellationToken ct = default) => Mutate();
    }

    [Theory]
    [InlineData(ActivityQueryStatus.Ok, StatusCodes.Status200OK)]
    [InlineData(ActivityQueryStatus.NoHousehold, StatusCodes.Status409Conflict)]
    [InlineData(ActivityQueryStatus.InvalidSort, StatusCodes.Status400BadRequest)]
    [InlineData(ActivityQueryStatus.UserNotFound, StatusCodes.Status401Unauthorized)]
    public async Task Activity_list_statuses_map_to_their_documented_codes(ActivityQueryStatus status, int expected)
    {
        // Driven as a theory over the whole enum so a new member with no mapping shows up here rather
        // than silently falling through the `_ => Unauthorized()` arm.
        var controller = new ActivitiesController(new StubActivityService { ListStatus = status }).WithUser();

        Assert.Equal(expected, (await controller.List(new ActivityQuery(), default)).StatusOf());
    }

    [Theory]
    [InlineData(ActivityMutationStatus.NoHousehold, StatusCodes.Status409Conflict)]
    [InlineData(ActivityMutationStatus.NotFound, StatusCodes.Status404NotFound)]
    [InlineData(ActivityMutationStatus.InvalidPoints, StatusCodes.Status400BadRequest)]
    [InlineData(ActivityMutationStatus.InvalidTitle, StatusCodes.Status400BadRequest)]
    [InlineData(ActivityMutationStatus.UserNotFound, StatusCodes.Status401Unauthorized)]
    public async Task Activity_mutation_statuses_map_to_their_documented_codes(ActivityMutationStatus status, int expected)
    {
        var service = new StubActivityService { MutationStatus = status };

        Assert.Equal(expected, (await new ActivitiesController(service).WithUser()
            .Create(new CreateActivityRequest("Wash dishes", 10, null), default)).StatusOf());
        Assert.Equal(expected, (await new ActivitiesController(service).WithUser()
            .Update(3, new PatchActivityRequest(null, 5, null), default)).StatusOf());
        Assert.Equal(expected, (await new ActivitiesController(service).WithUser()
            .Delete(3, default)).StatusOf());
    }

    [Fact]
    public async Task Activity_success_codes_are_201_with_a_location_200_and_204()
    {
        var service = new StubActivityService();

        var created = await new ActivitiesController(service).WithUser().Create(new CreateActivityRequest("Wash dishes", 10, null), default);
        var createdResult = Assert.IsType<CreatedResult>(created.Result);
        Assert.Equal(StatusCodes.Status201Created, createdResult.StatusCode);
        Assert.Equal("/api/activities/3", createdResult.Location);

        Assert.Equal(StatusCodes.Status200OK,
            (await new ActivitiesController(service).WithUser().Update(3, new PatchActivityRequest(null, 5, null), default)).StatusOf());
        Assert.Equal(StatusCodes.Status204NoContent,
            (await new ActivitiesController(service).WithUser().Delete(3, default)).StatusOf());
    }

    [Fact]
    public async Task An_activity_request_with_no_user_id_is_401_and_never_reaches_the_service()
    {
        // The stub records whether it was called, so "401 for the right reason" is distinguishable from
        // "401 because the service happened to say UserNotFound".
        var service = new StubActivityService();
        var controller = new ActivitiesController(service).WithUser(userId: null);

        Assert.Equal(StatusCodes.Status401Unauthorized, (await controller.List(new ActivityQuery(), default)).StatusOf());
        Assert.False(service.WasCalled);
    }

    [Fact]
    public async Task The_invalid_sort_message_lists_the_valid_fields()
    {
        var controller = new ActivitiesController(
            new StubActivityService { ListStatus = ActivityQueryStatus.InvalidSort }).WithUser();

        var error = (await controller.List(new ActivityQuery(), default)).ErrorOf();

        foreach (var field in ActivitySortFields.All)
        {
            Assert.Contains(field, error.Error);
        }
    }

    // ------------------------------------------------------------------ rewards

    private sealed class StubRewardService : IRewardService
    {
        public RewardQueryStatus ListStatus { get; init; } = RewardQueryStatus.Ok;
        public RewardMutationStatus MutationStatus { get; init; } = RewardMutationStatus.Ok;
        public bool WasCalled { get; private set; }

        private static readonly RewardResponse Sample = new(5, "Takeout of choice", 30, false);

        public Task<RewardListResult> ListAsync(int userId, RewardQuery query, CancellationToken ct = default)
        {
            WasCalled = true;
            return Task.FromResult(ListStatus == RewardQueryStatus.Ok
                ? RewardListResult.Ok(new PagedResponse<RewardResponse>([Sample], 1))
                : RewardListResult.Failed(ListStatus));
        }

        private Task<RewardMutationResult> Mutate()
        {
            WasCalled = true;
            return Task.FromResult(MutationStatus == RewardMutationStatus.Ok
                ? RewardMutationResult.Ok(Sample)
                : RewardMutationResult.Failed(MutationStatus));
        }

        public Task<RewardMutationResult> CreateAsync(int userId, CreateRewardRequest request, CancellationToken ct = default) => Mutate();
        public Task<RewardMutationResult> UpdateAsync(int userId, int rewardId, PatchRewardRequest request, CancellationToken ct = default) => Mutate();
        public Task<RewardMutationResult> DeleteAsync(int userId, int rewardId, CancellationToken ct = default) => Mutate();
    }

    [Theory]
    [InlineData(RewardQueryStatus.Ok, StatusCodes.Status200OK)]
    [InlineData(RewardQueryStatus.NoHousehold, StatusCodes.Status409Conflict)]
    [InlineData(RewardQueryStatus.InvalidSort, StatusCodes.Status400BadRequest)]
    [InlineData(RewardQueryStatus.UserNotFound, StatusCodes.Status401Unauthorized)]
    public async Task Reward_list_statuses_map_to_their_documented_codes(RewardQueryStatus status, int expected)
    {
        var controller = new RewardsController(new StubRewardService { ListStatus = status }).WithUser();

        Assert.Equal(expected, (await controller.List(new RewardQuery(), default)).StatusOf());
    }

    [Theory]
    [InlineData(RewardMutationStatus.NoHousehold, StatusCodes.Status409Conflict)]
    [InlineData(RewardMutationStatus.NotFound, StatusCodes.Status404NotFound)]
    [InlineData(RewardMutationStatus.InvalidCoinCost, StatusCodes.Status400BadRequest)]
    [InlineData(RewardMutationStatus.InvalidTitle, StatusCodes.Status400BadRequest)]
    [InlineData(RewardMutationStatus.UserNotFound, StatusCodes.Status401Unauthorized)]
    public async Task Reward_mutation_statuses_map_to_their_documented_codes(RewardMutationStatus status, int expected)
    {
        var service = new StubRewardService { MutationStatus = status };

        Assert.Equal(expected, (await new RewardsController(service).WithUser()
            .Create(new CreateRewardRequest("Foot massage", 25), default)).StatusOf());
        Assert.Equal(expected, (await new RewardsController(service).WithUser()
            .Update(5, new PatchRewardRequest(null, 30, null), default)).StatusOf());
        Assert.Equal(expected, (await new RewardsController(service).WithUser()
            .Delete(5, default)).StatusOf());
    }

    [Fact]
    public async Task Reward_success_codes_are_201_with_a_location_200_and_204()
    {
        var service = new StubRewardService();

        var created = await new RewardsController(service).WithUser().Create(new CreateRewardRequest("Foot massage", 25), default);
        var createdResult = Assert.IsType<CreatedResult>(created.Result);
        Assert.Equal("/api/rewards/5", createdResult.Location);

        Assert.Equal(StatusCodes.Status200OK,
            (await new RewardsController(service).WithUser().Update(5, new PatchRewardRequest(null, 30, null), default)).StatusOf());
        Assert.Equal(StatusCodes.Status204NoContent,
            (await new RewardsController(service).WithUser().Delete(5, default)).StatusOf());
    }

    [Fact]
    public async Task A_reward_request_with_no_user_id_is_401_and_never_reaches_the_service()
    {
        var service = new StubRewardService();
        var controller = new RewardsController(service).WithUser(userId: null);

        Assert.Equal(StatusCodes.Status401Unauthorized, (await controller.List(new RewardQuery(), default)).StatusOf());
        Assert.False(service.WasCalled);
    }

    [Fact]
    public async Task Chore_and_reward_not_found_bodies_are_byte_identical_across_their_causes()
    {
        // The anti-enumeration property (SS 3.5): "no such row" and "someone else's row" reach the
        // controller as one status precisely so they cannot be told apart. Asserted per resource type
        // so a future split into two statuses has to confront this test.
        var chore = (await new ActivitiesController(
                new StubActivityService { MutationStatus = ActivityMutationStatus.NotFound }).WithUser()
            .Delete(1, default)).ErrorOf();

        var reward = (await new RewardsController(
                new StubRewardService { MutationStatus = RewardMutationStatus.NotFound }).WithUser()
            .Delete(1, default)).ErrorOf();

        Assert.Equal("Chore not found.", chore.Error);
        Assert.Equal("Reward not found.", reward.Error);
        Assert.Null(chore.Errors);
        Assert.Null(reward.Errors);
    }
}
