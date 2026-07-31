using System.Text;
using System.Text.Json.Serialization;
using API.Data;
using API.Errors;
using API.Entities;
using API.Services;
using API.Services.Competitions;
using API.Services.Progression;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

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

// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();

var app = builder.Build();

// Configure the HTTP request pipeline.

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

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.Run();
