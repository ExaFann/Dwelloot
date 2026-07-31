using API.Controllers;
using API.Dtos.Badges;
using API.Dtos.Competitions;
using API.Entities;
using API.Services.Competitions;
using API.Services.Progression;
using Microsoft.AspNetCore.Http;

namespace Dwelloot.Tests.Controllers;

public class CompetitionsAndBadgesControllerTests
{
    private sealed class StubCompetitionQueryService(CompetitionQueryStatus status) : ICompetitionQueryService
    {
        public bool WasCalled { get; private set; }

        public Task<CurrentCompetitionResult> GetCurrentAsync(
            int userId, int householdId, CompetitionPeriodType periodType, DateTime asOfUtc, CancellationToken ct = default)
        {
            WasCalled = true;
            return Task.FromResult(status == CompetitionQueryStatus.Ok
                ? CurrentCompetitionResult.Ok(new CurrentCompetitionResponse(
                    CompetitionPeriodType.Daily,
                    new DateTime(2026, 7, 29, 12, 0, 0, DateTimeKind.Utc),
                    new DateTime(2026, 7, 30, 12, 0, 0, DateTimeKind.Utc),
                    15, 10, false, false, null))
                : CurrentCompetitionResult.Failed(status));
        }
    }

    private sealed class StubLootBoxService(LootBoxStatus status) : ILootBoxService
    {
        public bool WasCalled { get; private set; }

        public Task<OpenLootBoxResult> OpenAsync(int userId, int householdId, int competitionId, CancellationToken ct = default)
        {
            WasCalled = true;
            return Task.FromResult(status == LootBoxStatus.Ok
                ? OpenLootBoxResult.Ok(new OpenLootBoxResponse(55, LootBoxResultType.Coins, 18, null))
                : OpenLootBoxResult.Failed(status));
        }
    }

    private static CompetitionsController For(
        CompetitionQueryStatus query = CompetitionQueryStatus.Ok,
        LootBoxStatus box = LootBoxStatus.Ok,
        int? userId = ControllerTestHarness.UserId) =>
        new CompetitionsController(new StubCompetitionQueryService(query), new StubLootBoxService(box)).WithUser(userId);

    [Theory]
    [InlineData(CompetitionQueryStatus.Ok, StatusCodes.Status200OK)]
    [InlineData(CompetitionQueryStatus.NotAMember, StatusCodes.Status404NotFound)]
    [InlineData(CompetitionQueryStatus.UserNotFound, StatusCodes.Status401Unauthorized)]
    public async Task Current_standing_statuses_map_to_their_documented_codes(CompetitionQueryStatus status, int expected) =>
        Assert.Equal(expected, (await For(query: status).Current(10, default)).StatusOf());

    [Fact]
    public async Task Not_a_member_is_404_rather_than_403()
    {
        // SS 3.5: a household id the caller is not in must be indistinguishable from one that does not
        // exist, or ids can be enumerated - and GET /api/households/{id} would hand a stranger another
        // household's invite code, which is the credential for joining it.
        var result = await For(query: CompetitionQueryStatus.NotAMember).Current(10, default);

        Assert.Equal(StatusCodes.Status404NotFound, result.StatusOf());
        Assert.Equal("Household not found.", result.ErrorOf().Error);
    }

    [Theory]
    [InlineData(LootBoxStatus.Ok, StatusCodes.Status200OK)]
    [InlineData(LootBoxStatus.NotAMember, StatusCodes.Status404NotFound)]
    [InlineData(LootBoxStatus.CompetitionNotFound, StatusCodes.Status404NotFound)]
    [InlineData(LootBoxStatus.Voided, StatusCodes.Status409Conflict)]
    [InlineData(LootBoxStatus.NotYours, StatusCodes.Status403Forbidden)]
    [InlineData(LootBoxStatus.UserNotFound, StatusCodes.Status401Unauthorized)]
    public async Task Loot_box_statuses_map_to_their_documented_codes(LootBoxStatus status, int expected) =>
        Assert.Equal(expected, (await For(box: status).OpenBox(10, 55, default)).StatusOf());

    [Fact]
    public async Task A_box_that_is_not_yours_is_403_while_a_missing_one_is_404()
    {
        // The second deliberate exception to 404-not-403 (SS 3.5): the caller can see this competition
        // on their own dashboard, so hiding it would confuse rather than protect. The two must not
        // converge, and NotAMember must stay on the 404 side.
        var notYours = await For(box: LootBoxStatus.NotYours).OpenBox(10, 55, default);
        var missing = await For(box: LootBoxStatus.CompetitionNotFound).OpenBox(10, 55, default);
        var notAMember = await For(box: LootBoxStatus.NotAMember).OpenBox(10, 55, default);

        Assert.Equal(StatusCodes.Status403Forbidden, notYours.StatusOf());
        Assert.Equal("You did not win that period.", notYours.ErrorOf().Error);

        // Not a member and no such competition are byte-identical - that is the anti-enumeration point.
        Assert.Equal(StatusCodes.Status404NotFound, missing.StatusOf());
        Assert.Equal(StatusCodes.Status404NotFound, notAMember.StatusOf());
        Assert.Equal(missing.ErrorOf().Error, notAMember.ErrorOf().Error);
    }

    [Fact]
    public async Task Competition_actions_return_401_without_a_user_id_and_never_reach_the_services()
    {
        var query = new StubCompetitionQueryService(CompetitionQueryStatus.Ok);
        var boxes = new StubLootBoxService(LootBoxStatus.Ok);
        var controller = new CompetitionsController(query, boxes).WithUser(userId: null);

        Assert.Equal(StatusCodes.Status401Unauthorized, (await controller.Current(10, default)).StatusOf());
        Assert.Equal(StatusCodes.Status401Unauthorized, (await controller.OpenBox(10, 55, default)).StatusOf());
        Assert.False(query.WasCalled);
        Assert.False(boxes.WasCalled);
    }

    // ------------------------------------------------------------------ badges

    private sealed class StubBadgeQueryService(BadgeQueryStatus status) : IBadgeQueryService
    {
        public bool WasCalled { get; private set; }

        public Task<BadgeListResult> ListAsync(int userId, CancellationToken ct = default)
        {
            WasCalled = true;
            return Task.FromResult(status == BadgeQueryStatus.Ok
                ? BadgeListResult.Ok(new BadgeListResponse([new BadgeResponse(1, "First chore", "Do one.", false, null)]))
                : BadgeListResult.Failed(status));
        }
    }

    [Theory]
    [InlineData(BadgeQueryStatus.Ok, StatusCodes.Status200OK)]
    [InlineData(BadgeQueryStatus.UserNotFound, StatusCodes.Status401Unauthorized)]
    public async Task Badge_statuses_map_to_their_documented_codes(BadgeQueryStatus status, int expected)
    {
        var controller = new BadgesController(new StubBadgeQueryService(status)).WithUser();

        Assert.Equal(expected, (await controller.List(default)).StatusOf());
    }

    [Fact]
    public async Task Badges_return_401_without_a_user_id_and_never_reach_the_service()
    {
        var service = new StubBadgeQueryService(BadgeQueryStatus.Ok);
        var controller = new BadgesController(service).WithUser(userId: null);

        Assert.Equal(StatusCodes.Status401Unauthorized, (await controller.List(default)).StatusOf());
        Assert.False(service.WasCalled);
    }
}
