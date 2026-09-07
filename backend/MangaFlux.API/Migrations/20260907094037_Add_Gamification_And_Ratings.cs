using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace MangaFlux.API.Migrations
{
    /// <inheritdoc />
    public partial class Add_Gamification_And_Ratings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ActiveBadge",
                table: "Users",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "AttendanceStreak",
                table: "Users",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "AvatarFrame",
                table: "Users",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Exp",
                table: "Users",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTime>(
                name: "LastAttendanceDate",
                table: "Users",
                type: "timestamp without time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "RatingCount",
                table: "Comics",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateTable(
                name: "ComicRatings",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    UserId = table.Column<int>(type: "integer", nullable: false),
                    ComicId = table.Column<int>(type: "integer", nullable: false),
                    Score = table.Column<int>(type: "integer", nullable: false),
                    Review = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp without time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp without time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ComicRatings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ComicRatings_Comics_ComicId",
                        column: x => x.ComicId,
                        principalTable: "Comics",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ComicRatings_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Users_Exp",
                table: "Users",
                column: "Exp");

            migrationBuilder.CreateIndex(
                name: "IX_ComicRatings_ComicId",
                table: "ComicRatings",
                column: "ComicId");

            migrationBuilder.CreateIndex(
                name: "IX_ComicRatings_UserId_ComicId",
                table: "ComicRatings",
                columns: new[] { "UserId", "ComicId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ComicRatings");

            migrationBuilder.DropIndex(
                name: "IX_Users_Exp",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "ActiveBadge",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "AttendanceStreak",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "AvatarFrame",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "Exp",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "LastAttendanceDate",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "RatingCount",
                table: "Comics");
        }
    }
}
