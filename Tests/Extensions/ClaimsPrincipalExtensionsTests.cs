using System.Security.Claims;
using API.Extensions;
using Microsoft.IdentityModel.JsonWebTokens;

namespace Dwelloot.Tests.Extensions;

public class ClaimsPrincipalExtensionsTests
{
    private static ClaimsPrincipal PrincipalWith(params Claim[] claims) =>
        new(new ClaimsIdentity(claims, authenticationType: "Test"));

    [Theory]
    [InlineData("1", 1)]
    [InlineData("42", 42)]
    [InlineData("2147483647", int.MaxValue)]
    public void A_numeric_name_identifier_parses(string raw, int expected) =>
        Assert.Equal(expected, PrincipalWith(new Claim(ClaimTypes.NameIdentifier, raw)).GetUserId());

    [Fact]
    public void A_principal_with_no_claims_yields_null() =>
        Assert.Null(PrincipalWith().GetUserId());

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("not-a-number")]
    [InlineData("1.5")]
    [InlineData("99999999999999999999")]
    public void A_claim_that_is_not_an_int_yields_null(string raw) =>
        Assert.Null(PrincipalWith(new Claim(ClaimTypes.NameIdentifier, raw)).GetUserId());

    [Fact]
    public void The_id_is_read_from_NameIdentifier_not_from_sub()
    {
        // The subtlety worth pinning. JwtTokenService writes "sub"; the JWT handler maps it to
        // ClaimTypes.NameIdentifier before a controller sees it, which is why this reads the mapped
        // type. A change at either end of that mapping breaks every action in the API at once, so both
        // directions are asserted rather than just the happy one.
        Assert.Equal(7, PrincipalWith(new Claim(ClaimTypes.NameIdentifier, "7")).GetUserId());
        Assert.Null(PrincipalWith(new Claim(JwtRegisteredClaimNames.Sub, "7")).GetUserId());
    }

    [Fact]
    public void An_unauthenticated_principal_yields_null()
    {
        // What a request with no token produces once the JWT middleware has run.
        Assert.Null(new ClaimsPrincipal(new ClaimsIdentity()).GetUserId());
    }
}
