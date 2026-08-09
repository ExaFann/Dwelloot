using API.Data;
using API.Dtos;
using API.Dtos.Activities;
using API.Entities;
using API.Validation;
using Microsoft.EntityFrameworkCore;

namespace API.Services;

public enum ActivityQueryStatus
{
    Ok,
    UserNotFound,
    NoHousehold,
    InvalidSort
}

public sealed record ActivityListResult(
    ActivityQueryStatus Status,
    PagedResponse<ActivityResponse>? Page)
{
    public static ActivityListResult Ok(PagedResponse<ActivityResponse> page) =>
        new(ActivityQueryStatus.Ok, page);

    public static ActivityListResult Failed(ActivityQueryStatus status) => new(status, null);
}

public enum ActivityMutationStatus
{
    Ok,
    UserNotFound,
    NoHousehold,

    /// <summary>No such chore, or it belongs to another household — the caller cannot tell which.</summary>
    NotFound,

    InvalidPoints,

    /// <summary>
    /// The title is blank once normalised. Not redundant with <see cref="CleanTextAttribute"/>:
    /// that guards HTTP callers, this makes "a blank title cannot be stored" a property of the
    /// service itself (task [32]).
    /// </summary>
    InvalidTitle
}

public sealed record ActivityMutationResult(ActivityMutationStatus Status, ActivityResponse? Activity)
{
    public static ActivityMutationResult Ok(ActivityResponse activity) =>
        new(ActivityMutationStatus.Ok, activity);

    public static ActivityMutationResult Failed(ActivityMutationStatus status) => new(status, null);
}

public interface IActivityService
{
    Task<ActivityListResult> ListAsync(int userId, ActivityQuery query, CancellationToken ct = default);

    Task<ActivityMutationResult> CreateAsync(int userId, CreateActivityRequest request, CancellationToken ct = default);

    Task<ActivityMutationResult> UpdateAsync(int userId, int activityId, PatchActivityRequest request, CancellationToken ct = default);

    Task<ActivityMutationResult> DeleteAsync(int userId, int activityId, CancellationToken ct = default);
}

public class ActivityService(AppDbContext db) : IActivityService
{
    /// <summary>
    /// An uncapped page size lets a single request ask for every row in the table — a cheap
    /// denial of service and a memory spike.
    /// </summary>
    public const int MaxPageSize = 100;

    public const int DefaultPageSize = 20;

    public async Task<ActivityListResult> ListAsync(
        int userId,
        ActivityQuery query,
        CancellationToken ct = default)
    {
        var user = await db.Users.SingleOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null)
        {
            return ActivityListResult.Failed(ActivityQueryStatus.UserNotFound);
        }

        // Not an empty page: an empty list is indistinguishable from "this household deleted all
        // its chores", which is legitimate. Conflating a routing bug with a real data state hides
        // the bug.
        if (user.HouseholdId is null)
        {
            return ActivityListResult.Failed(ActivityQueryStatus.NoHousehold);
        }

        // The isolation guarantee the copy-on-creation model exists to provide. Archived chores are
        // excluded: they still exist so their logs keep resolving, but they are no longer offered.
        var activities = db.Activities
            .Where(a => a.HouseholdId == user.HouseholdId && a.ArchivedAt == null);

        // Task [73]. All three states honoured — see the note on `ActivityQuery.IsQuick`.
        if (query.IsQuick is not null)
        {
            activities = activities.Where(a => a.IsQuick == query.IsQuick.Value);
        }

        if (query.Category is not null)
        {
            activities = activities.Where(a => a.Category == query.Category);
        }

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            // ToLower().Contains rather than EF.Functions.ILike: ILike does not translate on the
            // in-memory provider used by the tests, and the catalog is a dozen rows per household
            // so losing index usage costs nothing. Contains also parameterises the term, so
            // searching for "%" finds a literal percent sign instead of matching everything.
            var term = query.Search.Trim().ToLower();
            activities = activities.Where(a => a.Title.ToLower().Contains(term));
        }

        var total = await activities.CountAsync(ct);

        var sorted = ApplySort(activities, query.Sort, query.Descending);
        if (sorted is null)
        {
            return ActivityListResult.Failed(ActivityQueryStatus.InvalidSort);
        }

        // Clamped rather than rejected: a client asking for page 0 wants the first page.
        var pageSize = Math.Clamp(query.PageSize ?? DefaultPageSize, 1, MaxPageSize);
        var page = Math.Max(query.Page ?? 1, 1);

        var items = await sorted
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(a => new ActivityResponse(a.Id, a.Title, a.Points, a.IsQuick))
            .ToListAsync(ct);

        return ActivityListResult.Ok(new PagedResponse<ActivityResponse>(items, total));
    }

    public async Task<ActivityMutationResult> CreateAsync(
        int userId,
        CreateActivityRequest request,
        CancellationToken ct = default)
    {
        var householdId = await ResolveHouseholdAsync(userId, ct);
        if (householdId.Status != ActivityMutationStatus.Ok)
        {
            return ActivityMutationResult.Failed(householdId.Status);
        }

        if (request.Points <= 0)
        {
            return ActivityMutationResult.Failed(ActivityMutationStatus.InvalidPoints);
        }

        var title = TextInput.Normalize(request.Title);
        if (title.Length == 0)
        {
            return ActivityMutationResult.Failed(ActivityMutationStatus.InvalidTitle);
        }

        var activity = new Activity
        {
            HouseholdId = householdId.HouseholdId,
            Title = title,
            Points = request.Points,
            Category = request.Category ?? ActivityCategory.Chore,
            IsQuick = request.IsQuick
        };

        db.Activities.Add(activity);
        await db.SaveChangesAsync(ct);

        return ActivityMutationResult.Ok(new ActivityResponse(activity.Id, activity.Title, activity.Points, activity.IsQuick));
    }

    public async Task<ActivityMutationResult> UpdateAsync(
        int userId,
        int activityId,
        PatchActivityRequest request,
        CancellationToken ct = default)
    {
        var found = await FindOwnedAsync(userId, activityId, ct);
        if (found.Status != ActivityMutationStatus.Ok)
        {
            return ActivityMutationResult.Failed(found.Status);
        }

        if (request.Points is <= 0)
        {
            return ActivityMutationResult.Failed(ActivityMutationStatus.InvalidPoints);
        }

        // Present-but-blank is refused rather than written. Before task [32] this stored an empty
        // title: the nullable field carries no [Required], and [StringLength(MinimumLength = 1)]
        // counted "   " as three characters.
        if (request.Title is not null && TextInput.Normalize(request.Title).Length == 0)
        {
            return ActivityMutationResult.Failed(ActivityMutationStatus.InvalidTitle);
        }

        var activity = found.Activity!;

        // Null means "leave alone" - the whole point of PATCH. Writing every field unconditionally
        // would blank out anything the client did not send.
        if (request.Title is not null)
        {
            activity.Title = TextInput.Normalize(request.Title);
        }

        if (request.Points is not null)
        {
            activity.Points = request.Points.Value;
        }

        if (request.Category is not null)
        {
            activity.Category = request.Category.Value;
        }

        // Task [73]. Settable both ways: taking a chore off the wall is the whole point, and a
        // one-way flag would leave no way back.
        if (request.IsQuick is not null)
        {
            activity.IsQuick = request.IsQuick.Value;
        }

        await db.SaveChangesAsync(ct);

        return ActivityMutationResult.Ok(new ActivityResponse(activity.Id, activity.Title, activity.Points, activity.IsQuick));
    }

    /// <summary>
    /// Removes a chore from the catalog by archiving it. The row survives, so its logged history
    /// and the points earned from it are untouched.
    /// </summary>
    /// <remarks>
    /// A hard delete would cascade to every <see cref="ActivityLog"/> of this chore. Beyond losing
    /// the audit trail, the current competition period is computed live from approved logs, so
    /// that would retroactively reduce whoever logged it — and since either partner may remove any
    /// household chore, one partner could use it against the other.
    /// </remarks>
    public async Task<ActivityMutationResult> DeleteAsync(
        int userId,
        int activityId,
        CancellationToken ct = default)
    {
        var found = await FindOwnedAsync(userId, activityId, ct);
        if (found.Status != ActivityMutationStatus.Ok)
        {
            return ActivityMutationResult.Failed(found.Status);
        }

        var activity = found.Activity!;
        activity.ArchivedAt = DateTime.UtcNow;

        await db.SaveChangesAsync(ct);

        return ActivityMutationResult.Ok(new ActivityResponse(activity.Id, activity.Title, activity.Points, activity.IsQuick));
    }

    private async Task<(ActivityMutationStatus Status, int HouseholdId)> ResolveHouseholdAsync(
        int userId,
        CancellationToken ct)
    {
        var user = await db.Users.SingleOrDefaultAsync(u => u.Id == userId, ct);

        if (user is null)
        {
            return (ActivityMutationStatus.UserNotFound, 0);
        }

        return user.HouseholdId is null
            ? (ActivityMutationStatus.NoHousehold, 0)
            : (ActivityMutationStatus.Ok, user.HouseholdId.Value);
    }

    /// <summary>
    /// Loads a chore only if it belongs to the caller's household.
    /// </summary>
    /// <remarks>
    /// Returns <see cref="ActivityMutationStatus.NotFound"/> for both "no such chore" and
    /// "someone else's chore", so the endpoint cannot be used to discover which ids exist.
    /// Archived chores are also not found: they are no longer part of the catalog, so they cannot
    /// be edited or archived again.
    /// </remarks>
    private async Task<(ActivityMutationStatus Status, Activity? Activity)> FindOwnedAsync(
        int userId,
        int activityId,
        CancellationToken ct)
    {
        var household = await ResolveHouseholdAsync(userId, ct);
        if (household.Status != ActivityMutationStatus.Ok)
        {
            return (household.Status, null);
        }

        var activity = await db.Activities.SingleOrDefaultAsync(
            a => a.Id == activityId && a.HouseholdId == household.HouseholdId && a.ArchivedAt == null,
            ct);

        return activity is null
            ? (ActivityMutationStatus.NotFound, null)
            : (ActivityMutationStatus.Ok, activity);
    }

    /// <summary>
    /// Maps the requested sort onto a fixed set of orderings. Returns null for an unknown field.
    /// </summary>
    /// <remarks>
    /// A switch rather than anything that builds a query fragment from the caller's string, so
    /// there is no path from user input into the query. Every branch ends with a tiebreaker on
    /// <c>Id</c>: sorting by points alone is not a total order — the default catalog has three
    /// chores at 15 points — and a non-deterministic order makes rows repeat or vanish while
    /// paging.
    /// </remarks>
    private static IQueryable<Activity>? ApplySort(IQueryable<Activity> activities, string? sort, bool descending)
    {
        var field = string.IsNullOrWhiteSpace(sort) ? ActivitySortFields.Title : sort.Trim().ToLowerInvariant();

        return field switch
        {
            ActivitySortFields.Title => descending
                ? activities.OrderByDescending(a => a.Title).ThenBy(a => a.Id)
                : activities.OrderBy(a => a.Title).ThenBy(a => a.Id),

            ActivitySortFields.Points => descending
                ? activities.OrderByDescending(a => a.Points).ThenBy(a => a.Id)
                : activities.OrderBy(a => a.Points).ThenBy(a => a.Id),

            _ => null
        };
    }
}

public static class ActivitySortFields
{
    public const string Title = "title";
    public const string Points = "points";

    public static readonly IReadOnlyList<string> All = [Title, Points];
}
