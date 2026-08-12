using System.Text;
using Kb.Application.Abstractions;
using Kb.Application.Abstractions.Storage;
using Kb.Application.Exceptions;
using Kb.Application.ExportJobs;
using Kb.Domain.Constants;
using Kb.Infrastructure.Data;
using Kb.Infrastructure.Data.Entities;
using Kb.Infrastructure.ExportJobs;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace Kb.Tests.ExportJobs;

public sealed class ExportJobSliceTests
{
    [Fact]
    public async Task Html_article_export_uses_the_version_frozen_when_requested_and_stores_result_path()
    {
        await using var f = await Fixture.CreateAsync();
        var job = await f.Repository.CreateArticleAsync(f.FirstArticleId, ExportTypes.Html, f.UserId,
            f.Now, default);
        await f.ReplacePublishedVersionAsync("<p>new live content</p>");

        Assert.True(await f.Processor().ProcessNextAsync(default));

        var completed = await f.Repository.GetAsync(job.Id, default);
        Assert.Equal(JobStatuses.Completed, completed!.Status);
        Assert.NotNull(completed.ResultPath);
        var output = f.Storage.Text(f.Options.ContainerName, completed.ResultPath!);
        Assert.Contains("stable article one", output);
        Assert.DoesNotContain("new live content", output);
    }

    [Fact]
    public async Task Pdf_article_export_uses_the_html_renderer_and_stores_a_pdf()
    {
        await using var f = await Fixture.CreateAsync();
        var job = await f.Repository.CreateArticleAsync(f.FirstArticleId, ExportTypes.Pdf, f.UserId,
            f.Now, default);

        await f.Processor().ProcessNextAsync(default);

        var completed = await f.Repository.GetAsync(job.Id, default);
        Assert.Equal(JobStatuses.Completed, completed!.Status);
        Assert.Equal("%PDF-fake", f.Storage.Text(f.Options.ContainerName, completed.ResultPath!));
        Assert.Contains("stable article one", f.Pdf.LastHtml);
    }

    [Fact]
    public async Task Category_export_preserves_article_position_then_nested_category_hierarchy()
    {
        await using var f = await Fixture.CreateAsync();
        var job = await f.Repository.CreateCategoryAsync(f.RootCategoryId, ExportTypes.Html, f.UserId,
            f.Now, default);

        await f.Processor().ProcessNextAsync(default);

        var completed = await f.Repository.GetAsync(job.Id, default);
        var html = f.Storage.Text(f.Options.ContainerName, completed!.ResultPath!);
        Assert.True(html.IndexOf("Article zero", StringComparison.Ordinal) <
                    html.IndexOf("Article one", StringComparison.Ordinal));
        Assert.True(html.IndexOf("Article one", StringComparison.Ordinal) <
                    html.IndexOf("Child category", StringComparison.Ordinal));
        Assert.True(html.IndexOf("Child category", StringComparison.Ordinal) <
                    html.IndexOf("Nested article", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Category_request_rejects_any_article_without_a_stable_published_version()
    {
        await using var f = await Fixture.CreateAsync();
        var article = new Article
        {
            ArticleId = Guid.NewGuid(), Title = "Draft only", Slug = "draft-only",
            CategoryIdFk = f.RootCategoryId, AuthorIdFk = f.UserId, Status = ArticleStatuses.Draft,
            Position = 9, CreatedAt = f.Now, UpdatedAt = f.Now
        };
        f.Context.Articles.Add(article);
        await f.Context.SaveChangesAsync();

        var error = await Assert.ThrowsAsync<BusinessRuleException>(() => f.Repository.CreateCategoryAsync(
            f.RootCategoryId, ExportTypes.Html, f.UserId, f.Now, default));
        Assert.Contains("Draft only", error.Message);
    }

    [Fact]
    public async Task Another_non_admin_user_cannot_read_or_download_an_export_job()
    {
        await using var f = await Fixture.CreateAsync();
        var job = await f.Repository.CreateArticleAsync(f.FirstArticleId, ExportTypes.Html, f.UserId,
            f.Now, default);
        f.Current.UserIdValue = f.OtherUserId;

        await Assert.ThrowsAsync<ForbiddenException>(() => f.Service().GetAsync(job.Id, default));
        await Assert.ThrowsAsync<ForbiddenException>(() => f.Service().DownloadAsync(job.Id, default));
    }

    [Fact]
    public async Task Renderer_failure_marks_job_failed_with_completion_time()
    {
        await using var f = await Fixture.CreateAsync();
        f.Pdf.Fail = true;
        var job = await f.Repository.CreateArticleAsync(f.FirstArticleId, ExportTypes.Pdf, f.UserId,
            f.Now, default);

        await f.Processor().ProcessNextAsync(default);

        var failed = await f.Repository.GetAsync(job.Id, default);
        Assert.Equal(JobStatuses.Failed, failed!.Status);
        Assert.NotNull(failed.CompletedAt);
        Assert.NotNull(failed.ErrorMessage);
        Assert.Null(failed.ResultPath);
    }

    [Fact]
    public async Task Missing_media_is_represented_without_leaking_the_api_path_or_media_id()
    {
        await using var f = await Fixture.CreateAsync();
        var mediaId = Guid.NewGuid();
        f.Storage.Seed(f.Options.ArticleContentContainerName, "versions/one/content.html",
            $"<p>Text</p><img src=\"/api/media/{mediaId}/content\" data-media-id=\"{mediaId}\">");
        var job = await f.Repository.CreateArticleAsync(f.FirstArticleId, ExportTypes.Html, f.UserId,
            f.Now, default);

        await f.Processor().ProcessNextAsync(default);

        var completed = await f.Repository.GetAsync(job.Id, default);
        var html = f.Storage.Text(f.Options.ContainerName, completed!.ResultPath!);
        Assert.Contains("Media unavailable", html);
        Assert.DoesNotContain("/api/", html);
        Assert.DoesNotContain(mediaId.ToString(), html, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Category_export_marks_an_article_with_missing_content_and_completes_the_rest()
    {
        await using var f = await Fixture.CreateAsync();
        f.Storage.Remove(f.Options.ArticleContentContainerName, "versions/nested/content.html");
        f.Storage.Remove(f.Options.ArticleContentContainerName, "versions/nested/content.json");
        var job = await f.Repository.CreateCategoryAsync(f.RootCategoryId, ExportTypes.Html, f.UserId,
            f.Now, default);

        await f.Processor().ProcessNextAsync(default);

        var completed = await f.Repository.GetAsync(job.Id, default);
        var html = f.Storage.Text(f.Options.ContainerName, completed!.ResultPath!);
        Assert.Equal(JobStatuses.Completed, completed.Status);
        Assert.Contains("stable article one", html);
        Assert.Contains("stored content is unavailable", html);
    }

    [Fact]
    public async Task Static_export_expands_accordions_and_keeps_every_labelled_tab()
    {
        await using var f = await Fixture.CreateAsync();
        f.Storage.Seed(f.Options.ArticleContentContainerName, "versions/one/content.html", """
            <details data-kb-accordion-item><summary>More</summary><p>Expanded text</p></details>
            <div data-kb-tabs><section class="kb-tabs__static-item" data-kb-tab-item>
            <h3 data-kb-tab-label-static>First tab</h3><p>First content</p></section>
            <section class="kb-tabs__static-item" data-kb-tab-item>
            <h3 data-kb-tab-label-static>Second tab</h3><p>Second content</p></section></div>
            """);
        var job = await f.Repository.CreateArticleAsync(f.FirstArticleId, ExportTypes.Html, f.UserId,
            f.Now, default);

        await f.Processor().ProcessNextAsync(default);

        var completed = await f.Repository.GetAsync(job.Id, default);
        var html = f.Storage.Text(f.Options.ContainerName, completed!.ResultPath!);
        Assert.Contains("<details open>", html);
        Assert.Contains("First tab", html);
        Assert.Contains("Second tab", html);
        Assert.DoesNotContain("data-kb-", html);
    }

    [Fact]
    public async Task Repeated_pending_request_returns_the_existing_job()
    {
        await using var f = await Fixture.CreateAsync();
        var first = await f.Repository.CreateArticleAsync(f.FirstArticleId, ExportTypes.Html, f.UserId,
            f.Now, default);
        var second = await f.Repository.CreateArticleAsync(f.FirstArticleId, ExportTypes.Html, f.UserId,
            f.Now.AddSeconds(1), default);
        Assert.Equal(first.Id, second.Id);
        Assert.Single(await f.Context.ExportJobs.ToListAsync());
    }

    private sealed class Fixture : IAsyncDisposable
    {
        private readonly SqliteConnection connection;
        public KbDbContext Context { get; }
        public ExportJobRepository Repository { get; }
        public FakeStorage Storage { get; } = new();
        public FakePdfRenderer Pdf { get; } = new();
        public FakeCurrentUser Current { get; }
        public ExportOptions Options { get; } = new();
        public Guid UserId { get; } = Guid.NewGuid();
        public Guid OtherUserId { get; } = Guid.NewGuid();
        public Guid RootCategoryId { get; } = Guid.NewGuid();
        public Guid ChildCategoryId { get; } = Guid.NewGuid();
        public Guid FirstArticleId { get; } = Guid.NewGuid();
        public DateTime Now { get; } = new(2026, 8, 10, 8, 0, 0, DateTimeKind.Utc);

        private Fixture(SqliteConnection connection, KbDbContext context)
        {
            this.connection = connection;
            Context = context;
            Repository = new(context);
            Current = new() { UserIdValue = UserId };
        }

        public static async Task<Fixture> CreateAsync()
        {
            var connection = new SqliteConnection("Data Source=:memory:");
            await connection.OpenAsync();
            var context = new KbDbContext(new DbContextOptionsBuilder<KbDbContext>()
                .UseSqlite(connection).Options);
            await context.Database.EnsureCreatedAsync();
            var f = new Fixture(connection, context);
            await f.SeedAsync();
            return f;
        }

        public ExportJobProcessor Processor() => new(Repository,
            new ExportDocumentBuilder(Storage, new MissingMedia(), Microsoft.Extensions.Options.Options.Create(Options),
                NullLogger<ExportDocumentBuilder>.Instance), Pdf, Storage,
            Microsoft.Extensions.Options.Options.Create(Options), TimeProvider.System,
            NullLogger<ExportJobProcessor>.Instance);

        public ExportService Service() => new(Repository, Storage, Current, new NeverAdmin(),
            Microsoft.Extensions.Options.Options.Create(Options), TimeProvider.System,
            NullLogger<ExportService>.Instance);

        public async Task ReplacePublishedVersionAsync(string html)
        {
            var article = await Context.Articles.SingleAsync(item => item.ArticleId == FirstArticleId);
            var version = Version(article.ArticleId, 99, "versions/new/content.html");
            Context.ArticleVersions.Add(version);
            article.LastPublishedVersionIdFk = version.VersionId;
            Storage.Seed(Options.ArticleContentContainerName, version.RenderedHtmlStoragePath!, html);
            await Context.SaveChangesAsync();
        }

        private async Task SeedAsync()
        {
            Context.Users.AddRange(
                new User { UserId = UserId, Email = "one@example.test", FullName = "One", IsActive = true, CreatedAt = Now },
                new User { UserId = OtherUserId, Email = "two@example.test", FullName = "Two", IsActive = true, CreatedAt = Now });
            Context.Categories.AddRange(
                new Category { CategoryId = RootCategoryId, Name = "Root category", Slug = "root", SortOrder = 0, Depth = 0 },
                new Category { CategoryId = ChildCategoryId, ParentCategoryIdFk = RootCategoryId,
                    Name = "Child category", Slug = "child", SortOrder = 0, Depth = 1 });
            await Context.SaveChangesAsync();
            AddPublished(FirstArticleId, RootCategoryId, "Article one", "article-one", 1,
                "versions/one/content.html", "<p>stable article one</p>");
            AddPublished(Guid.NewGuid(), RootCategoryId, "Article zero", "article-zero", 0,
                "versions/zero/content.html", "<p>zero</p>");
            AddPublished(Guid.NewGuid(), ChildCategoryId, "Nested article", "nested", 0,
                "versions/nested/content.html", "<p>nested</p>");
            await Context.SaveChangesAsync();
            foreach (var article in await Context.Articles.ToListAsync())
                article.LastPublishedVersionIdFk = await Context.ArticleVersions
                    .Where(version => version.ArticleIdFk == article.ArticleId)
                    .Select(version => version.VersionId).SingleAsync();
            await Context.SaveChangesAsync();
        }

        private void AddPublished(Guid articleId, Guid categoryId, string title, string slug, int position,
            string path, string html)
        {
            var version = Version(articleId, 1, path);
            Context.Articles.Add(new Article
            {
                ArticleId = articleId, Title = title, Slug = slug, CategoryIdFk = categoryId,
                AuthorIdFk = UserId, Status = ArticleStatuses.Published, Position = position,
                LastPublishedVersionIdFk = null, CreatedAt = Now, UpdatedAt = Now
            });
            Context.ArticleVersions.Add(version);
            Storage.Seed(Options.ArticleContentContainerName, path, html);
            Storage.Seed(Options.ArticleContentContainerName, version.ContentJsonStoragePath,
                "{\"type\":\"doc\",\"content\":[]}");
        }

        private ArticleVersion Version(Guid articleId, int number, string htmlPath) => new()
        {
            VersionId = Guid.NewGuid(), ArticleIdFk = articleId, VersionNumber = number,
            SnapshotReason = ArticleSnapshotReasons.Published,
            ContentJsonStoragePath = htmlPath.Replace("content.html", "content.json"),
            RenderedHtmlStoragePath = htmlPath, ContentSizeBytes = 10, CreatedAt = Now,
            CreatedByFk = UserId, PublishedByFk = UserId, PublishedAt = Now
        };

        public async ValueTask DisposeAsync()
        {
            await Context.DisposeAsync();
            await connection.DisposeAsync();
        }
    }

    private sealed class FakeCurrentUser : ICurrentUser
    {
        public Guid UserIdValue { get; set; }
        public bool IsAuthenticated => true;
        public Guid UserId => UserIdValue;
        public string? Email => null;
    }

    private sealed class NeverAdmin : IAdminChecker
    {
        public Task<bool> IsAdminAsync(Guid userId, CancellationToken cancellationToken) => Task.FromResult(false);
    }

    private sealed class MissingMedia : IExportMediaResolver
    {
        public Task<ExportMediaData?> ResolveAsync(Guid mediaId, int maximumBytes,
            CancellationToken cancellationToken) => Task.FromResult<ExportMediaData?>(null);
    }

    private sealed class FakePdfRenderer : IPdfRenderer
    {
        public bool Fail { get; set; }
        public string LastHtml { get; private set; } = string.Empty;
        public Task<Stream> RenderAsync(string html, CancellationToken cancellationToken)
        {
            LastHtml = html;
            if (Fail) throw new InvalidOperationException("renderer failed");
            return Task.FromResult<Stream>(new MemoryStream(Encoding.UTF8.GetBytes("%PDF-fake")));
        }
    }

    private sealed class FakeStorage : IObjectStorage
    {
        private readonly Dictionary<(string, string), byte[]> files = [];
        public void Seed(string container, string path, string text) =>
            files[(container, path)] = Encoding.UTF8.GetBytes(text);
        public void Remove(string container, string path) => files.Remove((container, path));
        public string Text(string container, string path) => Encoding.UTF8.GetString(files[(container, path)]);
        public async Task<string> UploadAsync(string containerName, string objectName, Stream content,
            string contentType, CancellationToken cancellationToken)
        {
            using var output = new MemoryStream();
            await content.CopyToAsync(output, cancellationToken);
            files[(containerName, objectName)] = output.ToArray();
            return objectName;
        }
        public Task<Stream> DownloadAsync(string containerName, string objectName,
            CancellationToken cancellationToken) => files.TryGetValue((containerName, objectName), out var bytes)
            ? Task.FromResult<Stream>(new MemoryStream(bytes, writable: false))
            : throw new FileNotFoundException(objectName);
        public Task DeleteAsync(string containerName, string objectName,
            CancellationToken cancellationToken) { files.Remove((containerName, objectName)); return Task.CompletedTask; }
    }
}
