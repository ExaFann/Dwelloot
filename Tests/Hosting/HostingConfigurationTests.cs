using API.Hosting;

namespace Dwelloot.Tests.Hosting;

public class HostingConfigurationTests
{
    [Theory]
    [InlineData("8080", "http://0.0.0.0:8080")]
    [InlineData("10000", "http://0.0.0.0:10000")]
    [InlineData("1", "http://0.0.0.0:1")]
    [InlineData("65535", "http://0.0.0.0:65535")]
    public void A_valid_PORT_becomes_a_bind_url(string port, string expected) =>
        Assert.Equal(expected, HostingConfiguration.BindUrlFromPortVariable(port));

    [Fact]
    public void The_bind_address_is_all_interfaces_not_loopback()
    {
        // Inside a container the request arrives on the container's own address, so a localhost binding
        // refuses it and the platform sees a dead port. This is the difference between a deploy that
        // works and one that reports success while every request times out.
        var url = HostingConfiguration.BindUrlFromPortVariable("8080");

        Assert.StartsWith("http://0.0.0.0:", url);
        Assert.DoesNotContain("localhost", url);
        Assert.DoesNotContain("127.0.0.1", url);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("not-a-port")]
    [InlineData("0")]
    [InlineData("-1")]
    [InlineData("65536")]
    [InlineData("99999999999")]
    public void An_absent_or_unusable_PORT_leaves_the_host_configuration_alone(string? port)
    {
        // Null rather than a throw or a guessed default. Absent is the normal local case, where
        // ASPNETCORE_URLS and launchSettings.json must still win; malformed is a cosmetic mistake that
        // should not become an outage, and the platform's own health check will surface the real
        // problem soon enough.
        Assert.Null(HostingConfiguration.BindUrlFromPortVariable(port));
    }

    [Theory]
    [InlineData(true, false)]
    [InlineData(false, true)]
    public void Migrate_on_startup_defaults_to_off_in_development_and_on_elsewhere(bool isDevelopment, bool expected)
    {
        // Both directions, because a default that ignored its argument would satisfy either one alone.
        // Locally migrations stay a deliberate `dotnet ef database update`, so generating one and then
        // running the app cannot apply it by surprise; deployed, the schema follows the code because
        // several free tiers have no release-command step.
        Assert.Equal(expected, HostingConfiguration.ShouldMigrateOnStartup(null, isDevelopment));
    }

    [Theory]
    [InlineData("true", true)]
    [InlineData("false", false)]
    [InlineData("True", true)]
    [InlineData("FALSE", false)]
    public void An_explicit_setting_beats_the_default_in_both_environments(string configured, bool expected)
    {
        Assert.Equal(expected, HostingConfiguration.ShouldMigrateOnStartup(configured, isDevelopment: true));
        Assert.Equal(expected, HostingConfiguration.ShouldMigrateOnStartup(configured, isDevelopment: false));
    }

    [Theory]
    [InlineData("yes")]
    [InlineData("1")]
    [InlineData("")]
    public void An_unparseable_setting_falls_back_to_the_environment_default(string configured)
    {
        // "1" is worth pinning: it reads as true to a person and is not a bool to .NET. Falling back to
        // the environment default is the safe reading - it cannot turn migrations on in Development by
        // accident, nor off in production.
        Assert.False(HostingConfiguration.ShouldMigrateOnStartup(configured, isDevelopment: true));
        Assert.True(HostingConfiguration.ShouldMigrateOnStartup(configured, isDevelopment: false));
    }

    [Theory]
    [InlineData("http://+:5000")]
    [InlineData("http://0.0.0.0:1234")]
    [InlineData("https://+:443;http://+:80")]
    public void An_already_configured_ASPNETCORE_URLS_wins_over_PORT(string urls)
    {
        // Azure App Service sets ASPNETCORE_URLS itself and may also expose PORT. If the two disagreed,
        // UseUrls would win and bind the one the platform is not routing to - a deploy that reports
        // success while every request times out, which is the exact failure PORT handling exists to
        // prevent. Render, Railway and Fly set only PORT, so this changes nothing there.
        Assert.Null(HostingConfiguration.BindUrlFromPortVariable("8080", urls));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void A_blank_ASPNETCORE_URLS_does_not_count_as_configured(string? urls) =>
        Assert.Equal("http://0.0.0.0:8080", HostingConfiguration.BindUrlFromPortVariable("8080", urls));
}
