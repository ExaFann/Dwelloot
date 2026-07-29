using API.Data;
using API.Dtos;
using API.Dtos.ActivityLogs;
using API.Entities;
using Microsoft.EntityFrameworkCore;

namespace API.Services;

public enum ActivityLogStatusCode
{
    Ok,
    UserNotFound,
    NoHousehold,

    /// <summary>
    /// No such chore, it belongs to another household, or it has been archived — the caller
    /// cannot tell which.
    /// </summary>
    ActivityNotFound
}

public sealed record ActivityLogResult(ActivityLogStatusCode Status, ActivityLogResponse? Log)
{
    public static ActivityLogResult Ok(ActivityLogResponse log) => new(ActivityLogStatusCode.Ok, log);

    public static ActivityLogResult Failed(ActivityLogStatusCode status) => new(status, null);
}

public sealed record ActivityLogQueueResult(
    ActivityLogStatusCode Status,
    PagedResponse<PendingLogResponse>? Page)
{
    public static ActivityLogQueueResult Ok(PagedResponse<PendingLogResponse> page) =>
        new(ActivityLogStatusCode.Ok, page);

    public static ActivityLogQueueResult Failed(ActivityLogStatusCode status) => new(status, null);
}

public interface IActivityLogService
{
    Task<ActivityLogResult> CreateAsync(int userId, int activityId, CancellationToken ct = default);

    Task<ActivityLogQueueResult> ListForApprovalAsync(int userId, ActivityLogQuery query, CancellationToken ct = default);
}

public class ActivityLogService(AppDbContext db) : IActivityLogService
{
    public async Task<ActivityLogResult> CreateAsync(int userId, int activityId, CancellationToken ct = default)
    {
        var user = await db.Users.SingleOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null)
        {
            return ActivityLogResult.Failed(ActivityLogStatusCode.UserNotFound);
        }

        if (user.HouseholdId is null)
        {
            return ActivityLogResult.Failed(ActivityLogStatusCode.NoHousehold);
        }

        // Archived chores are excluded alongside the household check: a chore removed from the
        // catalog is no longer offered, so nothing new can be logged against it. Its existing logs
        // stay readable - that is the point of archiving rather than deleting.
        var activity = await db.Activities.SingleOrDefaultAsync(
            a => a.Id == activityId && a.HouseholdId == user.HouseholdId && a.ArchivedAt == null,
            ct);

        if (activity is null)
        {
            return ActivityLogResult.Failed(ActivityLogStatusCode.ActivityNotFound);
        }

        var log = new ActivityLog
        {
            ActivityId = activity.Id,
            LoggedByUserId = user.Id,

            // Snapshot, not a live read. Without this, editing the chore afterwards would re-value
            // this log - see the remarks on ActivityLog.PointsAwarded.
            PointsAwarded = activity.Points,

            Status = ActivityLogStatus.Pending,
            CompletedAt = DateTime.UtcNow
        };

        db.ActivityLogs.Add(log);
        await db.SaveChangesAsync(ct);

        return ActivityLogResult.Ok(new ActivityLogResponse(log.Id, log.ActivityId, log.Status, log.CompletedAt));
    }

    /// <summary>
    /// The partner's logs in this household — the approval queue.
    /// </summary>
    /// <remarks>
    /// Excluding the caller's own logs is the first line of the no-self-approval rule: if your own
    /// logs never appear here, the approve button is never offered for them. Task [21] enforces the
    /// same rule on the action itself, because hiding something is not the same as refusing it.
    /// </remarks>
    public async Task<ActivityLogQueueResult> ListForApprovalAsync(
        int userId,
        ActivityLogQuery query,
        CancellationToken ct = default)
    {
        var user = await db.Users.SingleOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null)
        {
            return ActivityLogQueueResult.Failed(ActivityLogStatusCode.UserNotFound);
        }

        if (user.HouseholdId is null)
        {
            return ActivityLogQueueResult.Failed(ActivityLogStatusCode.NoHousehold);
        }

        // Scoped through the activity, since activity_logs carries no household_id (see log 005).
        //
        // Note there is deliberately no ArchivedAt filter here, unlike the catalog endpoints: a
        // chore archived while one of its logs is still pending must keep that log approvable. The
        // work was done before the chore was removed, and refusing it would destroy the partner's
        // points for a reason unrelated to them.
        var logs = db.ActivityLogs
            .Where(l => l.Activity.HouseholdId == user.HouseholdId && l.LoggedByUserId != userId);

        if (query.Status is not null)
        {
            logs = logs.Where(l => l.Status == query.Status);
        }

        var total = await logs.CountAsync(ct);

        var pageSize = Math.Clamp(query.PageSize ?? ActivityService.DefaultPageSize, 1, ActivityService.MaxPageSize);
        var page = Math.Max(query.Page ?? 1, 1);

        var items = await logs
            // Newest first. The id tiebreaker matters for the same reason as task [16]: two logs
            // can share a timestamp, and without a total order rows repeat or vanish across pages.
            .OrderByDescending(l => l.CompletedAt)
            .ThenByDescending(l => l.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(l => new PendingLogResponse(
                l.Id,
                l.Activity.Title,
                // The snapshot, not l.Activity.Points - see ActivityLog.PointsAwarded.
                l.PointsAwarded,
                l.LoggedByUserId,
                l.Status,
                l.CompletedAt))
            .ToListAsync(ct);

        return ActivityLogQueueResult.Ok(new PagedResponse<PendingLogResponse>(items, total));
    }
}
