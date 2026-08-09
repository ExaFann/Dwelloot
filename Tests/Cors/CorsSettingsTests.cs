using API.Cors;
using Microsoft.Extensions.Configuration;

namespace Dwelloot.Tests.Cors;

public class CorsSettingsTests
{
    private static string[] Normalize(params string[] origins) =>
        new CorsSettings { AllowedOrigins = origins }.NormalizedOrigins;

    [Theory]
    [InlineData("https://app.example.com/", "https://app.example.com")]
    [InlineData("https://app.example.com//", "https://app.example.com")]
    [InlineData("http://localhost:5173/", "http://localhost:5173")]
    public void A_trailing_slash_is_stripped(string configured, string expected)
    {
        // The misconfiguration this exists for. A browser's Origin header is scheme + host + port with
        // no trailing slash, and ASP.NET Core compares the configured string literally - so an origin
        // copied out of an address bar never matches, and fails silently at the worst moment.
        Assert.Equal([expected], Normalize(configured));
    }

    [Theory]
    [InlineData("  https://app.example.com  ")]
    [InlineData("\thttps://app.example.com\n")]
    [InlineData(" https://app.example.com/ ")]
    public void Surrounding_whitespace_is_trimmed(string configured)
    {
        // An environment variable set from a copied value often keeps it.
        Assert.Equal(["https://app.example.com"], Normalize(configured));
    }

    [Fact]
    public void Blank_entries_are_dropped_rather_than_becoming_an_empty_origin()
    {
        // An origin of "" matches nothing and would hide the typo that produced it.
        Assert.Equal(
            ["https://app.example.com"],
            Normalize("https://app.example.com", "", "   ", "\t", "/"));
    }

    [Theory]
    [InlineData("https://app.example.com/callback")]
    [InlineData("https://app.example.com/a/b")]
    [InlineData("https://app.example.com?x=1")]
    [InlineData("https://app.example.com#frag")]
    public void A_path_query_or_fragment_is_left_alone(string configured)
    {
        // Deliberately not repaired. These are mistakes the deployer needs to see: quietly turning
        // ".../callback" into a working origin would teach the wrong lesson about what an origin is.
        // Only the trailing slash - what copying an address bar actually produces - is forgiven.
        Assert.Equal([configured], Normalize(configured));
    }

    [Fact]
    public void Case_is_preserved()
    {
        // The comparison ASP.NET Core makes is literal, so lower-casing here would silently diverge from
        // whatever the browser sends.
        Assert.Equal(["https://App.Example.COM"], Normalize("https://App.Example.COM"));
    }

    [Fact]
    public void Duplicates_collapse()
    {
        Assert.Equal(
            ["https://app.example.com"],
            Normalize("https://app.example.com", "https://app.example.com/", "  https://app.example.com  "));
    }

    [Fact]
    public void Normalizing_is_idempotent()
    {
        var once = Normalize("  https://app.example.com//  ", "", "http://localhost:5173/");
        var twice = new CorsSettings { AllowedOrigins = once }.NormalizedOrigins;

        Assert.Equal(once, twice);
    }

    [Fact]
    public void An_absent_or_empty_section_yields_no_origins()
    {
        // Not fatal - the API still serves non-browser clients - so this must be an empty array rather
        // than a null that would throw inside WithOrigins.
        Assert.Empty(new CorsSettings().NormalizedOrigins);
        Assert.Empty(Normalize());
    }

    private static CorsSettings? SettingsFrom(params string[] files)
    {
        var builder = new ConfigurationBuilder();

        foreach (var file in files)
        {
            builder.AddJsonFile(Path.Combine(RepositoryRoot(), "API", file));
        }

        return builder.Build().GetSection(CorsSettings.SectionName).Get<CorsSettings>();
    }

    [Fact]
    public void The_development_defaults_are_the_two_Vite_origins()
    {
        // Pins the shipped defaults, so a typo fails a test rather than a frontend. Both spellings are
        // present on purpose: a browser sends whichever the address bar holds, and localhost and
        // 127.0.0.1 are distinct origins.
        Assert.Equal(
            ["http://localhost:5173", "http://127.0.0.1:5173"],
            SettingsFrom("appsettings.json", "appsettings.Development.json")!.NormalizedOrigins);
    }

    [Fact]
    public void The_base_configuration_ships_no_origins_at_all()
    {
        // Task [37] found why this matters. Environment-variable array overrides are applied per index,
        // so a deployment that sets Cors__AllowedOrigins__0 replaces index 0 and leaves index 1 in place
        // - a localhost dev origin shipped in appsettings.json stayed allowed in Production. The dev
        // origins now live in appsettings.Development.json, which a deployment never loads.
        Assert.Empty(SettingsFrom("appsettings.json")!.NormalizedOrigins);
    }

    private static string RepositoryRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);

        while (directory is not null && !File.Exists(Path.Combine(directory.FullName, "Dwelloot.slnx")))
        {
            directory = directory.Parent;
        }

        Assert.NotNull(directory);
        return directory.FullName;
    }
}
