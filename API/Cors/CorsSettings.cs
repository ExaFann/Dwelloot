namespace API.Cors;

/// <summary>
/// The origins the browser-based frontend is served from, bound from <c>Cors:AllowedOrigins</c>.
/// </summary>
/// <remarks>
/// Configuration rather than code, because the frontend does not exist yet (task [38]) and its deployed
/// origin is not known until task [60] — the same pattern as the connection string and the JWT key: a
/// local default in <c>appsettings.json</c>, overridden by <c>Cors__AllowedOrigins__0</c> and friends
/// when deployed.
/// </remarks>
public class CorsSettings
{
    public const string SectionName = "Cors";

    /// <summary>The policy name; there is only one.</summary>
    public const string PolicyName = "Frontend";

    public string[] AllowedOrigins { get; set; } = [];

    /// <summary>
    /// The configured origins in the form a browser actually sends them.
    /// </summary>
    /// <remarks>
    /// Exists for one specific misconfiguration: <c>https://dwelloot.example.com/</c> never matches.
    /// The <c>Origin</c> header is scheme + host + port with <b>no</b> trailing slash, and ASP.NET Core
    /// compares the configured string literally — so setting the deployed origin by copying it out of a
    /// browser's address bar, which is what a person does, fails silently at the worst moment.
    /// <para>
    /// A trailing slash is forgiven and whitespace is trimmed. A path, query or fragment is deliberately
    /// <b>not</b> stripped: <c>https://app.example.com/callback</c> is a mistake the deployer needs to
    /// see, and quietly repairing it would teach the wrong lesson about what an origin is. Case is
    /// preserved for the same reason — the comparison is literal, so silently lower-casing would diverge
    /// from what the browser sends.
    /// </para>
    /// </remarks>
    public string[] NormalizedOrigins => AllowedOrigins
        .Select(origin => origin?.Trim().TrimEnd('/') ?? string.Empty)
        .Where(origin => origin.Length > 0)
        .Distinct(StringComparer.Ordinal)
        .ToArray();
}
