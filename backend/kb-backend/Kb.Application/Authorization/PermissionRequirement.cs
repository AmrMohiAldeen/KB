using Microsoft.AspNetCore.Authorization;

namespace Kb.Application.Authorization;

public sealed class PermissionRequirement(string permissionCode) : IAuthorizationRequirement
{
    public string PermissionCode { get; } = permissionCode;
}

public static class PermissionPolicy
{
    public const string Prefix = "Permission:";
    public static string For(string permissionCode) => $"{Prefix}{permissionCode}";
}
