using API.Data;
using API.Dtos;
using API.Dtos.Activities;
using API.Entities;
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

public interface IActivityService
{
    Task<ActivityListResult> ListAsync(int userId, ActivityQuery query, CancellationToken ct = default);
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

        // The isolation guarantee the copy-on-creation model exists to provide.
        var activities = db.Activities.Where(a => a.HouseholdId == user.HouseholdId);

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
            .Select(a => new ActivityResponse(a.Id, a.Title, a.Points))
            .ToListAsync(ct);

        return ActivityListResult.Ok(new PagedResponse<ActivityResponse>(items, total));
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
