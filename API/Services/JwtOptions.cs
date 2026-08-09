namespace API.Services;

/// <summary>
/// JWT settings bound from the <c>Jwt</c> configuration section.
/// </summary>
/// <remarks>
/// <see cref="Key"/> is a secret and never appears in a committed file — user secrets locally,
/// the <c>Jwt__Key</c> environment variable in production. The rest are not secret and live in
/// <c>appsettings.json</c>.
/// </remarks>
public class JwtOptions
{
    public const string SectionName = "Jwt";

    /// <summary>HMAC-SHA256 needs at least a 256-bit key.</summary>
    public const int MinimumKeyBytes = 32;

    public string Issuer { get; set; } = string.Empty;

    public string Audience { get; set; } = string.Empty;

    public string Key { get; set; } = string.Empty;

    public int ExpiryMinutes { get; set; } = 60;
}
