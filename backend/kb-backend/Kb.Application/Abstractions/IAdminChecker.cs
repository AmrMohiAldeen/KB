namespace Kb.Application.Abstractions;

public interface IAdminChecker
{
    Task<bool> IsAdminAsync(Guid userId, CancellationToken cancellationToken);
}
