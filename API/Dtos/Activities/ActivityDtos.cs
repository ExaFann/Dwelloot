using System.ComponentModel.DataAnnotations;
using API.Entities;

namespace API.Dtos.Activities;

/// <summary>
/// Item shape for <c>GET /api/activities</c>, matching <c>api-design.md</c> exactly.
/// </summary>
/// <remarks>
/// <c>Category</c> is deliberately not echoed per item: the client filters by it through the query
/// string and v1 has one value, so returning it would be padding. Additive later if the UI needs it.
/// </remarks>
public record ActivityResponse(int Id, string Title, int Points);

/// <summary>Query options bound from the request's query string.</summary>
public record ActivityQuery
{
    public ActivityCategory? Category { get; init; }

    public string? Search { get; init; }

    /// <summary>One of <see cref="ActivitySortFields.All"/>. Defaults to title.</summary>
    public string? Sort { get; init; }

    public bool Descending { get; init; }

    public int? Page { get; init; }

    public int? PageSize { get; init; }
}

/// <remarks>
/// Attributes target the constructor parameters — see the note in <c>AuthDtos.cs</c>.
/// No <c>HouseholdId</c>: the household comes from the caller's token, so a client cannot create a
/// chore in someone else's home.
/// </remarks>
public record CreateActivityRequest(
    [Required, StringLength(Activity.TitleMaxLength, MinimumLength = 1)]
    string Title,
    [Range(1, int.MaxValue)]
    int Points,
    ActivityCategory? Category);

/// <summary>
/// Partial update. A null field means "leave it alone", which is what separates this from a PUT.
/// </summary>
/// <remarks>
/// <c>HouseholdId</c> is absent by design, so no request can move a chore between households — a
/// body that cannot express the change beats one that is filtered afterwards.
/// </remarks>
public record PatchActivityRequest(
    [StringLength(Activity.TitleMaxLength, MinimumLength = 1)]
    string? Title,
    [Range(1, int.MaxValue)]
    int? Points,
    ActivityCategory? Category);
