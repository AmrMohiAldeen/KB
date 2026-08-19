using System.Text.Json.Serialization;

namespace Kb.Infrastructure.Search;

public sealed class InternalSearchOptions
{
    public string Endpoint { get; set; } = string.Empty;
    public string AdminApiKey { get; set; } = string.Empty;
    public string CollectionAlias { get; set; } = "internal_kb_documents";
    public string PublicCollectionAlias { get; set; } = "public_kb_documents";
    public string ArticleContentContainerName { get; set; } = "article-content";
    public TimeSpan PollInterval { get; set; } = TimeSpan.FromSeconds(2);
    public TimeSpan DraftDebounce { get; set; } = TimeSpan.FromSeconds(3);
    public int MaxRetries { get; set; } = 8;
}

internal sealed record InternalSearchDocument(
    [property: JsonPropertyName("id")] string DocumentId,
    [property: JsonPropertyName("record_type")] string RecordType,
    [property: JsonPropertyName("entity_id")] string EntityId,
    [property: JsonPropertyName("title")] string Title,
    [property: JsonPropertyName("body")] string Body,
    [property: JsonPropertyName("slug")] string Slug,
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("category_id")] string CategoryId,
    [property: JsonPropertyName("category_name")] string CategoryName,
    [property: JsonPropertyName("category_path")] string CategoryPath,
    [property: JsonPropertyName("author_id")] string AuthorId,
    [property: JsonPropertyName("author_name")] string AuthorName,
    [property: JsonPropertyName("author_facet")] string AuthorFacet,
    [property: JsonPropertyName("updated_at")] long UpdatedAt,
    [property: JsonPropertyName("solution_ids")] string[]? SolutionIds = null,
    [property: JsonPropertyName("is_published")] bool IsPublished = false,
    [property: JsonPropertyName("is_public")] bool IsPublic = false,
    [property: JsonPropertyName("is_archived")] bool IsArchived = false,
    [property: JsonPropertyName("is_deleted")] bool IsDeleted = false,
    [property: JsonPropertyName("category_ancestor_ids")] string[]? CategoryAncestorIds = null);

internal interface ITypesenseInternalIndex
{
    Task UpsertAsync(InternalSearchDocument document, CancellationToken cancellationToken);
    Task DeleteAsync(string documentId, CancellationToken cancellationToken);
    Task<string> RebuildAsync(IReadOnlyList<InternalSearchDocument> documents, CancellationToken cancellationToken);
}

internal interface ITypesensePublicIndex
{
    Task UpsertAsync(InternalSearchDocument document, CancellationToken cancellationToken);
    Task DeleteAsync(string documentId, CancellationToken cancellationToken);
    Task<string> RebuildAsync(IReadOnlyList<InternalSearchDocument> documents, CancellationToken cancellationToken);
}
