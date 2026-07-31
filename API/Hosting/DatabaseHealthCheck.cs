using API.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace API.Hosting;

/// <summary>
/// Whether the database is reachable — the substance behind <c>GET /health</c>.
/// </summary>
/// <remarks>
/// Hand-rolled rather than <c>AddDbContextCheck</c>, which lives in a separate package. This is a single
/// <see cref="RelationalDatabaseFacadeExtensions"/> call, and a dependency taken on for one call is a
/// dependency to keep patched forever.
/// <para>
/// The exception is attached to the result for the server log but never reaches the response: the
/// endpoint is anonymous, and an anonymous endpoint should not describe why the database is unhappy —
/// the same disclosure rule as <c>GlobalExceptionHandler</c> in task [33].
/// </para>
/// </remarks>
public class DatabaseHealthCheck(AppDbContext db) : IHealthCheck
{
    public async Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken cancellationToken = default)
    {
        try
        {
            return await db.Database.CanConnectAsync(cancellationToken)
                ? HealthCheckResult.Healthy()
                : HealthCheckResult.Unhealthy("The database is not reachable.");
        }
        catch (Exception exception)
        {
            return HealthCheckResult.Unhealthy("The database is not reachable.", exception);
        }
    }
}
