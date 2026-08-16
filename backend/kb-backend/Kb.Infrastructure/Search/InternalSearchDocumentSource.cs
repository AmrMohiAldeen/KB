using System.Text;
using System.Text.Json;
using Kb.Application.Abstractions.Storage;
using Kb.Domain.Constants;
using Kb.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Kb.Infrastructure.Search;

internal sealed class InternalSearchDocumentSource(
    KbDbContext dbContext,
    IObjectStorage storage,
    IOptions<InternalSearchOptions> options)
{
    public async Task<InternalSearchDocument?> GetArticleAsync(Guid id, CancellationToken cancellationToken)
    {
        var article = await dbContext.Articles.AsNoTracking()
            .Where(item => item.ArticleId == id && item.DeletedAt == null && item.Status != ArticleStatuses.Deleted)
            .Select(item => new
            {
                item.ArticleId, item.Title, item.Slug, item.Status, item.CategoryIdFk, item.AuthorIdFk,
                OwnerName = item.AuthorIdFkNavigation.FullName, item.UpdatedAt,
                PlainTextPath = item.CurrentDraftIdFkNavigation == null ? null : item.CurrentDraftIdFkNavigation.PlainTextStoragePath,
                JsonPath = item.CurrentDraftIdFkNavigation == null ? null : item.CurrentDraftIdFkNavigation.ContentJsonStoragePath,
                VersionPlainTextPath = item.ArticleVersions.OrderByDescending(version => version.VersionNumber)
                    .Select(version => version.PlainTextStoragePath).FirstOrDefault(),
                VersionJsonPath = item.ArticleVersions.OrderByDescending(version => version.VersionNumber)
                    .Select(version => version.ContentJsonStoragePath).FirstOrDefault()
            }).SingleOrDefaultAsync(cancellationToken);
        if (article is null) return null;

        var categories = await LoadCategoriesAsync(cancellationToken);
        categories.TryGetValue(article.CategoryIdFk ?? Guid.Empty, out var category);
        var hasDraftContent = !string.IsNullOrWhiteSpace(article.PlainTextPath) ||
                              !string.IsNullOrWhiteSpace(article.JsonPath);
        var body = await ReadDraftTextAsync(
            hasDraftContent ? article.PlainTextPath : article.VersionPlainTextPath,
            hasDraftContent ? article.JsonPath : article.VersionJsonPath,
            cancellationToken);
        return new InternalSearchDocument($"article_{article.ArticleId:N}", "article", article.ArticleId.ToString("D"),
            article.Title, body, article.Slug, article.Status, article.CategoryIdFk?.ToString("D") ?? string.Empty,
            category?.Name ?? string.Empty, BuildCategoryPath(category, categories), article.AuthorIdFk.ToString("D"),
            article.OwnerName, $"{article.AuthorIdFk:D}|{article.OwnerName}", ToUnixTime(article.UpdatedAt));
    }

    public async Task<InternalSearchDocument?> GetCategoryAsync(Guid id, CancellationToken cancellationToken)
    {
        var categories = await LoadCategoriesAsync(cancellationToken);
        if (!categories.TryGetValue(id, out var category)) return null;
        var updatedAt = await dbContext.ArticleAuditLogs.AsNoTracking()
            .Where(log => log.EntityType == AuditEntityTypes.Category && log.EntityId == id)
            .MaxAsync(log => (DateTime?)log.CreatedAt, cancellationToken) ?? DateTime.UnixEpoch;
        return new InternalSearchDocument($"category_{id:N}", "category", id.ToString("D"), category.Name,
            category.Description ?? string.Empty, category.Slug, category.Status, id.ToString("D"), category.Name,
            BuildCategoryPath(category, categories), string.Empty, string.Empty, string.Empty, ToUnixTime(updatedAt));
    }

    public async Task<InternalSearchDocument?> GetPublicArticleAsync(Guid id, CancellationToken cancellationToken)
    {
        var article = await dbContext.Articles.AsNoTracking().Where(item => item.ArticleId == id &&
                item.DeletedAt == null && item.Status == ArticleStatuses.Published &&
                item.Visibility == ContentVisibilities.Public && item.LastPublishedVersionIdFk != null)
            .Select(item => new
            {
                item.ArticleId, item.Title, item.Slug, item.Status, item.CategoryIdFk, item.AuthorIdFk,
                OwnerName = item.AuthorIdFkNavigation.FullName, item.UpdatedAt,
                PlainTextPath = item.LastPublishedVersionIdFkNavigation!.PlainTextStoragePath,
                JsonPath = item.LastPublishedVersionIdFkNavigation.ContentJsonStoragePath
            }).SingleOrDefaultAsync(cancellationToken);
        if (article is null) return null;
        var categories = await LoadCategoriesAsync(cancellationToken);
        if (!categories.TryGetValue(article.CategoryIdFk ?? Guid.Empty, out var category) ||
            !IsPubliclyVisible(category, categories)) return null;
        var body = await ReadDraftTextAsync(article.PlainTextPath, article.JsonPath, cancellationToken);
        return new InternalSearchDocument($"article_{article.ArticleId:N}", "article", article.ArticleId.ToString("D"),
            article.Title, body, article.Slug, article.Status, article.CategoryIdFk?.ToString("D") ?? string.Empty,
            category.Name, BuildCategoryPath(category, categories), article.AuthorIdFk.ToString("D"),
            article.OwnerName, $"{article.AuthorIdFk:D}|{article.OwnerName}", ToUnixTime(article.UpdatedAt));
    }

    public async Task<InternalSearchDocument?> GetPublicCategoryAsync(Guid id, CancellationToken cancellationToken)
    {
        var categories = await LoadCategoriesAsync(cancellationToken);
        if (!categories.TryGetValue(id, out var category) || !IsPubliclyVisible(category, categories)) return null;
        var updatedAt = await dbContext.ArticleAuditLogs.AsNoTracking()
            .Where(log => log.EntityType == AuditEntityTypes.Category && log.EntityId == id)
            .MaxAsync(log => (DateTime?)log.CreatedAt, cancellationToken) ?? DateTime.UnixEpoch;
        return new InternalSearchDocument($"category_{id:N}", "category", id.ToString("D"), category.Name,
            category.Description ?? string.Empty, category.Slug, category.Status, id.ToString("D"), category.Name,
            BuildCategoryPath(category, categories), string.Empty, string.Empty, string.Empty, ToUnixTime(updatedAt));
    }

    public async Task<IReadOnlyList<InternalSearchDocument>> GetAllAsync(CancellationToken cancellationToken)
    {
        var articleIds = await dbContext.Articles.AsNoTracking()
            .Where(article => article.DeletedAt == null && article.Status != ArticleStatuses.Deleted)
            .Select(article => article.ArticleId).ToListAsync(cancellationToken);
        var categoryIds = await dbContext.Categories.AsNoTracking().Select(category => category.CategoryId)
            .ToListAsync(cancellationToken);
        var documents = new List<InternalSearchDocument>(articleIds.Count + categoryIds.Count);
        foreach (var id in articleIds)
            if (await GetArticleAsync(id, cancellationToken) is { } document) documents.Add(document);
        foreach (var id in categoryIds)
            if (await GetCategoryAsync(id, cancellationToken) is { } document) documents.Add(document);
        return documents;
    }

    private async Task<string> ReadDraftTextAsync(string? textPath, string? jsonPath, CancellationToken token)
    {
        var path = !string.IsNullOrWhiteSpace(textPath) ? textPath : jsonPath;
        if (string.IsNullOrWhiteSpace(path)) return string.Empty;
        await using var source = await storage.DownloadAsync(options.Value.ArticleContentContainerName, path, token);
        using var reader = new StreamReader(source, Encoding.UTF8, true, leaveOpen: false);
        var value = await reader.ReadToEndAsync(token);
        if (!string.IsNullOrWhiteSpace(textPath)) return value;
        using var json = JsonDocument.Parse(value);
        var text = new StringBuilder();
        AppendText(json.RootElement, text);
        return text.ToString().Trim();
    }

    private static void AppendText(JsonElement element, StringBuilder destination)
    {
        if (element.ValueKind == JsonValueKind.Object)
        {
            if (element.TryGetProperty("text", out var text) && text.ValueKind == JsonValueKind.String)
                destination.Append(text.GetString()).Append(' ');
            foreach (var property in element.EnumerateObject())
                if (property.Name != "text") AppendText(property.Value, destination);
        }
        else if (element.ValueKind == JsonValueKind.Array)
            foreach (var child in element.EnumerateArray()) AppendText(child, destination);
    }

    private async Task<Dictionary<Guid, CategoryRow>> LoadCategoriesAsync(CancellationToken token) =>
        await dbContext.Categories.AsNoTracking().ToDictionaryAsync(category => category.CategoryId,
            category => new CategoryRow(category.CategoryId, category.ParentCategoryIdFk, category.Name,
                category.Slug, category.Description, category.Status, category.Visibility), token);

    private static bool IsPubliclyVisible(CategoryRow category, IReadOnlyDictionary<Guid, CategoryRow> all)
    {
        var seen = new HashSet<Guid>();
        for (var current = category; seen.Add(current.Id);)
        {
            if (current.Status != CategoryStatuses.Active || current.Visibility != ContentVisibilities.Public)
                return false;
            if (current.ParentId is not { } parentId) return true;
            if (!all.TryGetValue(parentId, out var parent)) return false;
            current = parent;
        }
        return false;
    }

    private static string BuildCategoryPath(CategoryRow? category, IReadOnlyDictionary<Guid, CategoryRow> all)
    {
        if (category is null) return string.Empty;
        var names = new Stack<string>();
        var seen = new HashSet<Guid>();
        for (var current = category; current is not null && seen.Add(current.Id);)
        {
            names.Push(current.Name);
            current = current.ParentId is { } parentId && all.TryGetValue(parentId, out var parent) ? parent : null;
        }
        return string.Join(" / ", names);
    }

    private static long ToUnixTime(DateTime value) => new DateTimeOffset(DateTime.SpecifyKind(value, DateTimeKind.Utc)).ToUnixTimeSeconds();
    private sealed record CategoryRow(Guid Id, Guid? ParentId, string Name, string Slug, string? Description,
        string Status, string Visibility);
}
