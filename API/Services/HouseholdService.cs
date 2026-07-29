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

public interface IHouseholdService
{
    Task<CreateHouseholdResult> CreateAsync(int userId, string name, CancellationToken ct = default);
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
