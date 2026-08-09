using API.Data;
using Microsoft.EntityFrameworkCore;

namespace Dwelloot.Tests;

/// <summary>
/// Builds throwaway <see cref="AppDbContext"/> instances backed by the EF in-memory provider.
/// </summary>
/// <remarks>
/// <b>In-memory does not enforce this schema's database constraints</b> — no <c>points &gt; 0</c>,
/// no no-self-approval check, no unique indexes. It is the right tool for tests about logic over
/// data, and the wrong one for any test whose subject is a constraint. Those need a real
/// PostgreSQL database.
/// </remarks>
internal static class TestDbContextFactory
{
    /// <summary>A database name no other test will share.</summary>
    public static string NewDatabaseName() => $"dwelloot-tests-{Guid.NewGuid()}";

    /// <summary>
    /// Opens a context. Pass a name from <see cref="NewDatabaseName"/> to open a
    /// <b>second, independent</b> context over the same store.
    /// </summary>
    /// <remarks>
    /// Reopening matters for any assertion about persistence. Querying through the context that
    /// made a change returns the tracked entity, which reflects the change whether or not
    /// <c>SaveChanges</c> was ever called — so a test written that way passes even when nothing
    /// was saved. Mutation testing in task [16] found exactly that hole.
    /// </remarks>
    public static AppDbContext Create(string? databaseName = null)
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName ?? NewDatabaseName())
            .Options;

        var db = new AppDbContext(options);

        // Applies the HasData seed — without this the badges table is empty, because the in-memory
        // provider only materialises seed data on EnsureCreated. Every test before task [26] ran
        // against a database with no badge rows and did not notice, since the provider does not
        // enforce the foreign key from user_badges either. PostgreSQL has both.
        db.Database.EnsureCreated();

        return db;
    }
}
