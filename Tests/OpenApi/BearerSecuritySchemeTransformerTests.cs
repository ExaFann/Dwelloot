using API.OpenApi;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi;

namespace Dwelloot.Tests.OpenApi;

public class BearerSecuritySchemeTransformerTests
{
    /// <summary>Returns exactly the schemes it was constructed with, so "no JWT registered" is testable.</summary>
    private sealed class StubSchemeProvider(params string[] names) : IAuthenticationSchemeProvider
    {
        private readonly List<AuthenticationScheme> schemes =
            names.Select(n => new AuthenticationScheme(n, n, typeof(JwtBearerHandler))).ToList();

        public Task<IEnumerable<AuthenticationScheme>> GetAllSchemesAsync() =>
            Task.FromResult<IEnumerable<AuthenticationScheme>>(schemes);

        public Task<AuthenticationScheme?> GetSchemeAsync(string name) =>
            Task.FromResult(schemes.FirstOrDefault(s => s.Name == name));

        public void AddScheme(AuthenticationScheme scheme) => schemes.Add(scheme);

        public void RemoveScheme(string name) => schemes.RemoveAll(s => s.Name == name);

        public Task<AuthenticationScheme?> GetDefaultAuthenticateSchemeAsync() => Task.FromResult<AuthenticationScheme?>(null);
        public Task<AuthenticationScheme?> GetDefaultChallengeSchemeAsync() => Task.FromResult<AuthenticationScheme?>(null);
        public Task<AuthenticationScheme?> GetDefaultForbidSchemeAsync() => Task.FromResult<AuthenticationScheme?>(null);
        public Task<AuthenticationScheme?> GetDefaultSignInSchemeAsync() => Task.FromResult<AuthenticationScheme?>(null);
        public Task<AuthenticationScheme?> GetDefaultSignOutSchemeAsync() => Task.FromResult<AuthenticationScheme?>(null);
        public Task<IEnumerable<AuthenticationScheme>> GetRequestHandlerSchemesAsync() =>
            Task.FromResult<IEnumerable<AuthenticationScheme>>([]);
    }

    private static async Task<OpenApiDocument> TransformAsync(params string[] registeredSchemes)
    {
        var document = new OpenApiDocument();

        await new BearerSecuritySchemeTransformer(new StubSchemeProvider(registeredSchemes))
            .TransformAsync(document, null!, CancellationToken.None);

        return document;
    }

    [Fact]
    public async Task The_bearer_scheme_is_added_as_http_bearer_with_the_JWT_format()
    {
        var document = await TransformAsync(BearerSecuritySchemeTransformer.SchemeName);

        var scheme = Assert.Contains(
            BearerSecuritySchemeTransformer.SchemeName,
            (IDictionary<string, IOpenApiSecurityScheme>)document.Components!.SecuritySchemes!);

        Assert.Equal(SecuritySchemeType.Http, scheme.Type);
        Assert.Equal("bearer", scheme.Scheme);
        Assert.Equal("JWT", scheme.BearerFormat);
        Assert.Equal(ParameterLocation.Header, scheme.In);
    }

    [Fact]
    public async Task Nothing_is_added_when_no_JWT_scheme_is_registered()
    {
        // The transformer reads the registered schemes rather than assuming, so removing or renaming JWT
        // authentication makes the document stop advertising it. A document that describes a scheme the
        // app no longer has is worse than one that describes none.
        var document = await TransformAsync("Cookies");

        Assert.Null(document.Components?.SecuritySchemes);
        Assert.Null(document.Security);
    }

    [Fact]
    public async Task The_document_carries_the_security_requirement_so_Scalar_sends_the_header()
    {
        var document = await TransformAsync(BearerSecuritySchemeTransformer.SchemeName);

        var requirement = Assert.Single(document.Security!);
        Assert.Single(requirement);
    }

    [Fact]
    public async Task Running_the_transformer_twice_does_not_duplicate_anything()
    {
        var document = new OpenApiDocument();
        var transformer = new BearerSecuritySchemeTransformer(
            new StubSchemeProvider(BearerSecuritySchemeTransformer.SchemeName));

        await transformer.TransformAsync(document, null!, CancellationToken.None);
        await transformer.TransformAsync(document, null!, CancellationToken.None);

        Assert.Single(document.Components!.SecuritySchemes!);
        Assert.Single(document.Security!);
    }

    [Fact]
    public async Task An_existing_components_section_is_not_replaced()
    {
        // The transformer runs alongside whatever else has already populated the document, so it must
        // add to Components rather than assign over it.
        var document = new OpenApiDocument
        {
            Components = new OpenApiComponents
            {
                Schemas = new Dictionary<string, IOpenApiSchema> { ["Existing"] = new OpenApiSchema() }
            }
        };

        await new BearerSecuritySchemeTransformer(
                new StubSchemeProvider(BearerSecuritySchemeTransformer.SchemeName))
            .TransformAsync(document, null!, CancellationToken.None);

        Assert.True(document.Components!.Schemas!.ContainsKey("Existing"));
        Assert.True(document.Components.SecuritySchemes!.ContainsKey(BearerSecuritySchemeTransformer.SchemeName));
    }
}
