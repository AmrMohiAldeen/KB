namespace Kb.Application.Abstractions;

public interface IPermissionChecker
{
    Task<bool> HasPermissionAsync(Guid userId, string permissionCode, CancellationToken cancellationToken);
}
