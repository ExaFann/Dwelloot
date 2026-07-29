using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Dwelloot.Migrations
{
    /// <inheritdoc />
    public partial class SnapshotPointsOnActivityLog : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "points_awarded",
                table: "activity_logs",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            // Backfill before the constraint is added. Existing rows would otherwise keep the
            // column default of 0 and fail ck_activity_logs_points_awarded_positive immediately.
            // The dev database happens to have no logs yet - POST /api/activity-logs is what this
            // migration accompanies - but a migration that only works on an empty table is a trap
            // waiting for the first deployment that has data.
            //
            // Existing logs take their activity's current points, which is the best available
            // approximation of what they were worth: before this column there was nothing else to
            // read, so it is exactly what the old code would have used.
            migrationBuilder.Sql("""
                UPDATE activity_logs AS l
                SET points_awarded = a.points
                FROM activities AS a
                WHERE a.id = l.activity_id;
                """);

            migrationBuilder.AddCheckConstraint(
                name: "ck_activity_logs_points_awarded_positive",
                table: "activity_logs",
                sql: "points_awarded > 0");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_activity_logs_points_awarded_positive",
                table: "activity_logs");

            migrationBuilder.DropColumn(
                name: "points_awarded",
                table: "activity_logs");
        }
    }
}
