using API.Controllers;
using API.Dtos;
using API.Dtos.Households;
using API.Dtos.Redemptions;
using API.Entities;
using API.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Dwelloot.Tests.Controllers;

public class HouseholdsAndRedemptionsControllerTests
{
    // ------------------------------------------------------------------ households

    private sealed class StubHouseholdService : IHouseholdService
    {
        public CreateHouseholdStatus CreateStatus { get; init; } = CreateHouseholdStatus.Created;
        public JoinHouseholdStatus JoinStatus { get; init; } = JoinHouseholdStatus.Joined;
        public HouseholdAccessStatus AccessStatus { get; init; } = HouseholdAccessStatus.Ok;
        public bool WasCalled { get; private set; }

        private static Household Sample() => new()
        {
            Id = 10,
            Name = "Our place",
            InviteCode = "7F3K9Q",
            IsFull = false,
            Members = [new User { Id = 1, Name = "Alex", Email = "a@e.com", UserName = "a@e.com" }]
        };

        public Task<CreateHouseholdResult> CreateAsync(int userId, string name, CancellationToken ct = default)
        {
            WasCalled = true;
            return Task.FromResult(CreateStatus == CreateHouseholdStatus.Created
                ? CreateHouseholdResult.Ok(Sample())
                : CreateHouseholdResult.Failed(CreateStatus));
        }

        public Task<JoinHouseholdResult> JoinAsync(int userId, string inviteCode, CancellationToken ct = default)
        {
            WasCalled = true;
            return Task.FromResult(JoinStatus == JoinHouseholdStatus.Joined
                ? JoinHouseholdResult.Ok(Sample())
                : JoinHouseholdResult.Failed(JoinStatus));
        }

        private Task<HouseholdDetailsResult> Access()
        {
            WasCalled = true;
            return Task.FromResult(AccessStatus == HouseholdAccessStatus.Ok
                ? HouseholdDetailsResult.Ok(Sample())
                : HouseholdDetailsResult.Failed(AccessStatus));
        }

        public Task<HouseholdDetailsResult> GetAsync(int userId, int householdId, CancellationToken ct = default) => Access();
        public Task<HouseholdDetailsResult> RenameAsync(int userId, int householdId, string name, CancellationToken ct = default) => Access();

        public Task<LeaveHouseholdResult> LeaveAsync(int userId, int householdId, CancellationToken ct = default)
        {
            WasCalled = true;
            return Task.FromResult(AccessStatus == HouseholdAccessStatus.Ok
                ? LeaveHouseholdResult.Ok(householdDeleted: false)
                : LeaveHouseholdResult.Failed(AccessStatus));
        }
    }

    [Theory]
    [InlineData(CreateHouseholdStatus.Created, StatusCodes.Status201Created)]
    [InlineData(CreateHouseholdStatus.AlreadyInHousehold, StatusCodes.Status409Conflict)]
    [InlineData(CreateHouseholdStatus.InvalidName, StatusCodes.Status400BadRequest)]
    [InlineData(CreateHouseholdStatus.CouldNotGenerateInviteCode, StatusCodes.Status503ServiceUnavailable)]
    [InlineData(CreateHouseholdStatus.UserNotFound, StatusCodes.Status401Unauthorized)]
    public async Task Household_create_statuses_map_to_their_documented_codes(CreateHouseholdStatus status, int expected)
    {
        var controller = new HouseholdsController(new StubHouseholdService { CreateStatus = status }).WithUser();

        Assert.Equal(expected, (await controller.Create(new CreateHouseholdRequest("Our place"), default)).StatusOf());
    }

    [Theory]
    [InlineData(JoinHouseholdStatus.Joined, StatusCodes.Status200OK)]
    [InlineData(JoinHouseholdStatus.AlreadyInHousehold, StatusCodes.Status409Conflict)]
    [InlineData(JoinHouseholdStatus.InviteCodeNotFound, StatusCodes.Status404NotFound)]
    [InlineData(JoinHouseholdStatus.HouseholdFull, StatusCodes.Status409Conflict)]
    [InlineData(JoinHouseholdStatus.UserNotFound, StatusCodes.Status401Unauthorized)]
    public async Task Household_join_statuses_map_to_their_documented_codes(JoinHouseholdStatus status, int expected)
    {
        var controller = new HouseholdsController(new StubHouseholdService { JoinStatus = status }).WithUser();

        Assert.Equal(expected, (await controller.Join(new JoinHouseholdRequest("7F3K9Q"), default)).StatusOf());
    }

    [Theory]
    [InlineData(HouseholdAccessStatus.Ok, StatusCodes.Status200OK)]
    [InlineData(HouseholdAccessStatus.HouseholdNotFound, StatusCodes.Status404NotFound)]
    [InlineData(HouseholdAccessStatus.NotAMember, StatusCodes.Status404NotFound)]
    [InlineData(HouseholdAccessStatus.Conflict, StatusCodes.Status409Conflict)]
    [InlineData(HouseholdAccessStatus.InvalidName, StatusCodes.Status400BadRequest)]
    [InlineData(HouseholdAccessStatus.UserNotFound, StatusCodes.Status401Unauthorized)]
    public async Task Household_access_statuses_map_to_their_documented_codes(HouseholdAccessStatus status, int expected)
    {
        var service = new StubHouseholdService { AccessStatus = status };

        Assert.Equal(expected, (await new HouseholdsController(service).WithUser().Details(10, default)).StatusOf());
        Assert.Equal(expected, (await new HouseholdsController(service).WithUser().Rename(10, new RenameHouseholdRequest("The Nest"), default)).StatusOf());
        Assert.Equal(expected, (await new HouseholdsController(service).WithUser().Leave(10, default)).StatusOf());
    }

    [Fact]
    public async Task Household_not_found_and_not_a_member_are_byte_identical()
    {
        // SS 3.5's sharpest case: GET /api/households/{id} returns the invite code, which is the sole
        // credential for joining. If "not yours" and "does not exist" differed, ids could be walked
        // until one of them handed over a stranger's code.
        var missing = (await new HouseholdsController(
            new StubHouseholdService { AccessStatus = HouseholdAccessStatus.HouseholdNotFound }).WithUser()
            .Details(10, default)).ErrorOf();

        var notMine = (await new HouseholdsController(
            new StubHouseholdService { AccessStatus = HouseholdAccessStatus.NotAMember }).WithUser()
            .Details(10, default)).ErrorOf();

        Assert.Equal(missing.Error, notMine.Error);
        Assert.Equal(missing.Errors, notMine.Errors);
    }

    [Fact]
    public async Task A_created_household_is_201_with_its_location()
    {
        var created = await new HouseholdsController(new StubHouseholdService()).WithUser()
            .Create(new CreateHouseholdRequest("Our place"), default);

        var result = Assert.IsType<CreatedResult>(created.Result);
        Assert.Equal("/api/households/10", result.Location);
    }

    [Fact]
    public async Task Household_actions_return_401_without_a_user_id_and_never_reach_the_service()
    {
        var service = new StubHouseholdService();
        var controller = new HouseholdsController(service).WithUser(userId: null);

        Assert.Equal(StatusCodes.Status401Unauthorized, (await controller.Create(new CreateHouseholdRequest("x"), default)).StatusOf());
        Assert.Equal(StatusCodes.Status401Unauthorized, (await controller.Join(new JoinHouseholdRequest("7F3K9Q"), default)).StatusOf());
        Assert.Equal(StatusCodes.Status401Unauthorized, (await controller.Details(10, default)).StatusOf());
        Assert.Equal(StatusCodes.Status401Unauthorized, (await controller.Rename(10, new RenameHouseholdRequest("x"), default)).StatusOf());
        Assert.Equal(StatusCodes.Status401Unauthorized, (await controller.Leave(10, default)).StatusOf());
        Assert.False(service.WasCalled);
    }

    // ------------------------------------------------------------------ redemptions

    private sealed class StubRedemptionService(RedemptionStatus status) : IRedemptionService
    {
        public bool WasCalled { get; private set; }

        private bool Ok { get { WasCalled = true; return status == RedemptionStatus.Ok; } }

        public Task<RedemptionResult> CreateAsync(int userId, int rewardId, CancellationToken ct = default) =>
            Task.FromResult(Ok
                ? RedemptionResult.Ok(new RedemptionResponse(41, 5, 30, 20, new DateTime(2026, 7, 29, 11, 0, 0, DateTimeKind.Utc)))
                : RedemptionResult.Failed(status));

        public Task<MyRedemptionResult> ListMineAsync(int userId, MyRedemptionQuery query, CancellationToken ct = default) =>
            Task.FromResult(Ok
                ? MyRedemptionResult.Ok(new PagedResponse<MyRedemptionResponse>([], 0))
                : MyRedemptionResult.Failed(status));

        public Task<HouseholdRedemptionResult> ListForHouseholdAsync(int userId, HouseholdRedemptionQuery query, CancellationToken ct = default) =>
            Task.FromResult(Ok
                ? HouseholdRedemptionResult.Ok(new PagedResponse<HouseholdRedemptionResponse>([], 0))
                : HouseholdRedemptionResult.Failed(status));
    }

    [Theory]
    [InlineData(RedemptionStatus.Ok, StatusCodes.Status201Created)]
    [InlineData(RedemptionStatus.NoHousehold, StatusCodes.Status409Conflict)]
    [InlineData(RedemptionStatus.RewardNotFound, StatusCodes.Status404NotFound)]
    [InlineData(RedemptionStatus.InsufficientCoins, StatusCodes.Status400BadRequest)]
    [InlineData(RedemptionStatus.UserNotFound, StatusCodes.Status401Unauthorized)]
    public async Task Redemption_create_statuses_map_to_their_documented_codes(RedemptionStatus status, int expected)
    {
        var controller = new RedemptionsController(new StubRedemptionService(status)).WithUser();

        Assert.Equal(expected, (await controller.Create(new CreateRedemptionRequest(5), default)).StatusOf());
    }

    [Theory]
    [InlineData(RedemptionStatus.Ok, StatusCodes.Status200OK)]
    [InlineData(RedemptionStatus.NoHousehold, StatusCodes.Status409Conflict)]
    [InlineData(RedemptionStatus.InvalidScope, StatusCodes.Status400BadRequest)]
    [InlineData(RedemptionStatus.UserNotFound, StatusCodes.Status401Unauthorized)]
    public async Task Redemption_feed_statuses_map_to_their_documented_codes(RedemptionStatus status, int expected)
    {
        var controller = new RedemptionsController(new StubRedemptionService(status)).WithUser();

        Assert.Equal(expected, (await controller.Feed(new HouseholdRedemptionQuery(), default)).StatusOf());
    }

    [Theory]
    [InlineData(RedemptionStatus.Ok, StatusCodes.Status200OK)]
    [InlineData(RedemptionStatus.NoHousehold, StatusCodes.Status409Conflict)]
    [InlineData(RedemptionStatus.UserNotFound, StatusCodes.Status401Unauthorized)]
    public async Task Redemption_history_statuses_map_to_their_documented_codes(RedemptionStatus status, int expected)
    {
        var controller = new RedemptionsController(new StubRedemptionService(status)).WithUser();

        Assert.Equal(expected, (await controller.Mine(new MyRedemptionQuery(), default)).StatusOf());
    }

    [Fact]
    public async Task The_invalid_scope_message_lists_the_valid_values()
    {
        var controller = new RedemptionsController(new StubRedemptionService(RedemptionStatus.InvalidScope)).WithUser();

        var error = (await controller.Feed(new HouseholdRedemptionQuery(), default)).ErrorOf();

        foreach (var scope in RedemptionScopes.All)
        {
            Assert.Contains(scope, error.Error);
        }
    }

    [Fact]
    public async Task Redemption_actions_return_401_without_a_user_id_and_never_reach_the_service()
    {
        var service = new StubRedemptionService(RedemptionStatus.Ok);
        var controller = new RedemptionsController(service).WithUser(userId: null);

        Assert.Equal(StatusCodes.Status401Unauthorized, (await controller.Create(new CreateRedemptionRequest(5), default)).StatusOf());
        Assert.Equal(StatusCodes.Status401Unauthorized, (await controller.Mine(new MyRedemptionQuery(), default)).StatusOf());
        Assert.Equal(StatusCodes.Status401Unauthorized, (await controller.Feed(new HouseholdRedemptionQuery(), default)).StatusOf());
        Assert.False(service.WasCalled);
    }
}
