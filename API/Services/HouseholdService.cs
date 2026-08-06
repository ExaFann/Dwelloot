using API.Data;
using API.Entities;
using API.Validation;
using Microsoft.EntityFrameworkCore;

namespace API.Services;

public enum CreateHouseholdStatus
{
    Created,
    UserNotFound,
    AlreadyInHousehold,
    CouldNotGenerateInviteCode,

    /// <summary>The name is blank once normalised (task [32]).</summary>
    InvalidName
}

public sealed record CreateHouseholdResult(CreateHouseholdStatus Status, Household? Household)
{
    public static CreateHouseholdResult Ok(Household household) => new(CreateHouseholdStatus.Created, household);

    public static CreateHouseholdResult Failed(CreateHouseholdStatus status) => new(status, null);
}

public enum JoinHouseholdStatus
{
    Joined,

    UserNotFound,

    /// <summary>
    /// The caller is already **paired**, so there is no way to accept another invitation without
    /// first abandoning a household that someone else also lives in. Distinct from the solo case,
    /// which task [70] now allows: a household of one is the caller's alone to leave.
    /// </summary>
    AlreadyInHousehold,

    InviteCodeNotFound,
    HouseholdFull
}

public sealed record JoinHouseholdResult(JoinHouseholdStatus Status, Household? Household)
{
    public static JoinHouseholdResult Ok(Household household) => new(JoinHouseholdStatus.Joined, household);

    public static JoinHouseholdResult Failed(JoinHouseholdStatus status) => new(status, null);
}

/// <summary>
/// Outcome of an operation that names a household by id.
/// </summary>
/// <remarks>
/// <see cref="HouseholdNotFound"/> and <see cref="NotAMember"/> are kept distinct here because
/// they are genuinely different facts. The controller collapses both to 404 so the endpoint
/// cannot be used to probe which household ids exist — that is a decision about the HTTP surface,
/// not about the domain.
/// </remarks>
public enum HouseholdAccessStatus
{
    Ok,
    UserNotFound,
    HouseholdNotFound,
    NotAMember,
    Conflict,

    /// <summary>The name is blank once normalised (task [32]).</summary>
    InvalidName
}

public sealed record HouseholdDetailsResult(HouseholdAccessStatus Status, Household? Household)
{
    public static HouseholdDetailsResult Ok(Household household) => new(HouseholdAccessStatus.Ok, household);

    public static HouseholdDetailsResult Failed(HouseholdAccessStatus status) => new(status, null);
}

public sealed record LeaveHouseholdResult(HouseholdAccessStatus Status, bool HouseholdDeleted)
{
    public static LeaveHouseholdResult Ok(bool householdDeleted) => new(HouseholdAccessStatus.Ok, householdDeleted);

    public static LeaveHouseholdResult Failed(HouseholdAccessStatus status) => new(status, false);
}

public interface IHouseholdService
{
    Task<CreateHouseholdResult> CreateAsync(int userId, string name, CancellationToken ct = default);

    Task<JoinHouseholdResult> JoinAsync(int userId, string inviteCode, CancellationToken ct = default);

    Task<HouseholdDetailsResult> GetAsync(int userId, int householdId, CancellationToken ct = default);

    Task<HouseholdDetailsResult> RenameAsync(int userId, int householdId, string name, CancellationToken ct = default);

    Task<LeaveHouseholdResult> LeaveAsync(int userId, int householdId, CancellationToken ct = default);
}

public class HouseholdService(
    AppDbContext db,
    IDefaultCatalogCopier catalogCopier,
    IInviteCodeGenerator inviteCodeGenerator) : IHouseholdService
{
    /// <summary>
    /// Attempts before giving up on finding a free invite code. At 31^6 codes this should never
    /// reach two; ten is cheap insurance against an exhausted or misbehaving generator spinning
    /// forever.
    /// </summary>
    private const int MaxInviteCodeAttempts = 10;

    public async Task<CreateHouseholdResult> CreateAsync(int userId, string name, CancellationToken ct = default)
    {
        var user = await db.Users.SingleOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null)
        {
            return CreateHouseholdResult.Failed(CreateHouseholdStatus.UserNotFound);
        }

        if (user.HouseholdId is not null)
        {
            return CreateHouseholdResult.Failed(CreateHouseholdStatus.AlreadyInHousehold);
        }

        // Normalised at the point of storage, not merely trimmed - household names were the one
        // display field that got no treatment at all before task [32].
        var cleanName = TextInput.Normalize(name);
        if (cleanName.Length == 0)
        {
            return CreateHouseholdResult.Failed(CreateHouseholdStatus.InvalidName);
        }

        var inviteCode = await GenerateUnusedInviteCodeAsync(ct);
        if (inviteCode is null)
        {
            return CreateHouseholdResult.Failed(CreateHouseholdStatus.CouldNotGenerateInviteCode);
        }

        var household = new Household
        {
            Name = cleanName,
            InviteCode = inviteCode,
            // One member so far. The join endpoint (task [15]) flips this.
            IsFull = false
        };

        db.Households.Add(household);

        // Through the navigation rather than HouseholdId, so this works before the household has
        // been inserted and has an id.
        household.Members.Add(user);

        catalogCopier.CopyDefaultsTo(household);

        // A single save creates the household, attaches the creator and inserts all twenty catalog
        // rows. This is what CopyDefaultsTo(Household) was shaped for in task [12]: an id-based
        // signature would have forced two saves, and a failure between them would leave a
        // household with an empty catalog.
        await db.SaveChangesAsync(ct);

        return CreateHouseholdResult.Ok(household);
    }

    public async Task<JoinHouseholdResult> JoinAsync(int userId, string inviteCode, CancellationToken ct = default)
    {
        var user = await db.Users.SingleOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null)
        {
            return JoinHouseholdResult.Failed(JoinHouseholdStatus.UserNotFound);
        }

        // Two people who each made their own household had no way to pair up afterwards: this
        // guard used to refuse every caller who already had one, and the pairing screen is only
        // reachable before you have joined anything. The owner found the dead end (2026-08-07).
        //
        // A household of one is the caller's alone to abandon, so joining out of it is allowed. A
        // household of *two* is not - leaving would evict the caller from a household someone else
        // also lives in, which is `POST /leave`'s job and a decision the user should make
        // explicitly rather than as a side effect of typing a code.
        Household? currentHousehold = null;
        if (user.HouseholdId is not null)
        {
            var currentMemberCount = await db.Users.CountAsync(u => u.HouseholdId == user.HouseholdId, ct);
            if (currentMemberCount > 1)
            {
                return JoinHouseholdResult.Failed(JoinHouseholdStatus.AlreadyInHousehold);
            }

            currentHousehold = await db.Households.SingleOrDefaultAsync(h => h.Id == user.HouseholdId, ct);
        }

        // The code is read off one screen and typed into another. The alphabet is uppercase, so
        // accepting "7f3k9q" costs one call and removes a failure that would look like a broken
        // code rather than a typo.
        var normalised = inviteCode.Trim().ToUpperInvariant();

        var household = await db.Households.SingleOrDefaultAsync(h => h.InviteCode == normalised, ct);
        if (household is null)
        {
            return JoinHouseholdResult.Failed(JoinHouseholdStatus.InviteCodeNotFound);
        }

        // Your own code, typed into your own screen. Previously unreachable - the blanket guard
        // above caught it - and now it must be handled, because the path below would delete the
        // household out from under the user and then try to join them to it.
        if (currentHousehold is not null && household.Id == currentHousehold.Id)
        {
            return JoinHouseholdResult.Ok(household);
        }

        // Counting actual members rather than trusting household.IsFull. IsFull is denormalised -
        // it caches a fact that really lives in users.household_id - so gating on it would let a
        // drifted flag admit a third member. Task [16]'s leave endpoint has to remember to clear
        // it, and a bug there should stay cosmetic rather than breaking this invariant.
        var memberCount = await db.Users.CountAsync(u => u.HouseholdId == household.Id, ct);
        if (memberCount >= Household.MaxMembers)
        {
            return JoinHouseholdResult.Failed(JoinHouseholdStatus.HouseholdFull);
        }

        user.HouseholdId = household.Id;
        household.IsFull = memberCount + 1 >= Household.MaxMembers;

        // The old household is now empty, so it goes - and its activities, rewards, competitions
        // and claims cascade with it, exactly as `LeaveAsync` does for a last member.
        //
        // **One SaveChanges, so this is one transaction.** That is the whole reason this lives in
        // the service rather than being a leave-then-join from the client: a client doing it in two
        // calls would delete the caller's household and *then* discover the invite code was a typo,
        // leaving them with nothing and no way back. Here a bad code returns before anything is
        // written, and a race on the target household rolls the deletion back with it.
        if (currentHousehold is not null)
        {
            db.Households.Remove(currentHousehold);
        }

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            // IsFull is a concurrency token, so this means someone else joined between the count
            // check above and this save. Without it the loser of that race would have become a
            // third member; with it they get the same clean 409 as anyone else arriving late.
            return JoinHouseholdResult.Failed(JoinHouseholdStatus.HouseholdFull);
        }

        return JoinHouseholdResult.Ok(household);
    }

    public async Task<HouseholdDetailsResult> GetAsync(int userId, int householdId, CancellationToken ct = default)
    {
        var household = await db.Households
            .Include(h => h.Members)
            .SingleOrDefaultAsync(h => h.Id == householdId, ct);

        if (household is null)
        {
            return HouseholdDetailsResult.Failed(HouseholdAccessStatus.HouseholdNotFound);
        }

        // The access check that stops this id from being an insecure direct object reference:
        // without it, GET /api/households/11 hands a stranger another household's invite code,
        // which is the credential for joining it.
        if (household.Members.All(m => m.Id != userId))
        {
            return HouseholdDetailsResult.Failed(HouseholdAccessStatus.NotAMember);
        }

        return HouseholdDetailsResult.Ok(household);
    }

    public async Task<HouseholdDetailsResult> RenameAsync(
        int userId,
        int householdId,
        string name,
        CancellationToken ct = default)
    {
        var found = await GetAsync(userId, householdId, ct);
        if (found.Status != HouseholdAccessStatus.Ok)
        {
            return found;
        }

        var cleanName = TextInput.Normalize(name);
        if (cleanName.Length == 0)
        {
            return HouseholdDetailsResult.Failed(HouseholdAccessStatus.InvalidName);
        }

        found.Household!.Name = cleanName;
        await db.SaveChangesAsync(ct);

        return found;
    }

    public async Task<LeaveHouseholdResult> LeaveAsync(int userId, int householdId, CancellationToken ct = default)
    {
        // Bounded at two attempts. is_full is a concurrency token (task [15]), so two partners
        // leaving at the same instant means one UPDATE loses; re-reading lets the loser discover
        // it is now the last member and delete the household, instead of erroring out and leaving
        // an orphaned household with zero members still holding an invite code.
        for (var attempt = 0; attempt < 2; attempt++)
        {
            var found = await GetAsync(userId, householdId, ct);
            if (found.Status != HouseholdAccessStatus.Ok)
            {
                return LeaveHouseholdResult.Failed(found.Status);
            }

            var household = found.Household!;
            var user = household.Members.Single(m => m.Id == userId);

            // Decided before mutating the collection, so the branch does not depend on the order
            // of the two lines below.
            var lastMember = household.Members.Count == 1;

            // Severing the navigation is what actually matters - EF's relationship fixup nulls
            // the foreign key as a result, so the explicit assignment is belt-and-braces rather
            // than load-bearing. Kept because it states the intent at the point of the change.
            user.HouseholdId = null;
            household.Members.Remove(user);

            if (lastMember)
            {
                // Activities, rewards, competitions and claims cascade with it. Users do not -
                // users.household_id is ON DELETE SET NULL, so people outlive the household.
                db.Households.Remove(household);
            }
            else
            {
                // Frees the slot so the remaining partner can pair with someone else. Task [15]'s
                // join guard counts real members rather than trusting this flag, precisely so a
                // mistake here stays cosmetic - but it should still be right.
                household.IsFull = false;
            }

            try
            {
                await db.SaveChangesAsync(ct);
                return LeaveHouseholdResult.Ok(lastMember);
            }
            catch (DbUpdateConcurrencyException)
            {
                // The other partner left first. Drop the stale tracked state and re-evaluate.
                foreach (var entry in db.ChangeTracker.Entries().ToList())
                {
                    await entry.ReloadAsync(ct);
                }
            }
        }

        return LeaveHouseholdResult.Failed(HouseholdAccessStatus.Conflict);
    }

    /// <summary>
    /// Finds a code not already used by a committed household.
    /// </summary>
    /// <remarks>
    /// This deterministically avoids collisions with existing rows. It does <em>not</em> close the
    /// microsecond race where two concurrent creates draw the same unused code — that is caught by
    /// the unique index <c>ix_households_invite_code</c> and surfaces as a 500. Doing so requires
    /// two simultaneous requests to collide on a 1-in-887-million draw.
    /// </remarks>
    private async Task<string?> GenerateUnusedInviteCodeAsync(CancellationToken ct)
    {
        for (var attempt = 0; attempt < MaxInviteCodeAttempts; attempt++)
        {
            var candidate = inviteCodeGenerator.Generate();

            if (!await db.Households.AnyAsync(h => h.InviteCode == candidate, ct))
            {
                return candidate;
            }
        }

        return null;
    }
}
