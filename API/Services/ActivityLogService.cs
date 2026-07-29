using API.Data;
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

public interface IActivityLogService
{
    Task<ActivityLogResult> CreateAsync(int userId, int activityId, CancellationToken ct = default);
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
}
