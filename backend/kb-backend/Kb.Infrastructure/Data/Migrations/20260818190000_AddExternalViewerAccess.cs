using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Kb.Infrastructure.Data.Migrations;

[DbContext(typeof(KbDbContext))]
[Migration("20260818190000_AddExternalViewerAccess")]
public sealed class AddExternalViewerAccess : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>("ExternalActorId", "ARTICLE_AUDIT_LOG", "nvarchar(256)", maxLength: 256, nullable: true);
        migrationBuilder.AddColumn<string>("ExternalActorEmail", "ARTICLE_AUDIT_LOG", "nvarchar(320)", maxLength: 320, nullable: true);
        migrationBuilder.AddColumn<Guid>("ViewerCustomerID", "ARTICLE_AUDIT_LOG", "uniqueidentifier", nullable: true);
        migrationBuilder.AddColumn<Guid>("ViewerSessionID", "ARTICLE_AUDIT_LOG", "uniqueidentifier", nullable: true);
        migrationBuilder.AddColumn<Guid>("ViewerSolutionID", "ARTICLE_AUDIT_LOG", "uniqueidentifier", nullable: true);

        migrationBuilder.CreateTable("VIEWER_CUSTOMERS", table => new
        {
            CustomerID = table.Column<Guid>("uniqueidentifier", nullable: false, defaultValueSql: "newsequentialid()"),
            ExternalCustomerId = table.Column<string>("nvarchar(256)", maxLength: 256, nullable: false),
            DisplayName = table.Column<string>("nvarchar(200)", maxLength: 200, nullable: true),
            MaxConcurrentSessions = table.Column<int>("int", nullable: false, defaultValue: 10),
            IsEnabled = table.Column<bool>("bit", nullable: false, defaultValue: true),
            CreatedAt = table.Column<DateTime>("datetime2(3)", precision: 3, nullable: false, defaultValueSql: "sysutcdatetime()"),
            UpdatedAt = table.Column<DateTime>("datetime2(3)", precision: 3, nullable: false, defaultValueSql: "sysutcdatetime()")
        }, constraints: table =>
        {
            table.PrimaryKey("PK_VIEWER_CUSTOMERS", row => row.CustomerID);
            table.CheckConstraint("CK_VIEWER_CUSTOMERS_MaxConcurrentSessions", "[MaxConcurrentSessions] > 0");
        });

        migrationBuilder.CreateTable("VIEWER_SOLUTIONS", table => new
        {
            SolutionID = table.Column<Guid>("uniqueidentifier", nullable: false, defaultValueSql: "newsequentialid()"),
            RootCategoryID_FK = table.Column<Guid>("uniqueidentifier", nullable: false),
            Slug = table.Column<string>("nvarchar(100)", maxLength: 100, nullable: false),
            IsEnabled = table.Column<bool>("bit", nullable: false, defaultValue: true),
            CreatedAt = table.Column<DateTime>("datetime2(3)", precision: 3, nullable: false, defaultValueSql: "sysutcdatetime()"),
            UpdatedAt = table.Column<DateTime>("datetime2(3)", precision: 3, nullable: false, defaultValueSql: "sysutcdatetime()")
        }, constraints: table =>
        {
            table.PrimaryKey("PK_VIEWER_SOLUTIONS", row => row.SolutionID);
            table.ForeignKey("FK_VIEWER_SOLUTIONS_CATEGORIES_RootCategoryID_FK", row => row.RootCategoryID_FK,
                "CATEGORIES", "CategoryID", onDelete: ReferentialAction.Restrict);
        });

        migrationBuilder.CreateTable("VIEWER_ENTITLEMENTS", table => new
        {
            CustomerID_FK = table.Column<Guid>("uniqueidentifier", nullable: false),
            SolutionID_FK = table.Column<Guid>("uniqueidentifier", nullable: false),
            CreatedAt = table.Column<DateTime>("datetime2(3)", precision: 3, nullable: false, defaultValueSql: "sysutcdatetime()")
        }, constraints: table =>
        {
            table.PrimaryKey("PK_VIEWER_ENTITLEMENTS", row => new { row.CustomerID_FK, row.SolutionID_FK });
            table.ForeignKey("FK_VIEWER_ENTITLEMENTS_VIEWER_CUSTOMERS_CustomerID_FK", row => row.CustomerID_FK,
                "VIEWER_CUSTOMERS", "CustomerID", onDelete: ReferentialAction.Cascade);
            table.ForeignKey("FK_VIEWER_ENTITLEMENTS_VIEWER_SOLUTIONS_SolutionID_FK", row => row.SolutionID_FK,
                "VIEWER_SOLUTIONS", "SolutionID", onDelete: ReferentialAction.Cascade);
        });

        migrationBuilder.CreateTable("VIEWER_SESSIONS", table => new
        {
            SessionID = table.Column<Guid>("uniqueidentifier", nullable: false, defaultValueSql: "newsequentialid()"),
            CustomerID_FK = table.Column<Guid>("uniqueidentifier", nullable: false),
            ExternalUserId = table.Column<string>("nvarchar(256)", maxLength: 256, nullable: false),
            ExternalUserEmail = table.Column<string>("nvarchar(320)", maxLength: 320, nullable: false),
            HandoffId = table.Column<string>("nvarchar(256)", maxLength: 256, nullable: false),
            CreatedAt = table.Column<DateTime>("datetime2(3)", precision: 3, nullable: false, defaultValueSql: "sysutcdatetime()"),
            ExpiresAt = table.Column<DateTime>("datetime2(3)", precision: 3, nullable: false),
            LastSeenAt = table.Column<DateTime>("datetime2(3)", precision: 3, nullable: false),
            RevokedAt = table.Column<DateTime>("datetime2(3)", precision: 3, nullable: true),
            RevokedReason = table.Column<string>("nvarchar(500)", maxLength: 500, nullable: true)
        }, constraints: table =>
        {
            table.PrimaryKey("PK_VIEWER_SESSIONS", row => row.SessionID);
            table.ForeignKey("FK_VIEWER_SESSIONS_VIEWER_CUSTOMERS_CustomerID_FK", row => row.CustomerID_FK,
                "VIEWER_CUSTOMERS", "CustomerID", onDelete: ReferentialAction.Restrict);
        });

        migrationBuilder.CreateTable("VIEWER_SESSION_SOLUTIONS", table => new
        {
            SessionID_FK = table.Column<Guid>("uniqueidentifier", nullable: false),
            SolutionID_FK = table.Column<Guid>("uniqueidentifier", nullable: false)
        }, constraints: table =>
        {
            table.PrimaryKey("PK_VIEWER_SESSION_SOLUTIONS", row => new { row.SessionID_FK, row.SolutionID_FK });
            table.ForeignKey("FK_VIEWER_SESSION_SOLUTIONS_VIEWER_SESSIONS_SessionID_FK", row => row.SessionID_FK,
                "VIEWER_SESSIONS", "SessionID", onDelete: ReferentialAction.Cascade);
            table.ForeignKey("FK_VIEWER_SESSION_SOLUTIONS_VIEWER_SOLUTIONS_SolutionID_FK", row => row.SolutionID_FK,
                "VIEWER_SOLUTIONS", "SolutionID", onDelete: ReferentialAction.Restrict);
        });

        migrationBuilder.CreateIndex("UX_VIEWER_CUSTOMERS_ExternalCustomerId", "VIEWER_CUSTOMERS", "ExternalCustomerId", unique: true);
        migrationBuilder.CreateIndex("UX_VIEWER_SOLUTIONS_Slug", "VIEWER_SOLUTIONS", "Slug", unique: true);
        migrationBuilder.CreateIndex("UX_VIEWER_SOLUTIONS_RootCategoryID_FK", "VIEWER_SOLUTIONS", "RootCategoryID_FK", unique: true);
        migrationBuilder.CreateIndex("IX_VIEWER_ENTITLEMENTS_SolutionID_FK", "VIEWER_ENTITLEMENTS", "SolutionID_FK");
        migrationBuilder.CreateIndex("UX_VIEWER_SESSIONS_HandoffId", "VIEWER_SESSIONS", "HandoffId", unique: true);
        migrationBuilder.CreateIndex("IX_VIEWER_SESSIONS_Customer_Active", "VIEWER_SESSIONS", new[] { "CustomerID_FK", "RevokedAt", "ExpiresAt" });
        migrationBuilder.CreateIndex("IX_VIEWER_SESSION_SOLUTIONS_SolutionID_FK", "VIEWER_SESSION_SOLUTIONS", "SolutionID_FK");
        migrationBuilder.CreateIndex("IX_ARTICLE_AUDIT_LOG_ViewerSessionID", "ARTICLE_AUDIT_LOG", "ViewerSessionID");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable("VIEWER_ENTITLEMENTS");
        migrationBuilder.DropTable("VIEWER_SESSION_SOLUTIONS");
        migrationBuilder.DropTable("VIEWER_SESSIONS");
        migrationBuilder.DropTable("VIEWER_SOLUTIONS");
        migrationBuilder.DropTable("VIEWER_CUSTOMERS");
        migrationBuilder.DropIndex("IX_ARTICLE_AUDIT_LOG_ViewerSessionID", "ARTICLE_AUDIT_LOG");
        migrationBuilder.DropColumn("ExternalActorId", "ARTICLE_AUDIT_LOG");
        migrationBuilder.DropColumn("ExternalActorEmail", "ARTICLE_AUDIT_LOG");
        migrationBuilder.DropColumn("ViewerCustomerID", "ARTICLE_AUDIT_LOG");
        migrationBuilder.DropColumn("ViewerSessionID", "ARTICLE_AUDIT_LOG");
        migrationBuilder.DropColumn("ViewerSolutionID", "ARTICLE_AUDIT_LOG");
    }
}
