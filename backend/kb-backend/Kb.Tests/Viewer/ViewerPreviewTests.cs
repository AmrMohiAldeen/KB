using System.Text;
using Kb.Api.Authentication;
using Kb.Api.Controllers;
using Kb.Application.Abstractions;
using Kb.Application.Abstractions.Storage;
using Kb.Application.Exceptions;
using Kb.Application.Viewer;
using Kb.Domain.Constants;
using Kb.Infrastructure.Data;
using Kb.Infrastructure.Data.Entities;
using Kb.Infrastructure.Viewer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Kb.Tests.Viewer;

public sealed class ViewerPreviewTests
{
    [Fact]
    public async Task Authenticated_internal_user_can_preview_any_visible_category_as_the_root_without_viewer_rows()
    {
        await using var fixture = await Fixture.CreateAsync();
        var before = await fixture.ViewerRowCountsAsync();

        var portal = await fixture.Service.GetPreviewPortalAsync("getting-started", default);
        var otherRoot = await fixture.Service.GetPreviewPortalAsync("advanced", default);
        var tree = await fixture.Service.GetPreviewTreeAsync("getting-started", default);
        var articles = await fixture.Service.GetPreviewArticlesAsync("getting-started", null, null, default);

        Assert.Equal(fixture.SelectedId, portal.RootId);
        Assert.Equal("advanced", otherRoot.Slug);
        var root = Assert.Single(tree);
        Assert.Equal("Getting Started", root.Name);
        Assert.Null(root.ParentId);
        Assert.Equal(["Install"], root.Children.Select(item => item.Name));
        Assert.Equal(["child-visible", "selected-visible"], articles.Select(item => item.Slug).Order());
        Assert.DoesNotContain(articles, item => item.Slug is "parent-visible" or "sibling-visible" or
            "draft" or "internal" or "archived" or "deleted");
        Assert.Equal(before, await fixture.ViewerRowCountsAsync());
    }

    [Fact]
    public async Task Preview_direct_article_access_rejects_articles_outside_root_and_hidden_roots()
    {
        await using var fixture = await Fixture.CreateAsync();

        var visible = await fixture.Service.GetPreviewArticleBySlugAsync("getting-started", "child-visible", default);
        Assert.Equal("child-visible", visible.Slug);
        await Assert.ThrowsAsync<NotFoundException>(() =>
            fixture.Service.GetPreviewArticleByIdAsync("getting-started", fixture.SiblingArticleId, default));
        await Assert.ThrowsAsync<NotFoundException>(() =>
            fixture.Service.GetPreviewArticleBySlugAsync("getting-started", "sibling-visible", default));
        await Assert.ThrowsAsync<NotFoundException>(() =>
            fixture.Service.GetPreviewPortalAsync("staff", default));
    }

    [Fact]
    public async Task Preview_requires_internal_identity_and_does_not_select_viewer_cookie_scheme()
    {
        await using var fixture = await Fixture.CreateAsync();
        fixture.CurrentUser.RejectInternalIdentity = true;

        await Assert.ThrowsAsync<UnauthorizedAccessException>(() =>
            fixture.Service.GetPreviewPortalAsync("getting-started", default));

        var previewAuthorization = Assert.Single(typeof(ViewerPreviewController)
            .GetCustomAttributes(typeof(AuthorizeAttribute), true).Cast<AuthorizeAttribute>());
        Assert.True(string.IsNullOrWhiteSpace(previewAuthorization.AuthenticationSchemes));
        Assert.Equal(ViewerPreviewAuthorizationDefaults.Policy, previewAuthorization.Policy);
        var externalAuthorization = Assert.Single(typeof(ViewerKnowledgeBaseController)
            .GetCustomAttributes(typeof(AuthorizeAttribute), true).Cast<AuthorizeAttribute>());
        Assert.Equal(ViewerAuthenticationDefaults.Scheme, externalAuthorization.AuthenticationSchemes);
    }

    private sealed class Fixture : IAsyncDisposable
    {
        private readonly SqliteConnection connection;
        private readonly MemoryStorage storage;
        public KbDbContext Context { get; }
        public ViewerService Service { get; }
        public CurrentUser CurrentUser { get; }
        public Guid SelectedId { get; private init; }
        public Guid InternalCategoryId { get; private init; }
        public Guid SiblingArticleId { get; private init; }

        private Fixture(SqliteConnection connection, KbDbContext context, MemoryStorage storage,
            ViewerService service, CurrentUser currentUser) =>
            (this.connection, Context, this.storage, Service, CurrentUser) =
                (connection, context, storage, service, currentUser);

        public static async Task<Fixture> CreateAsync()
        {
            var connection = new SqliteConnection("Data Source=:memory:");
            await connection.OpenAsync();
            var context = new KbDbContext(new DbContextOptionsBuilder<KbDbContext>().UseSqlite(connection).Options);
            await context.Database.EnsureCreatedAsync();
            var now = DateTime.UtcNow;
            var userId = Guid.NewGuid();
            var parentId = Guid.NewGuid();
            var selectedId = Guid.NewGuid();
            var childId = Guid.NewGuid();
            var siblingId = Guid.NewGuid();
            var internalId = Guid.NewGuid();
            var archivedId = Guid.NewGuid();
            context.Users.Add(new User
                { UserId = userId, Email = "previewer@example.test", FullName = "Previewer", IsActive = true, CreatedAt = now });
            context.Categories.AddRange(
                Category(parentId, null, "Products", $"/{parentId:N}/", 0),
                Category(selectedId, parentId, "Getting Started", $"/{parentId:N}/{selectedId:N}/", 1),
                Category(childId, selectedId, "Install", $"/{parentId:N}/{selectedId:N}/{childId:N}/", 2),
                Category(siblingId, parentId, "Advanced", $"/{parentId:N}/{siblingId:N}/", 1),
                Category(internalId, selectedId, "Staff", $"/{parentId:N}/{selectedId:N}/{internalId:N}/", 2,
                    visibility: ContentVisibilities.Internal),
                Category(archivedId, selectedId, "Old", $"/{parentId:N}/{selectedId:N}/{archivedId:N}/", 2,
                    status: CategoryStatuses.Archived));
            await context.SaveChangesAsync();
            var storage = new MemoryStorage();
            _ = await AddArticleAsync(context, storage, userId, parentId, "parent-visible", ArticleStatuses.Published,
                ContentVisibilities.Public, now);
            _ = await AddArticleAsync(context, storage, userId, selectedId, "selected-visible", ArticleStatuses.Published,
                ContentVisibilities.Public, now);
            _ = await AddArticleAsync(context, storage, userId, childId, "child-visible", ArticleStatuses.Published,
                ContentVisibilities.Public, now);
            var siblingArticleId = await AddArticleAsync(context, storage, userId, siblingId, "sibling-visible",
                ArticleStatuses.Published, ContentVisibilities.Public, now);
            _ = await AddArticleAsync(context, storage, userId, selectedId, "draft", ArticleStatuses.Draft,
                ContentVisibilities.Public, now);
            _ = await AddArticleAsync(context, storage, userId, selectedId, "internal", ArticleStatuses.Published,
                ContentVisibilities.Internal, now);
            _ = await AddArticleAsync(context, storage, userId, selectedId, "archived", ArticleStatuses.Archived,
                ContentVisibilities.Public, now);
            _ = await AddArticleAsync(context, storage, userId, selectedId, "deleted", ArticleStatuses.Published,
                ContentVisibilities.Public, now, deleted: true);
            var repository = new ViewerRepository(context, TimeProvider.System);
            var currentUser = new CurrentUser(userId);
            var service = new ViewerService(repository, new EmptySearch(), new EmptyViewer(), storage,
                Options.Create(new ViewerAuthenticationOptions()), TimeProvider.System, currentUser);
            context.ChangeTracker.Clear();
            return new Fixture(connection, context, storage, service, currentUser)
            {
                SelectedId = selectedId, InternalCategoryId = internalId, SiblingArticleId = siblingArticleId
            };
        }

        public async Task<(int Solutions, int Entitlements, int Sessions)> ViewerRowCountsAsync() =>
            (await Context.ViewerSolutions.CountAsync(), await Context.ViewerEntitlements.CountAsync(),
                await Context.ViewerSessions.CountAsync());

        private static Category Category(Guid id, Guid? parentId, string name, string path, int depth,
            string status = CategoryStatuses.Active, string visibility = ContentVisibilities.Public) => new()
        {
            CategoryId = id, ParentCategoryIdFk = parentId, Name = name,
            Slug = name.ToLowerInvariant().Replace(' ', '-'), Path = path, Depth = depth,
            Status = status, Visibility = visibility
        };

        private static async Task<Guid> AddArticleAsync(KbDbContext context, MemoryStorage storage, Guid userId,
            Guid categoryId, string slug, string status, string visibility, DateTime now, bool deleted = false)
        {
            var id = Guid.NewGuid();
            var versionId = Guid.NewGuid();
            var path = $"articles/{id:N}.json";
            var article = new Article
            {
                ArticleId = id, Title = slug, Slug = slug, CategoryIdFk = categoryId, AuthorIdFk = userId,
                Status = status, Visibility = visibility, CreatedAt = now, UpdatedAt = now,
                DeletedAt = deleted ? now : null
            };
            context.Articles.Add(article);
            await context.SaveChangesAsync();
            context.ArticleVersions.Add(new ArticleVersion
            {
                VersionId = versionId, ArticleIdFk = id, VersionNumber = 1, SnapshotReason = "Published",
                ContentJsonStoragePath = path, ContentSizeBytes = 2, CreatedByFk = userId, CreatedAt = now,
                PublishedByFk = userId, PublishedAt = now
            });
            await context.SaveChangesAsync();
            article.LastPublishedVersionIdFk = versionId;
            await context.SaveChangesAsync();
            storage.Seed(path, "{\"type\":\"doc\",\"content\":[]}");
            return id;
        }

        public async ValueTask DisposeAsync()
        {
            await Context.DisposeAsync();
            await connection.DisposeAsync();
        }
    }

    private sealed class CurrentUser(Guid userId) : ICurrentUser
    {
        public bool RejectInternalIdentity { get; set; }
        public bool IsAuthenticated => true;
        public Guid UserId => RejectInternalIdentity
            ? throw new UnauthorizedAccessException("External Viewer identities have no internal user ID.")
            : userId;
        public string? Email => "previewer@example.test";
    }

    private sealed class EmptyViewer : ICurrentViewer
    {
        public bool IsAuthenticated => false;
        public Guid SessionId => Guid.Empty;
        public Guid CustomerId => Guid.Empty;
        public string ExternalUserId => string.Empty;
        public string ExternalUserEmail => string.Empty;
    }

    private sealed class EmptySearch : IViewerSearchClient
    {
        public Task<IReadOnlyList<ViewerArticleSummary>> SearchAsync(Guid solutionId, string query, int limit,
            CancellationToken cancellationToken) => Task.FromResult<IReadOnlyList<ViewerArticleSummary>>([]);
        public Task<IReadOnlyList<ViewerArticleSummary>> SearchPreviewAsync(Guid rootCategoryId, string query,
            int limit, CancellationToken cancellationToken) => Task.FromResult<IReadOnlyList<ViewerArticleSummary>>([]);
    }

    private sealed class MemoryStorage : IObjectStorage
    {
        private readonly Dictionary<string, byte[]> values = [];
        public void Seed(string path, string value) => values[path] = Encoding.UTF8.GetBytes(value);
        public Task<Stream> DownloadAsync(string containerName, string objectName,
            CancellationToken cancellationToken) => Task.FromResult<Stream>(new MemoryStream(values[objectName]));
        public Task<string> UploadAsync(string containerName, string objectName, Stream value, string contentType,
            CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task DeleteAsync(string containerName, string objectName,
            CancellationToken cancellationToken) => throw new NotSupportedException();
    }
}
