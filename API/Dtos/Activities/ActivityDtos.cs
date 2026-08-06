using System.ComponentModel.DataAnnotations;
using API.Entities;
using API.Validation;

namespace API.Dtos.Activities;

/// <summary>
/// Item shape for <c>GET /api/activities</c>, matching <c>api-design.md</c> exactly.
/// </summary>
/// <remarks>
/// <c>Category</c> is deliberately not echoed per item: the client filters by it through the query
/// string and v1 has one value, so returning it would be padding. Additive later if the UI needs it.
/// </remarks>
/// <remarks>
/// <c>IsQuick</c> since [73]: the Log tab needs it to render the toggle, and it is the only way a
/// client can tell which chores make up the dashboard wall without asking twice.
/// </remarks>
public record ActivityResponse(int Id, string Title, int Points, bool IsQuick);

/// <summary>Query options bound from the request's query string.</summary>
public record ActivityQuery
{
    public ActivityCategory? Category { get; init; }

    /// <summary>
    /// Narrows to the dashboard's quick-log wall — task [73].
    /// </summary>
    /// <remarks>
    /// Nullable, and all three states are honoured, the same as <c>Affordable</c> on rewards:
    /// null is no filter, true is the wall, false is the complement. Accepting <c>false</c> and then
    /// ignoring it would hand back the whole catalogue to a client that asked for the opposite, with
    /// nothing in the response to say the filter had been dropped.
    /// </remarks>
    public bool? IsQuick { get; init; }

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
    [Required, CleanText(Activity.TitleMaxLength)]
    string Title,
    [Range(1, int.MaxValue)]
    int Points,
    ActivityCategory? Category,
    /// <summary>
    /// Put it straight on the dashboard wall — task [73]. Defaults to true, matching the column.
    /// </summary>
    /// <remarks>
    /// Settable at creation because the editor shows the tick box on the create form too, and a
    /// control that cannot affect the outcome is worse than no control.
    /// </remarks>
    bool IsQuick = true);

/// <summary>
/// Partial update. A null field means "leave it alone", which is what separates this from a PUT.
/// </summary>
/// <remarks>
/// <c>HouseholdId</c> is absent by design, so no request can move a chore between households — a
/// body that cannot express the change beats one that is filtered afterwards.
/// </remarks>
public record PatchActivityRequest(
    [CleanText(Activity.TitleMaxLength)]
    string? Title,
    [Range(1, int.MaxValue)]
    int? Points,
    ActivityCategory? Category,
    /// <summary>Put this chore on the dashboard wall, or take it off — task [73]. Null leaves it.</summary>
    bool? IsQuick = null);
