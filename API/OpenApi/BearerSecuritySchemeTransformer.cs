using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi;

namespace API.OpenApi;

/// <summary>
/// Puts the JWT bearer scheme into the OpenAPI document, so Scalar's "send request" button can
/// authenticate.
/// </summary>
/// <remarks>
/// Without this the document lists thirty-odd endpoints that all answer 401, because everything except
/// register and login is <c>[Authorize]</c> — the page would be a listing rather than something you can
/// try. This is the difference between Scalar being useful in the submission video and being decorative.
/// </remarks>
public sealed class BearerSecuritySchemeTransformer(IAuthenticationSchemeProvider schemeProvider)
    : IOpenApiDocumentTransformer
{
    public const string SchemeName = "Bearer";

    public async Task TransformAsync(
        OpenApiDocument document,
        OpenApiDocumentTransformerContext context,
        CancellationToken cancellationToken)
    {
        // Read the registered schemes rather than assume one. If JWT authentication is ever removed or
        // renamed, the document should stop advertising it instead of describing a scheme that no longer
        // exists - a lying document is worse than a bare one.
        var schemes = await schemeProvider.GetAllSchemesAsync();
        if (schemes.All(scheme => scheme.Name != SchemeName))
        {
            return;
        }

        document.Components ??= new OpenApiComponents();
        document.Components.SecuritySchemes ??= new Dictionary<string, IOpenApiSecurityScheme>();

        document.Components.SecuritySchemes[SchemeName] = new OpenApiSecurityScheme
        {
            Type = SecuritySchemeType.Http,
            Scheme = "bearer",
            BearerFormat = "JWT",
            In = ParameterLocation.Header,
            Description =
                "Paste the token from POST /api/auth/login. Scalar adds the Authorization header for you."
        };

        // Applied at the document level rather than per operation: the two anonymous endpoints simply
        // ignore a bearer token, whereas listing the requirement on ~30 operations individually would
        // have to be kept in step with every new controller.
        document.Security =
        [
            new OpenApiSecurityRequirement
            {
                [new OpenApiSecuritySchemeReference(SchemeName, document)] = []
            }
        ];
    }
}
