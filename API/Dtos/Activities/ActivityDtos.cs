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
