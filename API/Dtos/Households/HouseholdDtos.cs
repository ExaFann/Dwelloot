using System.ComponentModel.DataAnnotations;
using API.Entities;

namespace API.Dtos.Households;

/// <remarks>
/// Attributes target the constructor parameters, not the generated properties — MVC's validator
/// throws at request time otherwise. See the note in <c>AuthDtos.cs</c>.
/// </remarks>
public record CreateHouseholdRequest(
    [Required, StringLength(Household.NameMaxLength, MinimumLength = 1)]
    string Name);

/// <summary>Shape of <c>POST /api/households</c>'s 201 response.</summary>
public record HouseholdSummaryResponse(int Id, string Name, string InviteCode, bool IsFull);
