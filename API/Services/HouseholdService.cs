using API.Data;
using API.Entities;
using Microsoft.EntityFrameworkCore;

namespace API.Services;

public enum CreateHouseholdStatus
{
    Created,
    UserNotFound,
    AlreadyInHousehold,
    CouldNotGenerateInviteCode
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
    AlreadyInHousehold,
    InviteCodeNotFound,
    HouseholdFull
}

public sealed record JoinHouseholdResult(JoinHouseholdStatus Status, Household? Household)
{
    public static JoinHouseholdResult Ok(Household household) => new(JoinHouseholdStatus.Joined, household);

    public static JoinHouseholdResult Failed(JoinHouseholdStatus status) => new(status, null);
}

public interface IHouseholdService
{
    Task<CreateHouseholdResult> CreateAsync(int userId, string name, CancellationToken ct = default);

    Task<JoinHouseholdResult> JoinAsync(int userId, string inviteCode, CancellationToken ct = default);
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

        var inviteCode = await GenerateUnusedInviteCodeAsync(ct);
        if (inviteCode is null)
        {
            return CreateHouseholdResult.Failed(CreateHouseholdStatus.CouldNotGenerateInviteCode);
        }

        var household = new Household
        {
            Name = name,
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

        // Also what makes "join your own household" impossible: creating one assigns you to it.
        if (user.HouseholdId is not null)
        {
            return JoinHouseholdResult.Failed(JoinHouseholdStatus.AlreadyInHousehold);
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
