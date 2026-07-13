using System.ComponentModel.DataAnnotations;
using Kb.Contracts.Common;

namespace Kb.Contracts.Roles;

public sealed record PermissionResponse(string PermissionCode);

public sealed record RoleDetailsResponse(
    Guid RoleId,
    string RoleName,
    string? Description,
    IReadOnlyList<PermissionResponse> Permissions);

public abstract class RoleWriteRequest : IValidatableObject
{
    [Required, NonWhiteSpace, StringLength(100)]
    public required string RoleName { get; init; }

    [NonWhiteSpace, StringLength(500)]
    public string? Description { get; init; }

    [Required, MinLength(1), MaxLength(ContractLimits.MaxPermissionCodes)]
    public required IReadOnlyList<string> PermissionCodes { get; init; }

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (PermissionCodes is null) yield break;

        if (PermissionCodes.Any(string.IsNullOrWhiteSpace))
            yield return new ValidationResult("Permission codes must not be blank.", [nameof(PermissionCodes)]);

        if (PermissionCodes.Count != PermissionCodes.Distinct(StringComparer.Ordinal).Count())
            yield return new ValidationResult("Permission codes must not contain duplicates.", [nameof(PermissionCodes)]);

        var unsupported = PermissionCodes.Where(code => !Common.PermissionCodes.All.Contains(code)).Distinct().ToArray();
        if (unsupported.Length > 0)
            yield return new ValidationResult($"Unsupported permission code(s): {string.Join(", ", unsupported)}.", [nameof(PermissionCodes)]);
    }
}

public sealed class CreateRoleRequest : RoleWriteRequest;
public sealed class UpdateRoleRequest : RoleWriteRequest;

public sealed class AssignUserRoleRequest
{
    [NonEmptyGuid]
    public Guid UserId { get; init; }

    [NonEmptyGuid]
    public Guid RoleId { get; init; }
}
