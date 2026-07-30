using System.ComponentModel.DataAnnotations;
using API.Entities;
using API.Validation;

namespace API.Dtos.Households;

/// <remarks>
/// Attributes target the constructor parameters, not the generated properties — MVC's validator
/// throws at request time otherwise. See the note in <c>AuthDtos.cs</c>.
/// </remarks>
public record CreateHouseholdRequest(
    [Required, CleanText(Household.NameMaxLength)]
    string Name);

/// <summary>Shape of <c>POST /api/households</c>'s 201 response.</summary>
public record HouseholdSummaryResponse(int Id, string Name, string InviteCode, bool IsFull);

public record JoinHouseholdRequest(
    [Required, StringLength(Household.InviteCodeLength, MinimumLength = Household.InviteCodeLength)]
    string InviteCode);

/// <summary>
/// Shape of <c>POST /api/households/join</c>'s 200 response — deliberately thinner than create's,
/// and a 200 rather than a 201 because joining creates no resource.
/// </summary>
public record JoinHouseholdResponse(int Id, bool IsFull);

/// <remarks>
/// Only the name is patchable. Invite code, fullness and membership are not client-editable, so
/// this record carries one field rather than accepting a partial household and sanitising it — a
/// body that cannot express an unwanted change beats one that is filtered afterwards.
/// </remarks>
public record RenameHouseholdRequest(
    [Required, CleanText(Household.NameMaxLength)]
    string Name);

public record HouseholdMemberResponse(int Id, string Name);

/// <summary>Shape of <c>GET /api/households/{id}</c>.</summary>
public record HouseholdDetailsResponse(
    int Id,
    string Name,
    string InviteCode,
    IReadOnlyList<HouseholdMemberResponse> Members);

/// <summary>Shape of <c>PATCH /api/households/{id}</c> — id and name only, per api-design.md.</summary>
public record RenamedHouseholdResponse(int Id, string Name);

/// <summary>Shape of <c>POST /api/households/{id}/leave</c>.</summary>
public record LeaveHouseholdResponse(bool Left);
