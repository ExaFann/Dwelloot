using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Dwelloot.Migrations
{
    /// <inheritdoc />
    public partial class RewardChangeRequests : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "reward_change_requests",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    household_id = table.Column<int>(type: "integer", nullable: false),
                    requested_by_user_id = table.Column<int>(type: "integer", nullable: false),
                    kind = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    reward_id = table.Column<int>(type: "integer", nullable: true),
                    proposed_title = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: true),
                    proposed_coin_cost = table.Column<int>(type: "integer", nullable: true),
                    status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, defaultValue: "Pending"),
                    requested_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    decided_by_user_id = table.Column<int>(type: "integer", nullable: true),
                    decided_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    reject_reason = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_reward_change_requests", x => x.id);
                    table.CheckConstraint("ck_reward_change_requests_no_self_approval", "decided_by_user_id IS NULL OR decided_by_user_id <> requested_by_user_id");
                    table.CheckConstraint("ck_reward_change_requests_reward_id_matches_kind", "(kind = 'Create' AND reward_id IS NULL) OR (kind <> 'Create' AND reward_id IS NOT NULL)");
                    table.ForeignKey(
                        name: "fk_reward_change_requests_households_household_id",
                        column: x => x.household_id,
                        principalTable: "households",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_reward_change_requests_rewards_reward_id",
                        column: x => x.reward_id,
                        principalTable: "rewards",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_reward_change_requests_users_decided_by_user_id",
                        column: x => x.decided_by_user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_reward_change_requests_users_requested_by_user_id",
                        column: x => x.requested_by_user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_reward_change_requests_decided_by_user_id",
                table: "reward_change_requests",
                column: "decided_by_user_id");

            migrationBuilder.CreateIndex(
                name: "ix_reward_change_requests_household_id_status_requested_at",
                table: "reward_change_requests",
                columns: new[] { "household_id", "status", "requested_at" });

            migrationBuilder.CreateIndex(
                name: "ix_reward_change_requests_requested_by_user_id",
                table: "reward_change_requests",
                column: "requested_by_user_id");

            migrationBuilder.CreateIndex(
                name: "ux_reward_change_requests_one_open_per_reward",
                table: "reward_change_requests",
                column: "reward_id",
                unique: true,
                filter: "status = 'Pending' AND reward_id IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "reward_change_requests");
        }
    }
}
