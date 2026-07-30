using System.ComponentModel.DataAnnotations;
using API.Entities;
using API.Validation;

namespace API.Dtos.Auth;

/// <remarks>
/// The annotations here are the shallow layer — presence, shape and length. Task [32] owns the
/// fuller validation and sanitisation pass across every endpoint.
/// <para>
/// Attributes target the <b>constructor parameters</b>, not the generated properties. MVC's
/// validator throws at request time on a record whose validation metadata sits on the properties
/// instead — a <c>[property:]</c> target here produces a 500, not a 400.
/// </para>
/// </remarks>
public record RegisterRequest(
    [Required, CleanText(User.NameMaxLength)]
    string Name,
    [Required, EmailAddress, StringLength(256)]
    string Email,
    [Required, StringLength(128, MinimumLength = 8)]
    string Password);

public record LoginRequest(
    [Required, EmailAddress]
    string Email,
    [Required]
    string Password);

/// <summary>Shape of <c>POST /api/auth/register</c>'s 201 response.</summary>
public record RegisteredUserResponse(int Id, string Name, string Email);

/// <summary>Shape of <c>POST /api/auth/login</c>'s 200 response.</summary>
public record AuthResponse(string Token, AuthenticatedUser User);

public record AuthenticatedUser(int Id, string Name);

/// <summary>
/// Shape of <c>GET /api/auth/me</c>. <c>HouseholdId</c> being null is what routes the frontend to
/// the pairing screen rather than the main app.
/// </summary>
public record CurrentUserResponse(
    int Id,
    string Name,
    string? Email,
    int? HouseholdId,
    int LifetimePoints,
    int Coins,
    int CurrentWinStreak);
