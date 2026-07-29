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
    ActivityNotFound,

    /// <summary>No such log, or it belongs to another household.</summary>
    LogNotFound,

    /// <summary>The caller logged this themselves. Nobody approves their own work.</summary>
    SelfApproval,

    /// <summary>Already approved or rejected — a decision is made once.</summary>
    NotPending,

    /// <summary>Someone decided it between the read and the write.</summary>
    Conflict
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

public sealed record ActivityLogDecisionResult(
    ActivityLogStatusCode Status,
    ActivityLogDecisionResponse? Log)
{
    public static ActivityLogDecisionResult Ok(ActivityLogDecisionResponse log) =>
        new(ActivityLogStatusCode.Ok, log);

    public static ActivityLogDecisionResult Failed(ActivityLogStatusCode status) => new(status, null);
}

public interface IActivityLogService
{
    Task<ActivityLogResult> CreateAsync(int userId, int activityId, CancellationToken ct = default);

    Task<ActivityLogQueueResult> ListForApprovalAsync(int userId, ActivityLogQuery query, CancellationToken ct = default);

    Task<ActivityLogDecisionResult> ApproveAsync(int userId, int logId, CancellationToken ct = default);

    Task<ActivityLogDecisionResult> RejectAsync(int userId, int logId, string reason, CancellationToken ct = default);
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

    /// <summary>
    /// Approves the partner's log and credits them the Points it was worth.
    /// </summary>
    /// <remarks>
    /// This is where <c>users.lifetime_points</c> is incremented — nothing else in the plan does
    /// it. Two things are easy to get backwards and are asserted by tests: the credit goes to
    /// whoever <em>logged</em> the chore, not the approver, and the amount is the log's snapshot
    /// rather than the chore's current points.
    /// </remarks>
    public async Task<ActivityLogDecisionResult> ApproveAsync(int userId, int logId, CancellationToken ct = default)
    {
        var found = await FindDecidableAsync(userId, logId, ct);
        if (found.Status != ActivityLogStatusCode.Ok)
        {
            return ActivityLogDecisionResult.Failed(found.Status);
        }

        var log = found.Log!;

        log.Status = ActivityLogStatus.Approved;
        log.ApprovedByUserId = userId;
        log.ApprovedAt = DateTime.UtcNow;

        // The logger, not the approver. The snapshot, not the chore's current points.
        var logger = await db.Users.SingleAsync(u => u.Id == log.LoggedByUserId, ct);
        logger.LifetimePoints += log.PointsAwarded;

        return await SaveDecisionAsync(log, ct);
    }

    public async Task<ActivityLogDecisionResult> RejectAsync(
        int userId,
        int logId,
        string reason,
        CancellationToken ct = default)
    {
        var found = await FindDecidableAsync(userId, logId, ct);
        if (found.Status != ActivityLogStatusCode.Ok)
        {
            return ActivityLogDecisionResult.Failed(found.Status);
        }

        var log = found.Log!;

        log.Status = ActivityLogStatus.Rejected;
        log.RejectReason = reason.Trim();

        // No points, and ApprovedByUserId stays null: in a two-person household the rejecter is
        // always the partner who did not log it, so recording it separately would be redundant
        // (see log 005).
        return await SaveDecisionAsync(log, ct);
    }

    private async Task<ActivityLogDecisionResult> SaveDecisionAsync(ActivityLog log, CancellationToken ct)
    {
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            // Status is a concurrency token, so this means the log was decided between the read
            // above and this write - a double-clicked approve button. Without it, both requests
            // would award the points.
            return ActivityLogDecisionResult.Failed(ActivityLogStatusCode.Conflict);
        }

        return ActivityLogDecisionResult.Ok(
            new ActivityLogDecisionResponse(log.Id, log.Status, log.ApprovedAt));
    }

    /// <summary>
    /// Loads a log the caller is allowed to decide on.
    /// </summary>
    /// <remarks>
    /// Note the deliberate asymmetry in what the failures reveal. Another household's log is
    /// <see cref="ActivityLogStatusCode.LogNotFound"/>, mapped to 404, because hiding its existence
    /// is the point. The caller's <em>own</em> log is
    /// <see cref="ActivityLogStatusCode.SelfApproval"/>, mapped to 403 — they created it, so
    /// pretending it does not exist would confuse rather than protect.
    /// <para>
    /// No <c>ArchivedAt</c> filter: a chore archived while one of its logs was pending must still
    /// be decidable, since the work predates the removal.
    /// </para>
    /// </remarks>
    private async Task<(ActivityLogStatusCode Status, ActivityLog? Log)> FindDecidableAsync(
        int userId,
        int logId,
        CancellationToken ct)
    {
        var user = await db.Users.SingleOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null)
        {
            return (ActivityLogStatusCode.UserNotFound, null);
        }

        if (user.HouseholdId is null)
        {
            return (ActivityLogStatusCode.NoHousehold, null);
        }

        var log = await db.ActivityLogs.SingleOrDefaultAsync(
            l => l.Id == logId && l.Activity.HouseholdId == user.HouseholdId, ct);

        if (log is null)
        {
            return (ActivityLogStatusCode.LogNotFound, null);
        }

        // The rule the whole competition rests on. The queue already hides these (task [20]) and
        // the database refuses to store one (task [6]); this is the layer that refuses the action.
        if (log.LoggedByUserId == userId)
        {
            return (ActivityLogStatusCode.SelfApproval, null);
        }

        // A decision is made once. Re-approving would credit the points a second time, and
        // reconsidering a rejection is not a v1 flow - the logger can simply log the chore again.
        if (log.Status != ActivityLogStatus.Pending)
        {
            return (ActivityLogStatusCode.NotPending, null);
        }

        return (ActivityLogStatusCode.Ok, log);
    }
}
