using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Dwelloot.Migrations
{
    /// <inheritdoc />
    public partial class SnapshotCoinsOnRedemption : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "coins_spent",
                table: "redemptions",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            // Hand-added, and the reason the operation order in this migration matters. The column
            // lands at 0 for any pre-existing row, which ck_redemptions_coins_spent_positive below
            // would then reject - and the dev database may hold redemptions inserted by hand (log
            // 025's psql snippet). Backfilling from the reward's current price is the best available
            // answer for rows that predate the snapshot: it is what a live read through the foreign
            // key would have shown anyway, which is exactly what this column exists to stop happening
            // to future rows.
            migrationBuilder.Sql("""
                UPDATE redemptions
                SET coins_spent = rewards.coin_cost
                FROM rewards
                WHERE rewards.id = redemptions.reward_id
                  AND redemptions.coins_spent = 0;
                """);

            migrationBuilder.AddCheckConstraint(
                name: "ck_users_coins_not_negative",
                table: "users",
                sql: "coins >= 0");

            migrationBuilder.AddCheckConstraint(
                name: "ck_redemptions_coins_spent_positive",
                table: "redemptions",
                sql: "coins_spent > 0");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_users_coins_not_negative",
                table: "users");

            migrationBuilder.DropCheckConstraint(
                name: "ck_redemptions_coins_spent_positive",
                table: "redemptions");

            migrationBuilder.DropColumn(
                name: "coins_spent",
                table: "redemptions");
        }
    }
}
