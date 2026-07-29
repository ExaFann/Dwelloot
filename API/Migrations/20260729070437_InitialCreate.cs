using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace Dwelloot.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "badges",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:IdentitySequenceOptions", "'7', '1', '', '', 'False', '1'")
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    name = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    criteria = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_badges", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "households",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    name = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    invite_code = table.Column<string>(type: "character(6)", fixedLength: true, maxLength: 6, nullable: false),
                    is_full = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_households", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "activities",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    title = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    points = table.Column<int>(type: "integer", nullable: false),
                    category = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, defaultValue: "Chore"),
                    household_id = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_activities", x => x.id);
                    table.CheckConstraint("ck_activities_points_positive", "points > 0");
                    table.ForeignKey(
                        name: "fk_activities_households_household_id",
                        column: x => x.household_id,
                        principalTable: "households",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "rewards",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    title = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    coin_cost = table.Column<int>(type: "integer", nullable: false),
                    pauses_competition = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    household_id = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_rewards", x => x.id);
                    table.CheckConstraint("ck_rewards_coin_cost_positive", "coin_cost > 0");
                    table.ForeignKey(
                        name: "fk_rewards_households_household_id",
                        column: x => x.household_id,
                        principalTable: "households",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "users",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    name = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    household_id = table.Column<int>(type: "integer", nullable: true),
                    lifetime_points = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    coins = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    current_win_streak = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    longest_win_streak = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    user_name = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    normalized_user_name = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    email = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    normalized_email = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    email_confirmed = table.Column<bool>(type: "boolean", nullable: false),
                    password_hash = table.Column<string>(type: "text", nullable: true),
                    security_stamp = table.Column<string>(type: "text", nullable: true),
                    concurrency_stamp = table.Column<string>(type: "text", nullable: true),
                    phone_number = table.Column<string>(type: "text", nullable: true),
                    phone_number_confirmed = table.Column<bool>(type: "boolean", nullable: false),
                    two_factor_enabled = table.Column<bool>(type: "boolean", nullable: false),
                    lockout_end = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    lockout_enabled = table.Column<bool>(type: "boolean", nullable: false),
                    access_failed_count = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_users", x => x.id);
                    table.ForeignKey(
                        name: "fk_users_households_household_id",
                        column: x => x.household_id,
                        principalTable: "households",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "activity_logs",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    activity_id = table.Column<int>(type: "integer", nullable: false),
                    logged_by_user_id = table.Column<int>(type: "integer", nullable: false),
                    approved_by_user_id = table.Column<int>(type: "integer", nullable: true),
                    status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, defaultValue: "Pending"),
                    completed_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    approved_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    reject_reason = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_activity_logs", x => x.id);
                    table.CheckConstraint("ck_activity_logs_no_self_approval", "approved_by_user_id IS NULL OR approved_by_user_id <> logged_by_user_id");
                    table.ForeignKey(
                        name: "fk_activity_logs_activities_activity_id",
                        column: x => x.activity_id,
                        principalTable: "activities",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_activity_logs_users_approved_by_user_id",
                        column: x => x.approved_by_user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_activity_logs_users_logged_by_user_id",
                        column: x => x.logged_by_user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "competitions",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    household_id = table.Column<int>(type: "integer", nullable: false),
                    period_type = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    period_start = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    period_end = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    winner_user_id = table.Column<int>(type: "integer", nullable: true),
                    winner_points = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    loser_points = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    is_win_win = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    is_voided = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    coins_awarded = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    bonus_reward_id = table.Column<int>(type: "integer", nullable: true),
                    settled_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_competitions", x => x.id);
                    table.ForeignKey(
                        name: "fk_competitions_households_household_id",
                        column: x => x.household_id,
                        principalTable: "households",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_competitions_rewards_bonus_reward_id",
                        column: x => x.bonus_reward_id,
                        principalTable: "rewards",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "fk_competitions_users_winner_user_id",
                        column: x => x.winner_user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "redemptions",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    user_id = table.Column<int>(type: "integer", nullable: false),
                    reward_id = table.Column<int>(type: "integer", nullable: false),
                    redeemed_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_redemptions", x => x.id);
                    table.ForeignKey(
                        name: "fk_redemptions_rewards_reward_id",
                        column: x => x.reward_id,
                        principalTable: "rewards",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_redemptions_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "user_badges",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    user_id = table.Column<int>(type: "integer", nullable: false),
                    badge_id = table.Column<int>(type: "integer", nullable: false),
                    unlocked_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_user_badges", x => x.id);
                    table.ForeignKey(
                        name: "fk_user_badges_badges_badge_id",
                        column: x => x.badge_id,
                        principalTable: "badges",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_user_badges_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "user_claims",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    user_id = table.Column<int>(type: "integer", nullable: false),
                    claim_type = table.Column<string>(type: "text", nullable: true),
                    claim_value = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_user_claims", x => x.id);
                    table.ForeignKey(
                        name: "fk_user_claims_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "user_logins",
                columns: table => new
                {
                    login_provider = table.Column<string>(type: "text", nullable: false),
                    provider_key = table.Column<string>(type: "text", nullable: false),
                    provider_display_name = table.Column<string>(type: "text", nullable: true),
                    user_id = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_user_logins", x => new { x.login_provider, x.provider_key });
                    table.ForeignKey(
                        name: "fk_user_logins_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "user_tokens",
                columns: table => new
                {
                    user_id = table.Column<int>(type: "integer", nullable: false),
                    login_provider = table.Column<string>(type: "text", nullable: false),
                    name = table.Column<string>(type: "text", nullable: false),
                    value = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_user_tokens", x => new { x.user_id, x.login_provider, x.name });
                    table.ForeignKey(
                        name: "fk_user_tokens_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "competition_claims",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    competition_id = table.Column<int>(type: "integer", nullable: false),
                    user_id = table.Column<int>(type: "integer", nullable: false),
                    opened_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_competition_claims", x => x.id);
                    table.ForeignKey(
                        name: "fk_competition_claims_competitions_competition_id",
                        column: x => x.competition_id,
                        principalTable: "competitions",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_competition_claims_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.InsertData(
                table: "badges",
                columns: new[] { "id", "criteria", "name" },
                values: new object[,]
                {
                    { 1, "Get your first logged chore approved.", "First chore" },
                    { 2, "Win the daily duel three days in a row.", "3-day win streak" },
                    { 3, "Spend Coins in the Store for the first time.", "First redemption" },
                    { 4, "Win the daily duel seven days in a row.", "7-day win streak" },
                    { 5, "Earn 100 lifetime Points.", "Century" },
                    { 6, "Redeem five rewards.", "Big spender" }
                });

            migrationBuilder.CreateIndex(
                name: "ix_activities_household_id",
                table: "activities",
                column: "household_id");

            migrationBuilder.CreateIndex(
                name: "ix_activity_logs_activity_id",
                table: "activity_logs",
                column: "activity_id");

            migrationBuilder.CreateIndex(
                name: "ix_activity_logs_approved_by_user_id",
                table: "activity_logs",
                column: "approved_by_user_id");

            migrationBuilder.CreateIndex(
                name: "ix_activity_logs_logged_by_user_id_status_completed_at",
                table: "activity_logs",
                columns: new[] { "logged_by_user_id", "status", "completed_at" });

            migrationBuilder.CreateIndex(
                name: "ix_competition_claims_competition_id_user_id",
                table: "competition_claims",
                columns: new[] { "competition_id", "user_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_competition_claims_user_id",
                table: "competition_claims",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "ix_competitions_bonus_reward_id",
                table: "competitions",
                column: "bonus_reward_id");

            migrationBuilder.CreateIndex(
                name: "ix_competitions_household_id_period_type_period_start",
                table: "competitions",
                columns: new[] { "household_id", "period_type", "period_start" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_competitions_winner_user_id",
                table: "competitions",
                column: "winner_user_id");

            migrationBuilder.CreateIndex(
                name: "ix_households_invite_code",
                table: "households",
                column: "invite_code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_redemptions_reward_id",
                table: "redemptions",
                column: "reward_id");

            migrationBuilder.CreateIndex(
                name: "ix_redemptions_user_id_redeemed_at",
                table: "redemptions",
                columns: new[] { "user_id", "redeemed_at" });

            migrationBuilder.CreateIndex(
                name: "ix_rewards_household_id",
                table: "rewards",
                column: "household_id");

            migrationBuilder.CreateIndex(
                name: "ix_user_badges_badge_id",
                table: "user_badges",
                column: "badge_id");

            migrationBuilder.CreateIndex(
                name: "ix_user_badges_user_id_badge_id",
                table: "user_badges",
                columns: new[] { "user_id", "badge_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_user_claims_user_id",
                table: "user_claims",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "ix_user_logins_user_id",
                table: "user_logins",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "ix_users_household_id",
                table: "users",
                column: "household_id");

            migrationBuilder.CreateIndex(
                name: "ix_users_normalized_email",
                table: "users",
                column: "normalized_email");

            migrationBuilder.CreateIndex(
                name: "ix_users_normalized_user_name",
                table: "users",
                column: "normalized_user_name",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "activity_logs");

            migrationBuilder.DropTable(
                name: "competition_claims");

            migrationBuilder.DropTable(
                name: "redemptions");

            migrationBuilder.DropTable(
                name: "user_badges");

            migrationBuilder.DropTable(
                name: "user_claims");

            migrationBuilder.DropTable(
                name: "user_logins");

            migrationBuilder.DropTable(
                name: "user_tokens");

            migrationBuilder.DropTable(
                name: "activities");

            migrationBuilder.DropTable(
                name: "competitions");

            migrationBuilder.DropTable(
                name: "badges");

            migrationBuilder.DropTable(
                name: "rewards");

            migrationBuilder.DropTable(
                name: "users");

            migrationBuilder.DropTable(
                name: "households");
        }
    }
}
