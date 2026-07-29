using API.Data;
using Microsoft.EntityFrameworkCore;

namespace Dwelloot.Tests;

/// <summary>
/// Builds a throwaway <see cref="AppDbContext"/> backed by the EF in-memory provider.
/// </summary>
/// <remarks>
/// <b>In-memory does not enforce this schema's database constraints</b> — no <c>points &gt; 0</c>,
/// no no-self-approval check, no unique indexes. It is the right tool for tests about logic over
/// data, and the wrong one for any test whose subject is a constraint. Those need a real
/// PostgreSQL database.
/// </remarks>
internal static class TestDbContextFactory
{
    public static AppDbContext Create()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            // A fresh database name per context keeps tests isolated from each other.
            .UseInMemoryDatabase($"dwelloot-tests-{Guid.NewGuid()}")
            .Options;

        return new AppDbContext(options);
    }
}
