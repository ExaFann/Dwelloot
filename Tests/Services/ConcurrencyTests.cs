using API.Data;
using API.Entities;
using API.Services;
using API.Services.Progression;
using Microsoft.EntityFrameworkCore;

namespace Dwelloot.Tests.Services;

/// <summary>
/// The two concurrency-token catch blocks, driven by a genuine conflict.
/// </summary>
/// <remarks>
/// Coverage flagged these in task [36] as never executed. They turned out to be reachable: §4.3 lists
/// four ways the in-memory provider diverges from PostgreSQL, and honouring concurrency tokens is
/// <b>not</b> one of them — two contexts over one store racing on <see cref="ActivityLog.Status"/> or
/// <see cref="Household.IsFull"/> do raise <c>DbUpdateConcurrencyException</c>. Probed before relying
/// on it.
/// <para>
/// The three <c>DbUpdateException</c> catches elsewhere (badge unlock, settlement, loot box) are a
/// different matter: they fire on a unique-index violation, and the in-memory provider does not enforce
/// unique indexes. Those stay uncovered, and log <c>036</c> says so.
/// </para>
/// </remarks>
public class ConcurrencyTests
{
    private static async Task<User> AddUserAsync(AppDbContext db, string email)
    {
        var user = new User { Name = email.Split('@')[0], Email = email, UserName = email };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        return user;
    }

    private static HouseholdService HouseholdsFor(AppDbContext db) =>
        new(db, new DefaultCatalogCopier(db), new InviteCodeGenerator());

    [Fact]
    public async Task A_log_decided_between_the_read_and_the_write_yields_Conflict()
    {
        // The double-clicked approve button, which §3.13 calls the one plausible race here. Without the
        // concurrency token on Status both requests would award the points.
        var name = TestDbContextFactory.NewDatabaseName();
        int logId, alexId;

        using (var setup = TestDbContextFactory.Create(name))
        {
            var alex = await AddUserAsync(setup, "alex@example.com");
            var sam = await AddUserAsync(setup, "sam@example.com");
            var created = await HouseholdsFor(setup).CreateAsync(alex.Id, "Our place");
            await HouseholdsFor(setup).JoinAsync(sam.Id, created.Household!.InviteCode);

            var chore = await setup.Activities.FirstAsync(a => a.HouseholdId == created.Household.Id);
            logId = (await new ActivityLogService(setup, new ProgressionService(setup))
                .CreateAsync(sam.Id, chore.Id)).Log!.Id;
            alexId = alex.Id;
        }

        // Two independent contexts, both holding the log as Pending.
        using var first = TestDbContextFactory.Create(name);
        using var second = TestDbContextFactory.Create(name);

        var firstService = new ActivityLogService(first, new ProgressionService(first));
        var secondService = new ActivityLogService(second, new ProgressionService(second));

        // Both read before either writes.
        await first.ActivityLogs.SingleAsync(l => l.Id == logId);
        await second.ActivityLogs.SingleAsync(l => l.Id == logId);

        var winner = await firstService.ApproveAsync(alexId, logId);
        var loser = await secondService.RejectAsync(alexId, logId, "Changed my mind");

        Assert.Equal(ActivityLogStatusCode.Ok, winner.Status);
        Assert.Equal(ActivityLogStatusCode.Conflict, loser.Status);

        // Asserted through a third context: the winner's decision stands, and the loser wrote nothing.
        using var verify = TestDbContextFactory.Create(name);
        var stored = await verify.ActivityLogs.SingleAsync(l => l.Id == logId);
        Assert.Equal(ActivityLogStatus.Approved, stored.Status);
        Assert.Null(stored.RejectReason);
    }

    [Fact]
    public async Task Both_partners_leaving_at_once_resolves_rather_than_erroring()
    {
        // is_full is a concurrency token (task [15]), so one UPDATE loses. The loser re-reads and
        // discovers it is now the last member, which is what stops an orphaned household keeping a live
        // invite code. The retry is bounded at two attempts.
        var name = TestDbContextFactory.NewDatabaseName();
        int householdId, alexId, samId;

        using (var setup = TestDbContextFactory.Create(name))
        {
            var alex = await AddUserAsync(setup, "alex@example.com");
            var sam = await AddUserAsync(setup, "sam@example.com");
            var created = await HouseholdsFor(setup).CreateAsync(alex.Id, "Our place");
            await HouseholdsFor(setup).JoinAsync(sam.Id, created.Household!.InviteCode);

            householdId = created.Household.Id;
            alexId = alex.Id;
            samId = sam.Id;
        }

        using var first = TestDbContextFactory.Create(name);
        using var second = TestDbContextFactory.Create(name);

        // Both load the household while it is still full.
        await first.Households.Include(h => h.Members).SingleAsync(h => h.Id == householdId);
        await second.Households.Include(h => h.Members).SingleAsync(h => h.Id == householdId);

        var winner = await HouseholdsFor(first).LeaveAsync(alexId, householdId);
        var loser = await HouseholdsFor(second).LeaveAsync(samId, householdId);

        Assert.Equal(HouseholdAccessStatus.Ok, winner.Status);
        Assert.Equal(HouseholdAccessStatus.Ok, loser.Status);

        // The second departure was the last one, so the household goes with it - no orphan left
        // holding a usable invite code.
        Assert.True(loser.HouseholdDeleted);

        using var verify = TestDbContextFactory.Create(name);
        Assert.Empty(await verify.Households.Where(h => h.Id == householdId).ToListAsync());
        Assert.All(
            await verify.Users.Where(u => u.Id == alexId || u.Id == samId).ToListAsync(),
            u => Assert.Null(u.HouseholdId));
    }
}
