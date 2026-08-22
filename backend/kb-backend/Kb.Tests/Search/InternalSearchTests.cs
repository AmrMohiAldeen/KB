using System.Net;
using System.Text;
using System.Text.Json;
using Kb.Application.Abstractions;
using Kb.Application.Abstractions.Storage;
using Kb.Application.Exceptions;
using Kb.Application.Search;
using Kb.Application.Viewer;
using Kb.Domain.Constants;
using Kb.Infrastructure.Data;
using Kb.Infrastructure.Data.Entities;
using Kb.Infrastructure.Search;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Kb.Tests.Search;

public sealed class InternalSearchTests
{
    [Fact]
    public async Task Service_requires_authentication_and_validates_pagination()
    {
        var client = new CapturingClient();
        var current = new CurrentUser(false);
        var service = new InternalSearchService(client, current);
        await Assert.ThrowsAsync<UnauthorizedAccessException>(() =>
            service.SearchAsync("draft", null, null, null, 1, 25, default));
        current.Authenticated = true;
        await Assert.ThrowsAsync<BusinessRuleException>(() =>
            service.SearchAsync("draft", null, null, null, 0, 25, default));
        await service.SearchAsync("  draft body  ", "Archived", null, null, 2, 20, default);
        Assert.Equal(new InternalSearchQuery("draft body", "Archived", null, null, 2, 20), client.Query);
    }

    [Fact]
    public async Task Typesense_query_prioritizes_titles_enables_typos_and_sends_filters_backend_side()
    {
        var handler = new TypesenseHandler();
        var options = Options.Create(new InternalSearchOptions
        {
            Endpoint = "https://typesense.example.test/",
            AdminApiKey = "server-only-key",
            CollectionAlias = "internal_kb_documents"
        });
        var client = new TypesenseInternalSearchClient(new HttpClient(handler), options);
        await client.SearchAsync(new InternalSearchQuery("onbaording", "Archived",
            Guid.Parse("11111111-1111-1111-1111-111111111111"),
            Guid.Parse("22222222-2222-2222-2222-222222222222"), 1, 25), default);

        var query = handler.SearchUri!.Query;
        Assert.Contains("query_by=title%2Ccategory_path%2Cbody", query);
        Assert.Contains("query_by_weights=16%2C5%2C1", query);
        Assert.Contains("num_typos=2%2C1%2C2", query);
        Assert.Contains("prioritize_exact_match=true", query);
        Assert.Contains("status%3A%3D%60Archived%60", query);
        Assert.Equal("server-only-key", handler.ApiKey);
    }

    [Fact]
    public async Task Viewer_typesense_query_has_non_overridable_solution_and_visibility_filters()
    {
        var handler = new TypesenseHandler();
        var solutionId = Guid.Parse("33333333-3333-3333-3333-333333333333");
        var client = new TypesenseInternalSearchClient(new HttpClient(handler), Options.Create(new InternalSearchOptions
        {
            Endpoint = "https://typesense.example.test/", AdminApiKey = "server-only-key",
            CollectionAlias = "internal_kb_documents", PublicCollectionAlias = "public_kb_documents"
        }));

        await ((IViewerSearchClient)client).SearchAsync(solutionId, "onboarding", 25, default);

        var query = Uri.UnescapeDataString(handler.SearchUri!.Query);
        Assert.Contains($"solution_ids:={solutionId:D}", query);
        Assert.Contains("record_type:=`article`", query);
        Assert.Contains("is_published:=true", query);
        Assert.Contains("is_public:=true", query);
        Assert.Contains("is_archived:=false", query);
        Assert.Contains("is_deleted:=false", query);
        Assert.DoesNotContain("internal_kb_documents/documents/search", handler.SearchUri.AbsolutePath);
    }

    [Fact]
    public async Task Viewer_preview_search_has_non_overridable_category_subtree_and_visibility_filters()
    {
        var handler = new TypesenseHandler();
        var rootCategoryId = Guid.Parse("44444444-4444-4444-4444-444444444444");
        var client = new TypesenseInternalSearchClient(new HttpClient(handler), Options.Create(new InternalSearchOptions
        {
            Endpoint = "https://typesense.example.test/", AdminApiKey = "server-only-key",
            CollectionAlias = "internal_kb_documents", PublicCollectionAlias = "public_kb_documents"
        }));

        await ((IViewerSearchClient)client).SearchPreviewAsync(rootCategoryId, "onboarding", 25, default);

        var query = Uri.UnescapeDataString(handler.SearchUri!.Query);
        Assert.Contains($"category_ancestor_ids:={rootCategoryId:D}", query);
        Assert.DoesNotContain("solution_ids:=", query);
        Assert.Contains("record_type:=`article`", query);
        Assert.Contains("is_published:=true", query);
        Assert.Contains("is_public:=true", query);
        Assert.Contains("is_archived:=false", query);
        Assert.Contains("is_deleted:=false", query);
    }

    [Fact]
    public async Task Typesense_unconfigured_and_unavailable_fail_with_controlled_search_errors()
    {
        var unconfigured = new TypesenseInternalSearchClient(new HttpClient(new TypesenseHandler()),
            Options.Create(new InternalSearchOptions()));
        var missing = await Assert.ThrowsAsync<ExternalServiceException>(() => unconfigured.SearchAsync(
            new InternalSearchQuery("article", null, null, null, 1, 25), default));
        Assert.Contains("not configured", missing.Message, StringComparison.OrdinalIgnoreCase);

        var unavailable = new TypesenseInternalSearchClient(new HttpClient(new UnavailableHandler()),
            Options.Create(new InternalSearchOptions
            {
                Endpoint = "http://127.0.0.1:8108/",
                AdminApiKey = "development-key",
                CollectionAlias = "internal_kb_documents"
            }));
        var failure = await Assert.ThrowsAsync<ExternalServiceException>(() => unavailable.SearchAsync(
            new InternalSearchQuery("article", null, null, null, 1, 25), default));
        Assert.Contains("could not reach Typesense", failure.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Typesense_rebuild_imports_all_documents_and_switches_the_internal_alias()
    {
        var handler = new RebuildHandler();
        var client = new TypesenseInternalSearchClient(new HttpClient(handler),
            Options.Create(new InternalSearchOptions
            {
                Endpoint = "https://typesense.example.test/",
                AdminApiKey = "server-only-key",
                CollectionAlias = "internal_kb_documents"
            }));
        var collection = await client.RebuildAsync([
            new InternalSearchDocument("article_one", "article", Guid.NewGuid().ToString("D"),
                "Article title", "Current draft body", "article-title", "Draft", string.Empty,
                string.Empty, string.Empty, Guid.NewGuid().ToString("D"), "Owner", "owner|Owner", 1)
        ], default);

        Assert.StartsWith("internal_kb_documents_", collection);
        Assert.Contains("Current draft body", handler.ImportBody);
        Assert.Equal(collection, handler.AliasCollection);
    }

    [Fact]
    public async Task Search_document_uses_live_version_while_a_published_article_has_a_new_draft()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        await using var db = new KbDbContext(new DbContextOptionsBuilder<KbDbContext>()
            .UseSqlite(connection).Options);
        await db.Database.EnsureCreatedAsync();
        var userId = Guid.NewGuid();
        var categoryId = Guid.NewGuid();
        var articleId = Guid.NewGuid();
        var draftId = Guid.NewGuid();
        var now = DateTime.UtcNow;
        db.Users.Add(new User
            { UserId = userId, Email = "owner@example.test", FullName = "Owner", IsActive = true, CreatedAt = now });
        db.Categories.Add(new Category
            { CategoryId = categoryId, Name = "Guides", Slug = "guides", SortOrder = 0, Depth = 0 });
        db.Articles.Add(new Article
        {
            ArticleId = articleId, Title = "Search lifecycle", Slug = "search-lifecycle",
            CategoryIdFk = categoryId, AuthorIdFk = userId, Status = ArticleStatuses.Published,
            CreatedAt = now, UpdatedAt = now
        });
        await db.SaveChangesAsync();
        var rowVersion = Guid.NewGuid().ToByteArray();
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO ARTICLE_DRAFTS
                (DraftID, ArticleID_FK, DraftNumber, ContentJsonStoragePath, ContentSizeBytes,
                 RowVersion, IsLocked, CreatedBy_FK, UpdatedBy_FK, CreatedAt, UpdatedAt, Status)
            VALUES ({draftId}, {articleId}, {2}, {"draft/current.json"}, {20L}, {rowVersion}, {false},
                    {userId}, {userId}, {now}, {now}, {ArticleStatuses.Draft})
            """);
        var version = new ArticleVersion
        {
            VersionId = Guid.NewGuid(), ArticleIdFk = articleId, VersionNumber = 1,
            SnapshotReason = ArticleSnapshotReasons.SubmittedForReview,
            ContentJsonStoragePath = "version/old.json", PlainTextStoragePath = "version/old.txt",
            ContentSizeBytes = 20, CreatedByFk = userId, CreatedAt = now
        };
        db.ArticleVersions.Add(version);
        var article = await db.Articles.SingleAsync();
        article.CurrentDraftIdFk = draftId;
        article.LastPublishedVersionIdFk = version.VersionId;
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();
        var storage = new MemoryStorage();
        storage.Seed("draft/current.json",
            """{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"new draft text"}]}]}""");
        storage.Seed("version/old.json", """{"type":"doc","content":[]}""");
        storage.Seed("version/old.txt", "old published text");
        var source = new InternalSearchDocumentSource(db, storage, Options.Create(new InternalSearchOptions()));

        var current = await source.GetArticleAsync(articleId, default);
        Assert.Equal("old published text", current!.Body);
        Assert.Equal("Owner", current.AuthorName);
        Assert.Equal($"{userId:D}|Owner", current.AuthorFacet);
        await db.Articles.Where(item => item.ArticleId == articleId)
            .ExecuteUpdateAsync(setters => setters.SetProperty(item => item.CurrentDraftIdFk, (Guid?)null));
        var fallback = await source.GetArticleAsync(articleId, default);
        Assert.Equal("old published text", fallback!.Body);
    }

    private sealed class CapturingClient : IInternalSearchClient
    {
        public InternalSearchQuery? Query { get; private set; }
        public Task<InternalSearchResult> SearchAsync(InternalSearchQuery query, CancellationToken cancellationToken)
        {
            Query = query;
            return Task.FromResult(new InternalSearchResult([], 0, query.Page, query.PageSize, [], [], []));
        }
    }

    private sealed class CurrentUser(bool authenticated) : ICurrentUser
    {
        public bool Authenticated { get; set; } = authenticated;
        public bool IsAuthenticated => Authenticated;
        public Guid UserId => Guid.NewGuid();
        public string? Email => null;
    }

    private sealed class TypesenseHandler : HttpMessageHandler
    {
        public Uri? SearchUri { get; private set; }
        public string? ApiKey { get; private set; }
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            ApiKey = request.Headers.GetValues("X-TYPESENSE-API-KEY").Single();
            if (request.RequestUri!.AbsolutePath.StartsWith("/aliases/"))
                return Json("{\"collection_name\":\"internal_kb_documents_initial\"}");
            SearchUri = request.RequestUri;
            return Json("{\"found\":0,\"hits\":[],\"facet_counts\":[]}");
        }
        private static Task<HttpResponseMessage> Json(string value) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
        { Content = new StringContent(value, Encoding.UTF8, "application/json") });
    }

    private sealed class UnavailableHandler : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken) =>
            throw new HttpRequestException("Connection refused");
    }

    private sealed class RebuildHandler : HttpMessageHandler
    {
        public string ImportBody { get; private set; } = string.Empty;
        public string AliasCollection { get; private set; } = string.Empty;

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
        {
            if (request.RequestUri!.AbsolutePath.EndsWith("/documents/import", StringComparison.Ordinal))
            {
                ImportBody = await request.Content!.ReadAsStringAsync(cancellationToken);
                return Json("{\"success\":true}");
            }
            if (request.RequestUri.AbsolutePath.StartsWith("/aliases/", StringComparison.Ordinal))
            {
                using var body = JsonDocument.Parse(await request.Content!.ReadAsStringAsync(cancellationToken));
                AliasCollection = body.RootElement.GetProperty("collection_name").GetString()!;
                return Json("{}");
            }
            return Json("{}");
        }

        private static HttpResponseMessage Json(string value) => new(HttpStatusCode.OK)
        {
            Content = new StringContent(value, Encoding.UTF8, "application/json")
        };
    }

    private sealed class MemoryStorage : IObjectStorage
    {
        private readonly Dictionary<string, byte[]> content = new(StringComparer.Ordinal);
        public void Seed(string path, string value) => content[path] = Encoding.UTF8.GetBytes(value);
        public Task<Stream> DownloadAsync(string containerName, string objectName,
            CancellationToken cancellationToken) => Task.FromResult<Stream>(
            new MemoryStream(content[objectName], writable: false));
        public Task<string> UploadAsync(string containerName, string objectName, Stream value,
            string contentType, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task DeleteAsync(string containerName, string objectName,
            CancellationToken cancellationToken) => throw new NotSupportedException();
    }
}
