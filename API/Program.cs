using API.Data;
using API.Services;
using Microsoft.EntityFrameworkCore;

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

builder.Services.AddControllers();
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();

app.UseAuthorization();

app.MapControllers();

app.Run();
