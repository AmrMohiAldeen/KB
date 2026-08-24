using Kb.Application.Abstractions;
using Kb.Application.Exceptions;
using Kb.Domain.Constants;
using System.Net.Mail;

namespace Kb.Application.Users;

public sealed class UserService(
    IUserRepository repository,
    ICurrentUser currentUser,
    IPermissionChecker permissionChecker,
    TimeProvider timeProvider)
{
    public const int DefaultPageSize = 20;
    public const int MaxPageSize = 100;
    private static readonly IReadOnlySet<string> SortFields = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
        "fullName", "email", "role", "status", "createdAt", "lastLoginAt"
    };

    public async Task<PagedUserData> GetPagedAsync(
        string? search, string? role, string? status, int page, int pageSize,
        string? sortBy, string? sortDirection, CancellationToken cancellationToken)
    {
        await RequirePermissionAsync(cancellationToken);
        if (page < 1)
            throw new BusinessRuleException("Page must be at least 1.");
        if (pageSize < 1 || pageSize > MaxPageSize)
            throw new BusinessRuleException($"Page size must be between 1 and {MaxPageSize}.");

        var normalizedSearch = Normalize(search, "Search", 300);
        var normalizedRole = Normalize(role, "Role", 100);
        var normalizedStatus = Normalize(status, "Status", 20)?.ToLowerInvariant();
        bool? isActive = normalizedStatus switch
        {
            null => null,
            "active" => true,
            "inactive" => false,
            _ => throw new BusinessRuleException("Status must be active or inactive.")
        };
        var normalizedSortBy = string.IsNullOrWhiteSpace(sortBy) ? "fullName" : sortBy.Trim();
        if (!SortFields.Contains(normalizedSortBy))
            throw new BusinessRuleException("The selected user sort field is not supported.");
        var descending = (sortDirection ?? "asc").Trim().ToLowerInvariant() switch
        {
            "asc" => false,
            "desc" => true,
            _ => throw new BusinessRuleException("Sort direction must be asc or desc.")
        };

        return await repository.GetPagedAsync(new(
            normalizedSearch, normalizedRole, isActive, page, pageSize, normalizedSortBy, descending),
            cancellationToken);
    }

    public async Task<IReadOnlyList<UserRoleData>> GetRolesAsync(CancellationToken cancellationToken)
    {
        await RequirePermissionAsync(cancellationToken);
        return await repository.GetRolesAsync(cancellationToken);
    }

    public async Task<UserListItemData> CreateAsync(CreateUserCommand command, CancellationToken cancellationToken)
    {
        await RequirePermissionAsync(cancellationToken);
        var fullName = Required(command.FullName, "Full name", 200);
        var email = ValidateEmail(command.Email);
        if (command.RoleId == Guid.Empty)
            throw new BusinessRuleException("A role is required.");

        var now = timeProvider.GetUtcNow().UtcDateTime;
        return await repository.CreateAsync(new(fullName, email, command.RoleId, now),
            new(currentUser.UserId, now), cancellationToken);
    }

    public async Task<UserListItemData> ChangeRoleAsync(Guid userId, Guid roleId, CancellationToken cancellationToken)
    {
        await RequirePermissionAsync(cancellationToken);
        if (userId == Guid.Empty)
            throw new BusinessRuleException("A user is required.");
        if (roleId == Guid.Empty)
            throw new BusinessRuleException("A role is required.");

        return await repository.ChangeRoleAsync(userId, roleId,
            new(currentUser.UserId, timeProvider.GetUtcNow().UtcDateTime), cancellationToken);
    }

    private async Task RequirePermissionAsync(CancellationToken cancellationToken)
    {
        if (!currentUser.IsAuthenticated)
            throw new UnauthorizedAccessException();
        if (!await permissionChecker.HasPermissionAsync(
                currentUser.UserId, PermissionCodes.UsersManage, cancellationToken))
            throw new ForbiddenException("You do not have permission to manage users.");
    }

    private static string? Normalize(string? value, string name, int maxLength)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var normalized = value.Trim();
        if (normalized.Length > maxLength)
            throw new BusinessRuleException($"{name} cannot exceed {maxLength} characters.");
        return normalized;
    }

    private static string Required(string? value, string name, int maxLength) =>
        Normalize(value, name, maxLength) ?? throw new BusinessRuleException($"{name} is required.");

    private static string ValidateEmail(string? value)
    {
        var email = Required(value, "Email", 320);
        if (!MailAddress.TryCreate(email, out var parsed) ||
            !parsed.Address.Equals(email, StringComparison.OrdinalIgnoreCase))
            throw new BusinessRuleException("Email must be a valid email address.");
        return email;
    }
}
