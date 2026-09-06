using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Kb.Infrastructure.Data.Migrations;

// The localization foundation migration may already be recorded in deployed databases.
// Keep this backfill separate so those databases receive the same RBAC grants as fresh ones.
[DbContext(typeof(KbDbContext))]
[Migration("20260906100000_BackfillLocalizationAdminPermissions")]
public sealed class BackfillLocalizationAdminPermissions : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            INSERT INTO [ROLE_PERMISSIONS] ([RoleID_FK], [PermissionCode])
            SELECT [role].[RoleID], [permission].[PermissionCode]
            FROM [ROLES] AS [role]
            CROSS JOIN (VALUES (N'languages.manage'), (N'articles.translate'))
                AS [permission]([PermissionCode])
            WHERE [role].[RoleName] = N'Admin'
              AND NOT EXISTS (
                  SELECT 1
                  FROM [ROLE_PERMISSIONS] AS [rolePermission]
                  WHERE [rolePermission].[RoleID_FK] = [role].[RoleID]
                    AND [rolePermission].[PermissionCode] = [permission].[PermissionCode]
              );
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // Permission assignments are shared RBAC data and should not be removed by a schema rollback.
    }
}
