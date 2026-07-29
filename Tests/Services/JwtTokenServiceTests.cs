using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using API.Entities;
using API.Services;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace Dwelloot.Tests.Services;

public class JwtTokenServiceTests
{
    private const string Key = "a-test-signing-key-that-is-long-enough-32";
    private const string OtherKey = "a-DIFFERENT-signing-key-also-long-enough!";

    private static JwtTokenService ServiceWith(string key = Key, int expiryMinutes = 60) =>
        new(Options.Create(new JwtOptions
        {
            Issuer = "Dwelloot",
            Audience = "DwellootClient",
            Key = key,
            ExpiryMinutes = expiryMinutes
        }));

    private static User SampleUser() => new()
    {
        Id = 42,
        Name = "Alex",
        Email = "alex@example.com",
        UserName = "alex@example.com"
    };

    private static TokenValidationParameters ValidationWith(string key) => new()
    {
        ValidateIssuer = true,
        ValidIssuer = "Dwelloot",
        ValidateAudience = true,
        ValidAudience = "DwellootClient",
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = JwtTokenService.SigningKey(key),
        ValidateLifetime = true,
        ClockSkew = TimeSpan.Zero
    };

    [Fact]
    public void CreateToken_carries_the_user_id_and_name()
    {
        var token = new JwtSecurityTokenHandler().ReadJwtToken(ServiceWith().CreateToken(SampleUser()));

        Assert.Equal("42", token.Claims.Single(c => c.Type == JwtRegisteredClaimNames.Sub).Value);
        Assert.Equal("Alex", token.Claims.Single(c => c.Type == JwtRegisteredClaimNames.Name).Value);
        Assert.Equal("alex@example.com", token.Claims.Single(c => c.Type == JwtRegisteredClaimNames.Email).Value);
    }

    [Fact]
    public void CreateToken_takes_expiry_from_configuration()
    {
        var token = new JwtSecurityTokenHandler().ReadJwtToken(ServiceWith(expiryMinutes: 5).CreateToken(SampleUser()));

        var minutesOut = (token.ValidTo - DateTime.UtcNow).TotalMinutes;

        // Bounded rather than exact, since issuing takes non-zero time.
        Assert.InRange(minutesOut, 4, 5.1);
    }

    [Fact]
    public void CreateToken_produces_a_token_that_validates_against_the_configured_key()
    {
        var raw = ServiceWith().CreateToken(SampleUser());

        var principal = new JwtSecurityTokenHandler()
            .ValidateToken(raw, ValidationWith(Key), out var validated);

        Assert.NotNull(validated);
        // The id is what AuthController.Me reads back off the principal, so assert the mapped
        // claim type rather than only the raw "sub" checked above.
        Assert.Equal("42", principal.FindFirstValue(ClaimTypes.NameIdentifier));
    }

    [Fact]
    public void CreateToken_produces_a_token_that_a_different_key_rejects()
    {
        // The assertion that separates "we emit a JWT" from "we emit a JWT that cannot be forged".
        var raw = ServiceWith().CreateToken(SampleUser());

        Assert.Throws<SecurityTokenSignatureKeyNotFoundException>(() =>
            new JwtSecurityTokenHandler().ValidateToken(raw, ValidationWith(OtherKey), out _));
    }

    [Fact]
    public void CreateToken_rejects_a_null_user()
    {
        Assert.Throws<ArgumentNullException>(() => ServiceWith().CreateToken(null!));
    }
}
