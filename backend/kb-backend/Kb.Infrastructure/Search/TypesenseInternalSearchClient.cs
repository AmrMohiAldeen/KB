using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Kb.Application.Exceptions;
using Kb.Application.Search;
using Microsoft.Extensions.Options;

namespace Kb.Infrastructure.Search;

internal sealed class TypesenseInternalSearchClient : IInternalSearchClient, ITypesenseInternalIndex, ITypesensePublicIndex
{
    private const string HighlightStart = "<mark>";
    private const string HighlightEnd = "</mark>";
    private readonly HttpClient http;
    private readonly InternalSearchOptions options;

    public TypesenseInternalSearchClient(HttpClient http, IOptions<InternalSearchOptions> options)
    {
        this.http = http;
        this.options = options.Value;
        if (Uri.TryCreate(this.options.Endpoint, UriKind.Absolute, out var endpoint)) http.BaseAddress = endpoint;
        if (!string.IsNullOrWhiteSpace(this.options.AdminApiKey))
            http.DefaultRequestHeaders.TryAddWithoutValidation("X-TYPESENSE-API-KEY", this.options.AdminApiKey);
        http.Timeout = TimeSpan.FromSeconds(15);
    }

    public async Task<InternalSearchResult> SearchAsync(InternalSearchQuery query, CancellationToken cancellationToken)
    {
        EnsureConfigured();
        await EnsureCollectionAsync(cancellationToken);
        var parameters = new Dictionary<string, string>
        {
            ["q"] = query.Query,
            ["query_by"] = "title,category_path,body",
            ["query_by_weights"] = "16,5,1",
            ["num_typos"] = "2,1,2",
            ["prefix"] = "true,true,true",
            ["prioritize_exact_match"] = "true",
            ["text_match_type"] = "max_weight",
            ["sort_by"] = "_text_match:desc,updated_at:desc",
            ["highlight_fields"] = "title,category_path,body",
            ["highlight_start_tag"] = HighlightStart,
            ["highlight_end_tag"] = HighlightEnd,
            ["snippet_threshold"] = "24",
            ["facet_by"] = "status,category_id,author_facet",
            ["max_facet_values"] = "100",
            ["page"] = query.Page.ToString(),
            ["per_page"] = query.PageSize.ToString()
        };
        var filters = new List<string>();
        if (query.Status is not null) filters.Add($"status:={FilterValue(query.Status)}");
        if (query.CategoryId is { } categoryId) filters.Add($"category_id:={categoryId:D}");
        if (query.OwnerId is { } ownerId) filters.Add($"author_id:={ownerId:D}");
        if (filters.Count > 0) parameters["filter_by"] = string.Join(" && ", filters);
        var uri = $"collections/{Uri.EscapeDataString(options.CollectionAlias)}/documents/search?" +
                  string.Join("&", parameters.Select(item => $"{Uri.EscapeDataString(item.Key)}={Uri.EscapeDataString(item.Value)}"));

        using var response = await SendAsync(() => http.GetAsync(uri, cancellationToken), cancellationToken);
        await EnsureSuccessAsync(response, "Internal search is temporarily unavailable.", cancellationToken);
        using var payload = JsonDocument.Parse(await response.Content.ReadAsStreamAsync(cancellationToken));
        var root = payload.RootElement;
        var hits = new List<InternalSearchHit>();
        if (root.TryGetProperty("hits", out var hitArray))
            foreach (var hit in hitArray.EnumerateArray()) hits.Add(ParseHit(hit));
        return new InternalSearchResult(hits, root.TryGetProperty("found", out var found) ? found.GetInt64() : hits.Count,
            query.Page, query.PageSize, ParseFacet(root, "status"), ParseFacet(root, "category_id"),
            ParseFacet(root, "author_facet"));
    }

    public async Task UpsertAsync(InternalSearchDocument document, CancellationToken cancellationToken)
    {
        EnsureConfigured();
        await EnsureCollectionAsync(cancellationToken);
        using var response = await SendAsync(() => http.PostAsJsonAsync(
            $"collections/{Uri.EscapeDataString(options.CollectionAlias)}/documents?action=upsert", document,
            cancellationToken), cancellationToken);
        await EnsureSuccessAsync(response, "The internal search document could not be indexed.", cancellationToken);
    }

    public async Task DeleteAsync(string documentId, CancellationToken cancellationToken)
    {
        EnsureConfigured();
        await EnsureCollectionAsync(cancellationToken);
        using var response = await SendAsync(() => http.DeleteAsync(
            $"collections/{Uri.EscapeDataString(options.CollectionAlias)}/documents/{Uri.EscapeDataString(documentId)}",
            cancellationToken), cancellationToken);
        if (response.StatusCode == HttpStatusCode.NotFound) return;
        await EnsureSuccessAsync(response, "The internal search document could not be removed.", cancellationToken);
    }

    async Task ITypesensePublicIndex.UpsertAsync(InternalSearchDocument document, CancellationToken cancellationToken)
    {
        EnsureConfigured();
        await EnsurePublicCollectionAsync(cancellationToken);
        using var response = await SendAsync(() => http.PostAsJsonAsync(
            $"collections/{Uri.EscapeDataString(options.PublicCollectionAlias)}/documents?action=upsert", document,
            cancellationToken), cancellationToken);
        await EnsureSuccessAsync(response, "The public search document could not be indexed.", cancellationToken);
    }

    async Task ITypesensePublicIndex.DeleteAsync(string documentId, CancellationToken cancellationToken)
    {
        EnsureConfigured();
        await EnsurePublicCollectionAsync(cancellationToken);
        using var response = await SendAsync(() => http.DeleteAsync(
            $"collections/{Uri.EscapeDataString(options.PublicCollectionAlias)}/documents/{Uri.EscapeDataString(documentId)}",
            cancellationToken), cancellationToken);
        if (response.StatusCode != HttpStatusCode.NotFound)
            await EnsureSuccessAsync(response, "The public search document could not be removed.", cancellationToken);
    }

    public async Task<string> RebuildAsync(IReadOnlyList<InternalSearchDocument> documents,
        CancellationToken cancellationToken)
    {
        EnsureConfigured();
        var collection = $"{options.CollectionAlias}_{DateTimeOffset.UtcNow:yyyyMMddHHmmssfff}";
        await CreateCollectionAsync(collection, cancellationToken);
        try
        {
            if (documents.Count > 0)
            {
                var ndjson = string.Join('\n', documents.Select(document => JsonSerializer.Serialize(document)));
                using var content = new StringContent(ndjson, Encoding.UTF8, "text/plain");
                using var import = await SendAsync(() => http.PostAsync(
                    $"collections/{Uri.EscapeDataString(collection)}/documents/import?action=upsert", content,
                    cancellationToken), cancellationToken);
                await EnsureSuccessAsync(import, "The replacement internal search index could not be populated.", cancellationToken);
                var lines = (await import.Content.ReadAsStringAsync(cancellationToken)).Split('\n', StringSplitOptions.RemoveEmptyEntries);
                if (lines.Any(line => !JsonDocument.Parse(line).RootElement.GetProperty("success").GetBoolean()))
                    throw new ExternalServiceException("At least one document failed during the internal search rebuild.");
            }
            using var alias = await SendAsync(() => http.PutAsJsonAsync(
                $"aliases/{Uri.EscapeDataString(options.CollectionAlias)}",
                new { collection_name = collection }, cancellationToken), cancellationToken);
            await EnsureSuccessAsync(alias, "The rebuilt internal search index could not be activated.", cancellationToken);
            return collection;
        }
        catch
        {
            try { await http.DeleteAsync($"collections/{Uri.EscapeDataString(collection)}", CancellationToken.None); }
            catch { /* A failed replacement can be removed by Typesense index maintenance. */ }
            throw;
        }
    }

    private async Task EnsureCollectionAsync(CancellationToken cancellationToken)
    {
        using var alias = await SendAsync(() => http.GetAsync(
            $"aliases/{Uri.EscapeDataString(options.CollectionAlias)}", cancellationToken), cancellationToken);
        if (alias.IsSuccessStatusCode) return;
        if (alias.StatusCode != HttpStatusCode.NotFound)
            await EnsureSuccessAsync(alias, "The internal search collection could not be resolved.", cancellationToken);
        var collection = $"{options.CollectionAlias}_initial";
        using var exists = await SendAsync(() => http.GetAsync(
            $"collections/{Uri.EscapeDataString(collection)}", cancellationToken), cancellationToken);
        if (exists.StatusCode == HttpStatusCode.NotFound) await CreateCollectionAsync(collection, cancellationToken);
        else await EnsureSuccessAsync(exists, "The internal search collection could not be resolved.", cancellationToken);
        using var createAlias = await SendAsync(() => http.PutAsJsonAsync(
            $"aliases/{Uri.EscapeDataString(options.CollectionAlias)}",
            new { collection_name = collection }, cancellationToken), cancellationToken);
        await EnsureSuccessAsync(createAlias, "The internal search alias could not be created.", cancellationToken);
    }

    private async Task EnsurePublicCollectionAsync(CancellationToken cancellationToken)
    {
        var aliasName = options.PublicCollectionAlias;
        using var alias = await SendAsync(() => http.GetAsync($"aliases/{Uri.EscapeDataString(aliasName)}",
            cancellationToken), cancellationToken);
        if (alias.IsSuccessStatusCode) return;
        if (alias.StatusCode != HttpStatusCode.NotFound)
            await EnsureSuccessAsync(alias, "The public search collection could not be resolved.", cancellationToken);
        var collection = $"{aliasName}_initial";
        using var exists = await SendAsync(() => http.GetAsync($"collections/{Uri.EscapeDataString(collection)}",
            cancellationToken), cancellationToken);
        if (exists.StatusCode == HttpStatusCode.NotFound) await CreateCollectionAsync(collection, cancellationToken);
        else await EnsureSuccessAsync(exists, "The public search collection could not be resolved.", cancellationToken);
        using var createAlias = await SendAsync(() => http.PutAsJsonAsync($"aliases/{Uri.EscapeDataString(aliasName)}",
            new { collection_name = collection }, cancellationToken), cancellationToken);
        await EnsureSuccessAsync(createAlias, "The public search alias could not be created.", cancellationToken);
    }

    private async Task CreateCollectionAsync(string name, CancellationToken cancellationToken)
    {
        var schema = new
        {
            name,
            fields = new object[]
            {
                new { name = "id", type = "string" }, new { name = "record_type", type = "string", facet = true },
                new { name = "entity_id", type = "string" }, new { name = "title", type = "string" },
                new { name = "body", type = "string" }, new { name = "slug", type = "string" },
                new { name = "status", type = "string", facet = true },
                new { name = "category_id", type = "string", facet = true },
                new { name = "category_name", type = "string" }, new { name = "category_path", type = "string" },
                new { name = "author_id", type = "string", facet = true },
                new { name = "author_name", type = "string" }, new { name = "author_facet", type = "string", facet = true },
                new { name = "updated_at", type = "int64", sort = true }
            },
            default_sorting_field = "updated_at"
        };
        using var response = await SendAsync(() => http.PostAsJsonAsync("collections", schema, cancellationToken),
            cancellationToken);
        if (response.StatusCode != HttpStatusCode.Conflict)
            await EnsureSuccessAsync(response, "The internal search collection could not be created.", cancellationToken);
    }

    private static InternalSearchHit ParseHit(JsonElement hit)
    {
        var document = hit.GetProperty("document");
        string? Highlight(string field)
        {
            if (!hit.TryGetProperty("highlights", out var highlights)) return null;
            foreach (var value in highlights.EnumerateArray())
                if (value.GetProperty("field").GetString() == field)
                    return value.TryGetProperty("snippet", out var snippet) ? snippet.GetString() :
                        value.TryGetProperty("value", out var full) ? full.GetString() : null;
            return null;
        }
        var kind = document.GetProperty("record_type").GetString()!;
        return new InternalSearchHit(kind, Guid.Parse(document.GetProperty("entity_id").GetString()!),
            document.GetProperty("title").GetString()!, document.GetProperty("slug").GetString()!,
            document.GetProperty("status").GetString()!, OptionalGuid(document, "category_id"),
            OptionalString(document, "category_name"), OptionalString(document, "category_path"),
            OptionalGuid(document, "author_id"), OptionalString(document, "author_name"),
            DateTimeOffset.FromUnixTimeSeconds(document.GetProperty("updated_at").GetInt64()).UtcDateTime,
            Highlight("title"), Highlight("category_path"), Highlight("body"));
    }

    private static IReadOnlyList<InternalSearchFacet> ParseFacet(JsonElement root, string field)
    {
        if (!root.TryGetProperty("facet_counts", out var facets)) return [];
        foreach (var facet in facets.EnumerateArray())
            if (facet.GetProperty("field_name").GetString() == field)
                return facet.GetProperty("counts").EnumerateArray()
                    .Select(value => new InternalSearchFacet(value.GetProperty("value").GetString()!, value.GetProperty("count").GetInt64()))
                    .ToArray();
        return [];
    }

    private static string? OptionalString(JsonElement value, string name) =>
        value.TryGetProperty(name, out var property) && !string.IsNullOrWhiteSpace(property.GetString()) ? property.GetString() : null;
    private static Guid? OptionalGuid(JsonElement value, string name) => Guid.TryParse(OptionalString(value, name), out var id) ? id : null;
    private static string FilterValue(string value) => $"`{value.Replace("`", "\\`")}`";

    private void EnsureConfigured()
    {
        if (http.BaseAddress is null || string.IsNullOrWhiteSpace(options.AdminApiKey) ||
            string.IsNullOrWhiteSpace(options.CollectionAlias))
            throw new ExternalServiceException("Internal Typesense search is not configured.");
        if (options.CollectionAlias.Contains("public", StringComparison.OrdinalIgnoreCase) ||
            options.CollectionAlias.Contains("viewer", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("The internal Typesense collection alias must not be a public/viewer collection.");
        if (string.IsNullOrWhiteSpace(options.PublicCollectionAlias) ||
            string.Equals(options.CollectionAlias, options.PublicCollectionAlias, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Public Typesense search must use a separate collection alias.");
    }

    private static async Task<HttpResponseMessage> SendAsync(
        Func<Task<HttpResponseMessage>> send,
        CancellationToken cancellationToken)
    {
        try
        {
            return await send();
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            throw new ExternalServiceException(
                "Internal search timed out while contacting Typesense. Verify the local Typesense service is running.");
        }
        catch (HttpRequestException exception)
        {
            throw new ExternalServiceException(
                "Internal search could not reach Typesense. Verify the configured endpoint and that the service is running.",
                exception);
        }
    }

    private static Task EnsureSuccessAsync(HttpResponseMessage response, string message, CancellationToken token)
    {
        if (response.IsSuccessStatusCode) return Task.CompletedTask;
        _ = token;
        throw new ExternalServiceException(
            $"{message} Typesense returned {(int)response.StatusCode} ({response.ReasonPhrase ?? "unknown error"}).");
    }
}
