using System.Security.Claims;

namespace API.Extensions;

public static class ClaimsPrincipalExtensions
{
    /// <summary>
    /// The authenticated user's id, or null if the token carries no usable identifier.
    /// </summary>
    /// <remarks>
    /// <see cref="JwtRegisteredClaimNames.Sub"/> is written by <c>JwtTokenService</c> and mapped
    /// to <see cref="ClaimTypes.NameIdentifier"/> by the JWT handler, which is why this reads the
    /// mapped type rather than "sub".
    /// </remarks>
    public static int? GetUserId(this ClaimsPrincipal principal)
    {
        var raw = principal.FindFirstValue(ClaimTypes.NameIdentifier);

        return int.TryParse(raw, out var id) ? id : null;
    }
}
