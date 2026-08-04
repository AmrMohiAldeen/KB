using System.Text.Json;
using Kb.Application.Abstractions;
using Kb.Application.Exceptions;
using Kb.Domain.Constants;

namespace Kb.Application.Audit;

public sealed class AuditLogService(
    IAuditLogRepository repository,
    ICurrentUser currentUser,
    IPermissionChecker permissionChecker)
{
    public const int DefaultPageSize = 20;
    public const int MaxPageSize = 100;
    private const int MaxActionTypeLength = 100;

    public async Task<PagedAuditLogData> GetPagedAsync(
        Guid? articleId,
        Guid? userId,
        string? article,
        string? user,
        string? actionType,
        DateTimeOffset? from,
        DateTimeOffset? to,
        int page,
        int pageSize,
        string? sortDirection,
        CancellationToken cancellationToken)
    {
        await RequirePermissionAsync(cancellationToken);

        if (articleId == Guid.Empty || userId == Guid.Empty)
            throw new BusinessRuleException("Filter IDs must not be empty GUIDs.");
        if (page < 1)
            throw new BusinessRuleException("Page must be at least 1.");
        if (pageSize < 1 || pageSize > MaxPageSize)
            throw new BusinessRuleException($"Page size must be between 1 and {MaxPageSize}.");

        var normalizedArticle = NormalizeSearch(article, "Article");
        var normalizedUser = NormalizeSearch(user, "User");
        var normalizedAction = string.IsNullOrWhiteSpace(actionType) ? null : actionType.Trim();
        if (normalizedAction?.Length > MaxActionTypeLength)
            throw new BusinessRuleException($"Action type cannot exceed {MaxActionTypeLength} characters.");

        var fromUtc = from?.UtcDateTime;
        var toUtc = to?.UtcDateTime;
        if (fromUtc > toUtc)
            throw new BusinessRuleException("The start of the date range must not be after the end.");

        var descending = (sortDirection ?? "desc").Trim().ToLowerInvariant() switch
        {
            "desc" => true,
            "asc" => false,
            _ => throw new BusinessRuleException("Sort direction must be asc or desc.")
        };

        var result = await repository.GetPagedAsync(
            new(articleId, userId, normalizedArticle, normalizedUser, normalizedAction,
                fromUtc, toUtc, page, pageSize, descending),
            cancellationToken);
        return new(
            result.Items.Select(item => new AuditLogData(
                item.Id,
                item.ArticleId,
                item.Article,
                item.Actor,
                item.ActionType,
                item.EntityType,
                item.EntityId,
                ParseMetadata(item.MetadataJson),
                item.CreatedAt)).ToArray(),
            result.Page,
            result.PageSize,
            result.TotalCount);
    }

    private async Task RequirePermissionAsync(CancellationToken cancellationToken)
    {
        if (!currentUser.IsAuthenticated)
            throw new UnauthorizedAccessException();
        if (!await permissionChecker.HasPermissionAsync(
                currentUser.UserId, PermissionCodes.AuditLogsView, cancellationToken))
            throw new ForbiddenException("You do not have permission to view audit logs.");
    }

    private static JsonElement? ParseMetadata(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
            return null;

        try
        {
            using var document = JsonDocument.Parse(json);
            return document.RootElement.Clone();
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static string? NormalizeSearch(string? value, string name)
    {
        if (string.IsNullOrWhiteSpace(value))
            return null;
        var normalized = value.Trim();
        if (normalized.Length > 300)
            throw new BusinessRuleException($"{name} filter cannot exceed 300 characters.");
        return normalized;
    }
}
