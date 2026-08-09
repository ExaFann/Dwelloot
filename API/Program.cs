using System.Text;
using System.Text.Json.Serialization;
using API.Data;
using API.Cors;
using API.Errors;
using API.Hosting;
using API.OpenApi;
using API.Entities;
using API.Services;
using API.Services.Competitions;
using API.Services.Progression;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

// Render, Railway and Fly.io publish the port to bind in PORT; ASP.NET Core does not read it. Without
// this the platform routes to a port nothing is listening on, and the deploy reports success while every
// request times out (task [37]). Left alone when PORT is absent, so ASPNETCORE_URLS and
// launchSettings.json still win locally.
var bindUrl = HostingConfiguration.BindUrlFromPortVariable(
    Environment.GetEnvironmentVariable("PORT"),
    Environment.GetEnvironmentVariable("ASPNETCORE_URLS"));
if (bindUrl is not null)
{
    builder.WebHost.UseUrls(bindUrl);
}

// Add services to the container.

// The password is deliberately absent from every checked-in appsettings file.
// Supply it locally with user secrets, and in production with the
// ConnectionStrings__Default environment variable. See README/specs for setup.
var connectionString = builder.Configuration.GetConnectionString("Default");
if (string.IsNullOrWhiteSpace(connectionString))
{
    throw new InvalidOperationException(
        "Connection string 'ConnectionStrings:Default' is not configured. Set it with " +
        "'dotnet user-secrets set \"ConnectionStrings:Default\" \"...\"' for local development, " +
        "or the ConnectionStrings__Default environment variable when deployed.");
}

// Snake_case keeps the physical schema identical to the relational model.md, and
// matches PostgreSQL convention, instead of EF's default quoted "Households"."InviteCode".
builder.Services.AddDbContext<AppDbContext>(options => options
    .UseNpgsql(connectionString)
    .UseSnakeCaseNamingConvention());

builder.Services.AddScoped<IDefaultCatalogCopier, DefaultCatalogCopier>();
builder.Services.AddScoped<IInviteCodeGenerator, InviteCodeGenerator>();
builder.Services.AddScoped<IHouseholdService, HouseholdService>();
builder.Services.AddScoped<IActivityService, ActivityService>();
builder.Services.AddScoped<IRewardService, RewardService>();
builder.Services.AddScoped<IRewardChangeService, RewardChangeService>();
builder.Services.AddScoped<IProgressionService, ProgressionService>();
builder.Services.AddScoped<IRedemptionService, RedemptionService>();
builder.Services.AddScoped<IBadgeQueryService, BadgeQueryService>();
builder.Services.AddScoped<IActivityLogService, ActivityLogService>();

// Days are local, not UTC: this app's users are UTC+12/+13, so a UTC boundary would fall at noon
// local and the evening dishes would count toward tomorrow's duel. One config value rather than a
// hard-coded assumption; per-household zones are the long-term answer (see log 023).
var competitionTimeZoneId = builder.Configuration["Competition:TimeZone"] ?? PeriodCalculator.DefaultTimeZoneId;
builder.Services.AddSingleton<IPeriodCalculator>(
    new PeriodCalculator(TimeZoneInfo.FindSystemTimeZoneById(competitionTimeZoneId)));

builder.Services.AddScoped<ICompetitionSettlementService, CompetitionSettlementService>();
builder.Services.AddScoped<ICompetitionHistoryService, CompetitionHistoryService>();
builder.Services.AddScoped<ICompetitionQueryService, CompetitionQueryService>();

// Random.Shared is thread-safe; the roller takes a Random so tests can seed it and assert the
// weighting rather than assume it.
builder.Services.AddSingleton<ILootBoxRoller>(new LootBoxRoller(Random.Shared));
builder.Services.AddScoped<ILootBoxService, LootBoxService>();

// The signing key is a secret and, like the connection string, never appears in a committed
// file - user secrets locally, Jwt__Key in production. Fail fast at boot rather than at first
// token issue, and check the length here because HMAC-SHA256 silently needs >= 256 bits.
var jwtOptions = builder.Configuration.GetSection(JwtOptions.SectionName).Get<JwtOptions>()
    ?? throw new InvalidOperationException($"Configuration section '{JwtOptions.SectionName}' is missing.");

if (Encoding.UTF8.GetByteCount(jwtOptions.Key) < JwtOptions.MinimumKeyBytes)
{
    throw new InvalidOperationException(
        $"'{JwtOptions.SectionName}:Key' must be at least {JwtOptions.MinimumKeyBytes} bytes. Set it with " +
        $"'dotnet user-secrets set \"{JwtOptions.SectionName}:Key\" \"...\"' for local development, " +
        "or the Jwt__Key environment variable when deployed.");
}

builder.Services.Configure<JwtOptions>(builder.Configuration.GetSection(JwtOptions.SectionName));
builder.Services.AddScoped<ITokenService, JwtTokenService>();

// AddIdentityCore, not AddIdentity, and no AddRoles: the app has no RBAC, and AppDbContext is an
// IdentityUserContext with no role stores (see log 003). AddDefaultTokenProviders is skipped
// too - it exists for password reset and email confirmation, neither of which is in scope.
builder.Services
    .AddIdentityCore<User>(options =>
    {
        // Raised from Identity's default of 6.
        options.Password.RequiredLength = 8;
        options.Password.RequireDigit = true;
        options.Password.RequireLowercase = true;
        options.Password.RequireUppercase = true;

        // Relaxed from the default. NIST SP 800-63B advises against composition rules like this -
        // they push users toward predictable substitutions rather than adding real entropy. The
        // length requirement above is raised to compensate rather than as a straight weakening.
        options.Password.RequireNonAlphanumeric = false;

        options.User.RequireUniqueEmail = true;

        // Turns unlimited online password guessing into a rate-limited attack.
        options.Lockout.MaxFailedAccessAttempts = 5;
        options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
    })
    .AddEntityFrameworkStores<AppDbContext>()
    .AddSignInManager();

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = jwtOptions.Issuer,
            ValidateAudience = true,
            ValidAudience = jwtOptions.Audience,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = JwtTokenService.SigningKey(jwtOptions.Key),
            ValidateLifetime = true,
            // Default is a 5-minute grace period on expiry; this app has no clock-skew problem
            // worth trading token lifetime accuracy for.
            ClockSkew = TimeSpan.Zero
        };
    });

builder.Services.AddAuthorization();

// Enums as strings both ways. api-design.md specifies "status": "Pending", and System.Text.Json
// emits 0 by default. Registered globally rather than per-DTO because every status and category
// the API exposes has the same requirement.
builder.Services
    .AddControllers()
    .AddJsonOptions(options =>
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()));

// Model validation is the one place the framework produces an error body of its own, and it used to be
// the only response in the API shaped like ProblemDetails. Replaced so a failed annotation looks like
// every other error - the per-field map is kept, since that is what the frontend's forms need (task [33]).
builder.Services.Configure<ApiBehaviorOptions>(options =>
{
    options.InvalidModelStateResponseFactory = context =>
    {
        var errors = context.ModelState
            .Where(entry => entry.Value?.Errors.Count > 0)
            .ToDictionary(
                entry => entry.Key,
                entry => entry.Value!.Errors.Select(e => e.ErrorMessage).ToArray());

        return new BadRequestObjectResult(
            ApiErrorResponse.For(context.HttpContext, "One or more fields are invalid.", errors));
    };
});

// IExceptionHandler is how UseExceptionHandler is extended in .NET 8+; the commit plan's "middleware"
// wording predates it. Details are never returned, in any environment - see GlobalExceptionHandler.
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();

// Named origins, never AllowAnyOrigin - that would make the whole policy decorative, and it is the usual
// way this gets "fixed" when a frontend cannot connect. The list is configuration because the frontend's
// deployed origin is not known until task [60].
//
// No AllowCredentials, deliberately: authentication is a JWT in the Authorization header, not a cookie,
// so nothing needs the browser to attach anything automatically - which removes the CORS-plus-cookie
// CSRF surface entirely rather than mitigating it.
var corsSettings = builder.Configuration.GetSection(CorsSettings.SectionName).Get<CorsSettings>()
    ?? new CorsSettings();

// TLS terminates at the platform's edge, so the app receives plain HTTP with X-Forwarded-Proto: https.
// Without this Request.Scheme is "http", UseHttpsRedirection issues a 307 to https, the edge forwards it
// back as HTTP, and every request loops until the browser gives up - preflights included, which would
// surface as a CORS failure whose real cause is this (task [37]).
//
// KnownProxies and KnownNetworks are cleared deliberately: the headers are trusted from any peer, which
// is wrong on a network where an attacker can reach the app directly and right behind a PaaS edge that
// is the only route in.
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.KnownIPNetworks.Clear();
    options.KnownProxies.Clear();
});

// Reports whether the database is reachable. Platforms poll one, and it is the "at least one endpoint is
// reachable live" check task [37] is measured by.
// A hand-rolled check rather than AddDbContextCheck, which lives in a separate package: this is one
// CanConnectAsync call, and a dependency added for one call is a dependency to keep patched forever.
builder.Services.AddHealthChecks().AddCheck<DatabaseHealthCheck>("database");

builder.Services.AddCors(options => options.AddPolicy(
    CorsSettings.PolicyName,
    policy => policy
        .WithOrigins(corsSettings.NormalizedOrigins)
        .AllowAnyHeader()
        .AllowAnyMethod()));

// The transformer is what makes the document usable rather than merely accurate: without the bearer
// scheme, every [Authorize] endpoint in Scalar answers 401 and the page cannot be tried (task [34]).
builder.Services.AddOpenApi(options =>
    options.AddDocumentTransformer<BearerSecuritySchemeTransformer>());

var app = builder.Build();

// Configure the HTTP request pipeline.

// Before anything that reads the scheme or the client address - which is UseHttpsRedirection, the CORS
// origin comparison and the error middleware's logging.
app.UseForwardedHeaders();

// First, so it wraps everything after it. Deliberately not inside an IsDevelopment check and
// deliberately not paired with a developer exception page: one error shape in every environment, and
// this project only ever runs in Development, so an environment-gated handler could never be verified.
app.UseExceptionHandler(_ => { });

// Fills in a body for responses that carry a status but no content - the bare 401 from JWT
// authentication and the 404 for an unmatched route. Both returned nothing at all before task [33],
// which forced a client to special-case "error with no body".
app.UseStatusCodePages(async context =>
{
    var response = context.HttpContext.Response;

    response.ContentType = "application/json";
    await response.WriteAsJsonAsync(ApiErrorResponse.For(
        context.HttpContext,
        response.StatusCode switch
        {
            StatusCodes.Status401Unauthorized => "Authentication is required.",
            StatusCodes.Status403Forbidden => "You do not have access to that.",
            StatusCodes.Status404NotFound => "That endpoint does not exist.",
            _ => "Request failed."
        }));
});

// Before UseHttpsRedirection, and that ordering is the non-obvious part: a CORS preflight is an OPTIONS
// request, and browsers do not follow redirects for preflight - a 307 to https:// fails it outright and
// the real request is never sent. With CORS first the preflight is answered and short-circuits before
// any redirect can happen.
//
// After the error middleware, so a 500 still carries the CORS headers. Otherwise a browser reports
// "blocked by CORS policy" instead of the actual error, which is a bad afternoon for whoever is
// debugging the frontend.
app.UseCors(CorsSettings.PolicyName);

// Logged rather than enforced. An empty list is not fatal - the API still serves Scalar and any
// non-browser client - so a deployment that forgot Cors__AllowedOrigins__0 shows the reason in its own
// logs instead of presenting as an inexplicable browser error.
app.Logger.LogInformation(
    "CORS allowed origins: {Origins}",
    corsSettings.NormalizedOrigins.Length > 0
        ? string.Join(", ", corsSettings.NormalizedOrigins)
        : "(none configured - browser clients will be blocked)");

app.MapOpenApi();

app.MapScalarApiReference(options => options
    .WithTitle("Dwelloot API")
    .WithTheme(ScalarTheme.Purple)
    .AddPreferredSecuritySchemes(BearerSecuritySchemeTransformer.SchemeName));

app.UseHttpsRedirection();

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

// Anonymous and detail-free: 200 or 503 and nothing else. An unauthenticated endpoint should not
// describe why the database is unhappy.
app.MapHealthChecks("/health", new HealthCheckOptions { ResponseWriter = (context, _) => Task.CompletedTask });

// Applied here rather than by a release command, because several free tiers do not have one and a first
// deploy would otherwise connect fine and then fail every query. Off in Development, where migrations
// stay a deliberate `dotnet ef database update` - see HostingConfiguration.ShouldMigrateOnStartup.
if (HostingConfiguration.ShouldMigrateOnStartup(
        builder.Configuration[HostingConfiguration.MigrateOnStartupKey],
        app.Environment.IsDevelopment()))
{
    app.Logger.LogInformation("Applying database migrations on startup.");

    using var scope = app.Services.CreateScope();
    await scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.MigrateAsync();
}

app.Run();
