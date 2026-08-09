namespace API.Hosting;

/// <summary>
/// The two host-level decisions a platform deployment turns on, kept out of <c>Program.cs</c> so they
/// can be tested rather than only observed.
/// </summary>
public static class HostingConfiguration
{
    public const string MigrateOnStartupKey = "Database:MigrateOnStartup";

    /// <summary>
    /// The URL to bind, derived from the <c>PORT</c> variable, or null to leave the host's own
    /// configuration alone.
    /// </summary>
    /// <remarks>
    /// Render, Railway and Fly.io publish the port to bind in <c>PORT</c>. ASP.NET Core does not read
    /// it — it reads <c>ASPNETCORE_URLS</c> and otherwise defaults to 5000/5001 — so without this the
    /// platform routes to a port nothing is listening on and the deploy reports success while every
    /// request times out. Azure App Service sets <c>ASPNETCORE_URLS</c> itself and is unaffected either
    /// way.
    /// <para>
    /// <c>0.0.0.0</c> rather than <c>localhost</c>: inside a container the request arrives on the
    /// container's own address, and a loopback binding refuses it.
    /// </para>
    /// <para>
    /// A missing, blank, non-numeric or out-of-range value returns null rather than throwing. Refusing
    /// to start over a malformed <c>PORT</c> would turn a cosmetic mistake into an outage, and the
    /// platform's own health check will report the real problem soon enough.
    /// </para>
    /// </remarks>
    public static string? BindUrlFromPortVariable(string? port, string? aspNetCoreUrls = null)
    {
        // The host has already said where to bind, so do not argue with it. Azure App Service sets
        // ASPNETCORE_URLS itself and may also expose PORT; if the two ever disagreed, UseUrls would win
        // and bind the wrong one. Render, Railway and Fly set only PORT, so this changes nothing there.
        if (!string.IsNullOrWhiteSpace(aspNetCoreUrls))
        {
            return null;
        }

        return int.TryParse(port, out var parsed) && parsed is > 0 and <= 65535
            ? $"http://0.0.0.0:{parsed}"
            : null;
    }

    /// <summary>
    /// Whether to apply pending EF migrations during startup.
    /// </summary>
    /// <remarks>
    /// Defaults to <b>false in Development and true everywhere else</b>, so neither environment needs
    /// anyone to remember a flag. Locally, migrations stay a deliberate <c>dotnet ef database update</c>
    /// — generating a migration and then running the app must not apply it by surprise. Deployed, the
    /// schema follows the code, which matters because several free tiers have no release-command step
    /// and a first deploy would otherwise connect fine and then fail every query.
    /// <para>
    /// An explicit setting wins over both. <c>Migrate()</c> is idempotent, and the usual objection —
    /// two instances racing — does not apply to a two-person app on one instance; if it ever does, the
    /// answer is a release command rather than a code change.
    /// </para>
    /// </remarks>
    public static bool ShouldMigrateOnStartup(string? configuredValue, bool isDevelopment) =>
        bool.TryParse(configuredValue, out var explicitly) ? explicitly : !isDevelopment;
}
