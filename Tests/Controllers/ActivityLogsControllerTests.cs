using API.Controllers;
using API.Dtos;
using API.Dtos.ActivityLogs;
using API.Entities;
using API.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Dwelloot.Tests.Controllers;

public class ActivityLogsControllerTests
{
    private sealed class StubActivityLogService : IActivityLogService
    {
        public ActivityLogStatusCode Status { get; init; } = ActivityLogStatusCode.Ok;
        public bool WasCalled { get; private set; }

        private static readonly ActivityLogResponse Created =
            new(90, 3, ActivityLogStatus.Pending, new DateTime(2026, 7, 29, 9, 15, 0, DateTimeKind.Utc));

        private static readonly ActivityLogDecisionResponse Decision =
            new(90, ActivityLogStatus.Approved, new DateTime(2026, 7, 29, 10, 0, 0, DateTimeKind.Utc));

        private bool Ok { get { WasCalled = true; return Status == ActivityLogStatusCode.Ok; } }

        public Task<ActivityLogResult> CreateAsync(int userId, int activityId, CancellationToken ct = default) =>
            Task.FromResult(Ok ? ActivityLogResult.Ok(Created) : ActivityLogResult.Failed(Status));

        public Task<ActivityLogQueueResult> ListForApprovalAsync(int userId, ActivityLogQuery query, CancellationToken ct = default) =>
            Task.FromResult(Ok
                ? ActivityLogQueueResult.Ok(new PagedResponse<PendingLogResponse>([], 0))
                : ActivityLogQueueResult.Failed(Status));

        public Task<ActivityLogDecisionResult> ApproveAsync(int userId, int logId, CancellationToken ct = default) =>
            Task.FromResult(Ok ? ActivityLogDecisionResult.Ok(Decision) : ActivityLogDecisionResult.Failed(Status));

        public Task<ActivityLogDecisionResult> RejectAsync(int userId, int logId, string reason, CancellationToken ct = default) =>
            Task.FromResult(Ok ? ActivityLogDecisionResult.Ok(Decision) : ActivityLogDecisionResult.Failed(Status));

        public Task<BulkApproveResult> BulkApproveAsync(int userId, IReadOnlyList<int> ids, CancellationToken ct = default) =>
            Task.FromResult(Ok ? BulkApproveResult.Ok(new BulkApproveResponse([], [])) : BulkApproveResult.Failed(Status));

        public Task<MyActivityLogResult> ListMineAsync(int userId, MyActivityLogQuery query, CancellationToken ct = default) =>
            Task.FromResult(Ok
                ? MyActivityLogResult.Ok(new PagedResponse<MyActivityLogResponse>([], 0))
                : MyActivityLogResult.Failed(Status));

        public Task<ActivityLogStatusCode> DeleteMineAsync(int userId, int logId, CancellationToken ct = default) =>
            Task.FromResult(Status);
    }

    private static ActivityLogsController For(ActivityLogStatusCode status, int? userId = ControllerTestHarness.UserId) =>
        new ActivityLogsController(new StubActivityLogService { Status = status }).WithUser(userId);

    [Theory]
    [InlineData(ActivityLogStatusCode.Ok, StatusCodes.Status200OK)]
    [InlineData(ActivityLogStatusCode.NoHousehold, StatusCodes.Status409Conflict)]
    [InlineData(ActivityLogStatusCode.UserNotFound, StatusCodes.Status401Unauthorized)]
    public async Task Queue_and_mine_statuses_map_to_their_documented_codes(ActivityLogStatusCode status, int expected)
    {
        Assert.Equal(expected, (await For(status).List(new ActivityLogQuery(), default)).StatusOf());
        Assert.Equal(expected, (await For(status).Mine(new MyActivityLogQuery(), default)).StatusOf());
    }

    [Theory]
    [InlineData(ActivityLogStatusCode.NoHousehold, StatusCodes.Status409Conflict)]
    [InlineData(ActivityLogStatusCode.ActivityNotFound, StatusCodes.Status404NotFound)]
    [InlineData(ActivityLogStatusCode.UserNotFound, StatusCodes.Status401Unauthorized)]
    public async Task Create_statuses_map_to_their_documented_codes(ActivityLogStatusCode status, int expected) =>
        Assert.Equal(expected, (await For(status).Create(new CreateActivityLogRequest(3), default)).StatusOf());

    [Theory]
    [InlineData(ActivityLogStatusCode.NoHousehold, StatusCodes.Status409Conflict)]
    [InlineData(ActivityLogStatusCode.LogNotFound, StatusCodes.Status404NotFound)]
    [InlineData(ActivityLogStatusCode.SelfApproval, StatusCodes.Status403Forbidden)]
    [InlineData(ActivityLogStatusCode.NotPending, StatusCodes.Status409Conflict)]
    [InlineData(ActivityLogStatusCode.Conflict, StatusCodes.Status409Conflict)]
    [InlineData(ActivityLogStatusCode.UserNotFound, StatusCodes.Status401Unauthorized)]
    public async Task Decision_statuses_map_to_their_documented_codes(ActivityLogStatusCode status, int expected)
    {
        // All three decision endpoints share MapDecisionFailure, so all three are checked - a mapping
        // that drifted for one of them would otherwise hide behind the other two.
        Assert.Equal(expected, (await For(status).Approve(90, default)).StatusOf());
        Assert.Equal(expected, (await For(status).Reject(90, new RejectActivityLogRequest("Not done"), default)).StatusOf());
        Assert.Equal(expected, (await For(status).BulkApprove(new BulkApproveRequest([90]), default)).StatusOf());
    }

    [Fact]
    public async Task Self_approval_is_403_and_a_missing_log_is_404()
    {
        // The deliberate exception to the 404-not-403 rule (SS 3.4/3.5), pinned against tidying: 403
        // because the caller created the log and knows perfectly well it exists, while another
        // household's log stays a 404 so ids cannot be enumerated. The two must not converge.
        var self = await For(ActivityLogStatusCode.SelfApproval).Approve(90, default);
        var missing = await For(ActivityLogStatusCode.LogNotFound).Approve(90, default);

        Assert.Equal(StatusCodes.Status403Forbidden, self.StatusOf());
        Assert.Equal(StatusCodes.Status404NotFound, missing.StatusOf());
        Assert.NotEqual(self.ErrorOf().Error, missing.ErrorOf().Error);
        Assert.Contains("cannot approve or reject", self.ErrorOf().Error);
    }

    [Fact]
    public async Task A_created_log_is_201_with_its_location()
    {
        var created = await For(ActivityLogStatusCode.Ok).Create(new CreateActivityLogRequest(3), default);

        var result = Assert.IsType<CreatedResult>(created.Result);
        Assert.Equal(StatusCodes.Status201Created, result.StatusCode);
        Assert.Equal("/api/activity-logs/90", result.Location);
    }

    [Fact]
    public async Task Every_action_returns_401_without_a_user_id_and_never_reaches_the_service()
    {
        var service = new StubActivityLogService();
        var controller = new ActivityLogsController(service).WithUser(userId: null);

        Assert.Equal(StatusCodes.Status401Unauthorized, (await controller.List(new ActivityLogQuery(), default)).StatusOf());
        Assert.Equal(StatusCodes.Status401Unauthorized, (await controller.Mine(new MyActivityLogQuery(), default)).StatusOf());
        Assert.Equal(StatusCodes.Status401Unauthorized, (await controller.Create(new CreateActivityLogRequest(3), default)).StatusOf());
        Assert.Equal(StatusCodes.Status401Unauthorized, (await controller.Approve(90, default)).StatusOf());
        Assert.Equal(StatusCodes.Status401Unauthorized, (await controller.Reject(90, new RejectActivityLogRequest("x"), default)).StatusOf());
        Assert.Equal(StatusCodes.Status401Unauthorized, (await controller.BulkApprove(new BulkApproveRequest([90]), default)).StatusOf());

        Assert.False(service.WasCalled);
    }
}
