using API.Data;
using API.Dtos;
using API.Dtos.ActivityLogs;
using API.Entities;
using API.Services.Progression;
using API.Validation;
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

    Task<BulkApproveResult> BulkApproveAsync(int userId, IReadOnlyList<int> ids, CancellationToken ct = default);

    Task<MyActivityLogResult> ListMineAsync(int userId, MyActivityLogQuery query, CancellationToken ct = default);

    /// <summary>
    /// Removes one of the caller's own **pending** logs — task [71].
    /// </summary>
    /// <remarks>
    /// Mis-tapping a chore was previously unrecoverable once the request had gone: task [46] built
    /// `useDeferredLog`'s five-second undo window precisely because this endpoint did not exist, and
    /// after that window the only way back was asking the partner to reject it.
    /// </remarks>
    Task<ActivityLogStatusCode> DeleteMineAsync(int userId, int logId, CancellationToken ct = default);
}

public sealed record MyActivityLogResult(
    ActivityLogStatusCode Status,
    PagedResponse<MyActivityLogResponse>? Page)
{
    public static MyActivityLogResult Ok(PagedResponse<MyActivityLogResponse> page) =>
        new(ActivityLogStatusCode.Ok, page);

    public static MyActivityLogResult Failed(ActivityLogStatusCode status) => new(status, null);
}

public sealed record BulkApproveResult(ActivityLogStatusCode Status, BulkApproveResponse? Response)
{
    public static BulkApproveResult Ok(BulkApproveResponse response) =>
        new(ActivityLogStatusCode.Ok, response);

    public static BulkApproveResult Failed(ActivityLogStatusCode status) => new(status, null);
}

public class ActivityLogService(AppDbContext db, IProgressionService progression) : IActivityLogService
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

        var saved = await SaveDecisionAsync(log, ct);

        if (saved.Status == ActivityLogStatusCode.Ok)
        {
            // Badge criteria that approval can satisfy - first approved chore, and the lifetime
            // points threshold. Waiting for settlement would make "First chore", the badge whose
            // whole point is to fire on your first action, the slowest to arrive.
            await progression.EvaluateBadgesAsync(log.LoggedByUserId, ct);
        }

        return saved;
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
        log.RejectReason = TextInput.Normalize(reason);

        // No points, and ApprovedByUserId stays null: in a two-person household the rejecter is
        // always the partner who did not log it, so recording it separately would be redundant
        // (see log 005).
        return await SaveDecisionAsync(log, ct);
    }

    /// <summary>
    /// The caller's own logs — the exact complement of <see cref="ListForApprovalAsync"/>.
    /// </summary>
    /// <remarks>
    /// Scoped to the caller's <em>current</em> household as well as to their user id. The user
    /// filter alone would be correct in the narrow sense, but someone who left a household and
    /// joined another would see their old history mixed into the new one. Nothing leaks — it is all
    /// their own data — but "my history" should mean "my history here".
    /// <para>
    /// Logs whose chore has been archived are included: archiving removes a chore from the catalog,
    /// not from what already happened.
    /// </para>
    /// </remarks>
    /// <summary>
    /// Removes one of the caller's own pending logs. Task [71].
    /// </summary>
    /// <remarks>
    /// <b>A hard delete, and that needed checking rather than assuming.</b> Rewards and activities
    /// are archived instead of deleted because rows elsewhere point at them; a pending log has no
    /// such dependants. Everything downstream reads <see cref="ActivityLogStatus.Approved"/> only —
    /// competition totals, the two badge counts — so removing a pending row moves no score and
    /// costs no history. There is nothing to preserve, and an archived-log state would be a second
    /// invisible status for every reader to learn.
    /// <para>
    /// <b>One reader does see pending logs</b>, and it is the reason this is safe rather than a
    /// problem: settlement's "is anything still waiting" check blocks a period from closing while a
    /// pending log sits in it. Deleting a mis-tapped chore therefore lets that period settle — which
    /// is exactly what the user asking for the deletion wants, and the alternative is a duel that
    /// cannot be decided because of a tap nobody meant.
    /// </para>
    /// <para>
    /// <b>Pending only.</b> An approved log has already moved the score and may sit inside a settled
    /// period; unwinding that would mean reversing points across a closed competition, which is the
    /// invariant task [23] is built on. Removing an approved chore stays the partner's job, through
    /// rejection. A rejected log is left alone too — it is the record of a decision the partner
    /// made, and the person it went against should not be able to erase it.
    /// </para>
    /// </remarks>
    public async Task<ActivityLogStatusCode> DeleteMineAsync(
        int userId,
        int logId,
        CancellationToken ct = default)
    {
        var log = await db.ActivityLogs.SingleOrDefaultAsync(
            l => l.Id == logId && l.LoggedByUserId == userId, ct);

        // Same 404 for "no such log" and "not yours", byte-identically — the rule the rest of the
        // API follows, so the endpoint cannot be used to discover which ids exist.
        if (log is null)
        {
            return ActivityLogStatusCode.LogNotFound;
        }

        if (log.Status != ActivityLogStatus.Pending)
        {
            return ActivityLogStatusCode.NotPending;
        }

        db.ActivityLogs.Remove(log);
        await db.SaveChangesAsync(ct);

        return ActivityLogStatusCode.Ok;
    }

    public async Task<MyActivityLogResult> ListMineAsync(
        int userId,
        MyActivityLogQuery query,
        CancellationToken ct = default)
    {
        var user = await db.Users.SingleOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null)
        {
            return MyActivityLogResult.Failed(ActivityLogStatusCode.UserNotFound);
        }

        if (user.HouseholdId is null)
        {
            return MyActivityLogResult.Failed(ActivityLogStatusCode.NoHousehold);
        }

        var logs = db.ActivityLogs
            .Where(l => l.LoggedByUserId == userId && l.Activity.HouseholdId == user.HouseholdId);

        if (query.Status is not null)
        {
            logs = logs.Where(l => l.Status == query.Status);
        }

        var total = await logs.CountAsync(ct);

        var pageSize = Math.Clamp(
            query.EffectivePageSize ?? ActivityService.DefaultPageSize,
            1,
            ActivityService.MaxPageSize);
        var page = Math.Max(query.Page ?? 1, 1);

        var items = await logs
            .OrderByDescending(l => l.CompletedAt)
            .ThenByDescending(l => l.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(l => new MyActivityLogResponse(
                l.Id,
                l.Activity.Title,
                l.PointsAwarded,
                l.Status,
                l.CompletedAt,
                l.ApprovedAt,
                l.RejectReason))
            .ToListAsync(ct);

        return MyActivityLogResult.Ok(new PagedResponse<MyActivityLogResponse>(items, total));
    }

    /// <summary>
    /// Approves as many of <paramref name="ids"/> as the caller is allowed to, reporting the rest.
    /// </summary>
    /// <remarks>
    /// Best-effort rather than all-or-nothing, because <c>api-design.md</c>'s response echoes back
    /// <em>which</em> ids were approved — a field that would be redundant if a subset could not
    /// succeed. It also suits select-all: failing twenty because the partner decided one of them a
    /// second earlier would be obstructive.
    /// <para>
    /// The per-id rules are deliberately identical to <see cref="ApproveAsync"/>. A bulk path with
    /// looser checks would be a way around the no-self-approval rule, which is the one rule this
    /// app cannot afford two versions of.
    /// </para>
    /// </remarks>
    public async Task<BulkApproveResult> BulkApproveAsync(
        int userId,
        IReadOnlyList<int> ids,
        CancellationToken ct = default)
    {
        var user = await db.Users.SingleOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null)
        {
            return BulkApproveResult.Failed(ActivityLogStatusCode.UserNotFound);
        }

        if (user.HouseholdId is null)
        {
            return BulkApproveResult.Failed(ActivityLogStatusCode.NoHousehold);
        }

        // Collapsed before anything else: [90, 90] must approve once and award once.
        var requested = ids.Distinct().ToList();

        // One query for the whole batch, rather than two round trips per id.
        var found = await db.ActivityLogs
            .Where(l => requested.Contains(l.Id) && l.Activity.HouseholdId == user.HouseholdId)
            .ToListAsync(ct);

        var byId = found.ToDictionary(l => l.Id);
        var approved = new List<int>();
        var skipped = new List<SkippedLogResponse>();
        var approvedAt = DateTime.UtcNow;

        // Summed per logger and applied once, rather than incrementing the same row N times.
        var pointsPerLogger = new Dictionary<int, int>();

        foreach (var id in requested)
        {
            if (!byId.TryGetValue(id, out var log))
            {
                skipped.Add(new SkippedLogResponse(id, nameof(ActivityLogStatusCode.LogNotFound)));
                continue;
            }

            if (log.LoggedByUserId == userId)
            {
                skipped.Add(new SkippedLogResponse(id, nameof(ActivityLogStatusCode.SelfApproval)));
                continue;
            }

            if (log.Status != ActivityLogStatus.Pending)
            {
                skipped.Add(new SkippedLogResponse(id, nameof(ActivityLogStatusCode.NotPending)));
                continue;
            }

            log.Status = ActivityLogStatus.Approved;
            log.ApprovedByUserId = userId;
            log.ApprovedAt = approvedAt;

            pointsPerLogger[log.LoggedByUserId] =
                pointsPerLogger.GetValueOrDefault(log.LoggedByUserId) + log.PointsAwarded;

            approved.Add(id);
        }

        if (approved.Count > 0)
        {
            var loggerIds = pointsPerLogger.Keys.ToList();
            var loggers = await db.Users.Where(u => loggerIds.Contains(u.Id)).ToListAsync(ct);

            foreach (var logger in loggers)
            {
                logger.LifetimePoints += pointsPerLogger[logger.Id];
            }

            try
            {
                await db.SaveChangesAsync(ct);
            }
            catch (DbUpdateConcurrencyException)
            {
                // Status is a concurrency token, so one log decided elsewhere fails the whole save.
                // Left as all-or-nothing rather than retried: the caller refreshes, and a refreshed
                // queue will not offer the decided log again. Silently retrying a partially stale
                // batch would be harder to reason about than asking for a fresh one.
                return BulkApproveResult.Failed(ActivityLogStatusCode.Conflict);
            }
        }

        // Same reasoning as ApproveAsync: a bulk approval can push someone past the first-chore or
        // lifetime-points thresholds, and waiting for settlement would delay the badge by a day.
        foreach (var loggerId in pointsPerLogger.Keys)
        {
            await progression.EvaluateBadgesAsync(loggerId, ct);
        }

        return BulkApproveResult.Ok(new BulkApproveResponse(approved, skipped));
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
