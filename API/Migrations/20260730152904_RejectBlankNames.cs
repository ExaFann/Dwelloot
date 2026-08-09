using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Dwelloot.Migrations
{
    /// <inheritdoc />
    public partial class RejectBlankNames : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Hand-added, and the reason the order here matters. Task [32] found that
            // PATCH /api/activities/{id} and PATCH /api/rewards/{id} would store an empty title when
            // sent a whitespace-only one, so the dev database may already hold rows the constraints
            // below would reject. Repair them first rather than letting the migration fail on data
            // the application itself created. Same shape as task [30]'s backfill.
            migrationBuilder.Sql("""
                UPDATE activities SET title = '(untitled chore)' WHERE btrim(title) = '';
                UPDATE rewards    SET title = '(untitled reward)' WHERE btrim(title) = '';
                UPDATE households SET name  = '(unnamed household)' WHERE btrim(name) = '';
                UPDATE users      SET name  = '(unnamed)' WHERE btrim(name) = '';
                """);

            migrationBuilder.AddCheckConstraint(
                name: "ck_users_name_not_blank",
                table: "users",
                sql: "btrim(name) <> ''");

            migrationBuilder.AddCheckConstraint(
                name: "ck_rewards_title_not_blank",
                table: "rewards",
                sql: "btrim(title) <> ''");

            migrationBuilder.AddCheckConstraint(
                name: "ck_households_name_not_blank",
                table: "households",
                sql: "btrim(name) <> ''");

            migrationBuilder.AddCheckConstraint(
                name: "ck_activities_title_not_blank",
                table: "activities",
                sql: "btrim(title) <> ''");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_users_name_not_blank",
                table: "users");

            migrationBuilder.DropCheckConstraint(
                name: "ck_rewards_title_not_blank",
                table: "rewards");

            migrationBuilder.DropCheckConstraint(
                name: "ck_households_name_not_blank",
                table: "households");

            migrationBuilder.DropCheckConstraint(
                name: "ck_activities_title_not_blank",
                table: "activities");
        }
    }
}
