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
    [Theory]
    [InlineData(ExportTypes.Html)]
    [InlineData(ExportTypes.Pdf)]
    public async Task Current_draft_exports_the_exact_selected_content(string format)
    {
        await using var f = await Fixture.CreateAsync();
        var job = await f.Repository.CreateArticleAsync(f.FirstArticleId,
            new(ExportSourceTypes.Draft, f.CurrentDraftId, null), format, f.UserId, f.Now, default);

        await f.Processor().ProcessNextAsync(default);

        var completed = await f.Repository.GetAsync(job.Id, default);
        Assert.Equal(ExportSourceTypes.Draft, completed!.SourceType);
        Assert.Equal(f.CurrentDraftId, completed.DraftId);
        Assert.Null(completed.VersionId);
        Assert.Contains("current draft content", format == ExportTypes.Pdf
            ? f.Pdf.LastHtml
            : f.Storage.Text(f.Options.ContainerName, completed.ResultPath!));
    }

    [Theory]
    [InlineData(ExportTypes.Html)]
    [InlineData(ExportTypes.Pdf)]
    public async Task Historical_draft_exports_the_exact_selected_content(string format)
    {
        await using var f = await Fixture.CreateAsync();
        var job = await f.Repository.CreateArticleAsync(f.FirstArticleId,
            new(ExportSourceTypes.Draft, f.HistoricalDraftId, null), format, f.UserId, f.Now, default);

        await f.Processor().ProcessNextAsync(default);

        var completed = await f.Repository.GetAsync(job.Id, default);
        var output = format == ExportTypes.Pdf ? f.Pdf.LastHtml :
            f.Storage.Text(f.Options.ContainerName, completed!.ResultPath!);
        Assert.Contains("historical draft content", output);
        Assert.DoesNotContain("current draft content", output);
    }

    [Theory]
    [InlineData(ExportTypes.Html)]
    [InlineData(ExportTypes.Pdf)]
    public async Task Historical_unpublished_version_exports_the_exact_selected_content(string format)
    {
        await using var f = await Fixture.CreateAsync();
        var job = await f.Repository.CreateArticleAsync(f.FirstArticleId,
            new(ExportSourceTypes.Version, null, f.HistoricalVersionId), format, f.UserId, f.Now, default);

        await f.Processor().ProcessNextAsync(default);

        var completed = await f.Repository.GetAsync(job.Id, default);
        var output = format == ExportTypes.Pdf ? f.Pdf.LastHtml :
            f.Storage.Text(f.Options.ContainerName, completed!.ResultPath!);
        Assert.Contains("historical version content", output);
        Assert.DoesNotContain("stable article one", output);
    }

    [Fact]
    public async Task Article_export_rejects_a_source_that_belongs_to_another_article()
    {
        await using var f = await Fixture.CreateAsync();
        await Assert.ThrowsAsync<NotFoundException>(() => f.Repository.CreateArticleAsync(
            f.FirstArticleId, new(ExportSourceTypes.Version, null, f.OtherArticleVersionId),
            ExportTypes.Html, f.UserId, f.Now, default));
    }

    [Fact]
    public async Task Html_article_export_uses_the_version_frozen_when_requested_and_stores_result_path()
    {
        await using var f = await Fixture.CreateAsync();
        var job = await f.Repository.CreateArticleAsync(f.FirstArticleId, f.VersionSource(), ExportTypes.Html, f.UserId,
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
        var job = await f.Repository.CreateArticleAsync(f.FirstArticleId, f.VersionSource(), ExportTypes.Pdf, f.UserId,
            f.Now, default);

        await f.Processor().ProcessNextAsync(default);

        var completed = await f.Repository.GetAsync(job.Id, default);
        Assert.Equal(JobStatuses.Completed, completed!.Status);
        Assert.Equal("%PDF-fake", f.Storage.Text(f.Options.ContainerName, completed.ResultPath!));
        Assert.Contains("stable article one", f.Pdf.LastHtml);
    }

    [Fact]
    public async Task Small_html_article_export_completes_in_under_two_seconds()
    {
        await using var f = await Fixture.CreateAsync();
        var job = await f.Repository.CreateArticleAsync(f.FirstArticleId, f.VersionSource(),
            ExportTypes.Html, f.UserId, f.Now, default);
        var started = System.Diagnostics.Stopwatch.StartNew();

        await f.Processor().ProcessNextAsync(default);

        Assert.True(started.Elapsed < TimeSpan.FromSeconds(2));
        Assert.Equal(JobStatuses.Completed, (await f.Repository.GetAsync(job.Id, default))!.Status);
    }

    [Theory]
    [InlineData(ExportTypes.Html)]
    [InlineData(ExportTypes.Pdf)]
    public async Task Category_export_prefers_live_published_versions_and_preserves_nested_hierarchy(string format)
    {
        await using var f = await Fixture.CreateAsync();
        var job = await f.Repository.CreateCategoryAsync(f.RootCategoryId, format, f.UserId,
            f.Now, default);

        await f.Processor().ProcessNextAsync(default);

        var completed = await f.Repository.GetAsync(job.Id, default);
        var html = format == ExportTypes.Pdf ? f.Pdf.LastHtml :
            f.Storage.Text(f.Options.ContainerName, completed!.ResultPath!);
        Assert.Contains("stable article one", html);
        Assert.DoesNotContain("current draft content", html);
        Assert.True(html.IndexOf("Article zero", StringComparison.Ordinal) <
                    html.IndexOf("Article one", StringComparison.Ordinal));
        Assert.True(html.IndexOf("Article one", StringComparison.Ordinal) <
                    html.IndexOf("Child category", StringComparison.Ordinal));
        Assert.True(html.IndexOf("Child category", StringComparison.Ordinal) <
                    html.IndexOf("Nested article", StringComparison.Ordinal));
    }

    [Theory]
    [InlineData(ExportTypes.Html)]
    [InlineData(ExportTypes.Pdf)]
    public async Task Category_export_includes_an_unpublished_draft_without_requiring_a_version(string format)
    {
        await using var f = await Fixture.CreateAsync();
        var articleId = Guid.NewGuid();
        var draftId = Guid.NewGuid();
        var article = new Article
        {
            ArticleId = articleId, Title = "Draft only", Slug = "draft-only",
            CategoryIdFk = f.RootCategoryId, AuthorIdFk = f.UserId, Status = ArticleStatuses.Draft,
            Position = 9, CurrentDraftIdFk = null, CreatedAt = f.Now, UpdatedAt = f.Now
        };
        f.Context.Articles.Add(article);
        await f.Context.SaveChangesAsync();
        var rowVersion = Guid.NewGuid().ToByteArray();
        await f.Context.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO ARTICLE_DRAFTS
                (DraftID, ArticleID_FK, DraftNumber, ContentJsonStoragePath, RenderedHtmlStoragePath,
                 ContentSizeBytes, RowVersion, IsLocked, CreatedBy_FK, UpdatedBy_FK, CreatedAt, UpdatedAt, Status)
            VALUES ({draftId}, {articleId}, {1}, {"drafts/only/content.json"}, {"drafts/only/content.html"},
                    {10L}, {rowVersion}, {false}, {f.UserId}, {f.UserId}, {f.Now}, {f.Now}, {ArticleStatuses.Draft})
            """);
        article.CurrentDraftIdFk = draftId;
        await f.Context.SaveChangesAsync();
        f.Context.ChangeTracker.Clear();
        f.Storage.Seed(f.Options.ArticleContentContainerName, "drafts/only/content.json",
            """{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"unpublished draft body"}]}]}""");
        f.Storage.Seed(f.Options.ArticleContentContainerName, "drafts/only/content.html",
            "<p>unpublished draft body</p>");

        var job = await f.Repository.CreateCategoryAsync(
            f.RootCategoryId, format, f.UserId, f.Now, default);
        await f.Processor().ProcessNextAsync(default);
        var completed = await f.Repository.GetAsync(job.Id, default);
        var output = format == ExportTypes.Pdf ? f.Pdf.LastHtml :
            f.Storage.Text(f.Options.ContainerName, completed!.ResultPath!);
        Assert.Contains("unpublished draft body", output);
    }

    [Fact]
    public async Task Another_non_admin_user_cannot_read_or_download_an_export_job()
    {
        await using var f = await Fixture.CreateAsync();
        var job = await f.Repository.CreateArticleAsync(f.FirstArticleId, f.VersionSource(), ExportTypes.Html, f.UserId,
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
        var job = await f.Repository.CreateArticleAsync(f.FirstArticleId, f.VersionSource(), ExportTypes.Pdf, f.UserId,
            f.Now, default);

        await f.Processor().ProcessNextAsync(default);

        var failed = await f.Repository.GetAsync(job.Id, default);
        Assert.Equal(JobStatuses.Failed, failed!.Status);
        Assert.NotNull(failed.CompletedAt);
        Assert.NotNull(failed.ErrorMessage);
        Assert.Null(failed.ResultPath);
    }

    [Fact]
    public async Task Stuck_renderer_is_cancelled_and_marks_the_job_failed_quickly()
    {
        await using var f = await Fixture.CreateAsync();
        f.Options.JobTimeout = TimeSpan.FromMilliseconds(75);
        f.Pdf.Hang = true;
        var job = await f.Repository.CreateArticleAsync(f.FirstArticleId, f.VersionSource(),
            ExportTypes.Pdf, f.UserId, f.Now, default);
        var started = System.Diagnostics.Stopwatch.StartNew();

        await f.Processor().ProcessNextAsync(default);

        var failed = await f.Repository.GetAsync(job.Id, default);
        Assert.Equal(JobStatuses.Failed, failed!.Status);
        Assert.Contains("limit", failed.ErrorMessage);
        Assert.True(started.Elapsed < TimeSpan.FromSeconds(2));
    }

    [Fact]
    public async Task Missing_media_is_represented_without_leaking_the_api_path_or_media_id()
    {
        await using var f = await Fixture.CreateAsync();
        var mediaId = Guid.NewGuid();
        f.Storage.Seed(f.Options.ArticleContentContainerName, "versions/one/content.html",
            $"<p>Text</p><img src=\"/api/media/{mediaId}/content\" data-media-id=\"{mediaId}\">");
        var job = await f.Repository.CreateArticleAsync(f.FirstArticleId, f.VersionSource(), ExportTypes.Html, f.UserId,
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
        var job = await f.Repository.CreateArticleAsync(f.FirstArticleId, f.VersionSource(), ExportTypes.Html, f.UserId,
            f.Now, default);

        await f.Processor().ProcessNextAsync(default);

        var completed = await f.Repository.GetAsync(job.Id, default);
        var html = f.Storage.Text(f.Options.ContainerName, completed!.ResultPath!);
        Assert.Contains("<details open>", html);
        Assert.Contains("First tab", html);
        Assert.Contains("Second tab", html);
        Assert.DoesNotContain("data-kb-", html);
    }

    [Theory]
    [InlineData(ExportTypes.Html)]
    [InlineData(ExportTypes.Pdf)]
    public async Task Canonical_callout_export_repairs_legacy_html_and_keeps_rich_custom_content(string format)
    {
        await using var f = await Fixture.CreateAsync();
        var contentPath = await f.Context.ArticleVersions.Where(item => item.VersionId == f.FirstVersionId)
            .Select(item => item.ContentJsonStoragePath).SingleAsync();
        f.Storage.Seed(f.Options.ArticleContentContainerName, "versions/one/content.html",
            "<p>Legacy static renderer omitted the callout</p>");
        f.Storage.Seed(f.Options.ArticleContentContainerName, contentPath, """
            {"type":"doc","content":[
              {"type":"callout","attrs":{"variant":"warning"},"content":[
                {"type":"paragraph","content":[{"type":"text","text":"Read me "},{"type":"text","text":"carefully","marks":[{"type":"bold"}]},{"type":"text","text":" docs","marks":[{"type":"link","attrs":{"href":"https://example.test/docs"}}]}]},
                {"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Nested list"}]}]}]}
              ]},
              {"type":"table","content":[{"type":"tableRow","content":[{"type":"tableHeader","content":[{"type":"paragraph","content":[{"type":"text","text":"Name"}]}]},{"type":"tableCell","content":[{"type":"paragraph","content":[{"type":"text","text":"Value"}]}]}]}]},
              {"type":"codeBlock","content":[{"type":"text","text":"const value = 1;"}]},
              {"type":"tabs","content":[{"type":"tabItem","attrs":{"label":"First"},"content":[{"type":"paragraph","content":[{"type":"text","text":"Tab body"}]}]}]},
              {"type":"accordion","content":[{"type":"accordionItem","attrs":{"title":"More"},"content":[{"type":"paragraph","content":[{"type":"text","text":"Expanded body"}]}]}]}
            ]}
            """);
        var job = await f.Repository.CreateArticleAsync(f.FirstArticleId, f.VersionSource(),
            format, f.UserId, f.Now, default);

        await f.Processor().ProcessNextAsync(default);

        var completed = await f.Repository.GetAsync(job.Id, default);
        var html = format == ExportTypes.Pdf ? f.Pdf.LastHtml :
            f.Storage.Text(f.Options.ContainerName, completed!.ResultPath!);
        Assert.Contains("<table>", html);
        Assert.Contains("kb-callout--warning", html);
        Assert.Contains(".kb-callout--warning", html);
        Assert.Contains("<strong>carefully</strong>", html);
        Assert.Contains("href=\"https://example.test/docs\"", html);
        Assert.Contains("Nested list", html);
        Assert.Contains("const value = 1;", html);
        Assert.Contains("First", html);
        Assert.Contains("<details open>", html);
        Assert.Contains("Expanded body", html);
        Assert.DoesNotContain("Legacy static renderer omitted", html);
    }

    [Fact]
    public async Task Repeated_pending_request_returns_the_existing_job()
    {
        await using var f = await Fixture.CreateAsync();
        var first = await f.Repository.CreateArticleAsync(f.FirstArticleId, f.VersionSource(), ExportTypes.Html, f.UserId,
            f.Now, default);
        var second = await f.Repository.CreateArticleAsync(f.FirstArticleId, f.VersionSource(), ExportTypes.Html, f.UserId,
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
        public Guid FirstVersionId { get; private set; }
        public Guid CurrentDraftId { get; } = Guid.NewGuid();
        public Guid HistoricalDraftId { get; } = Guid.NewGuid();
        public Guid HistoricalVersionId { get; private set; }
        public Guid OtherArticleVersionId { get; private set; }
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
            new FakeSignal(),
            NullLogger<ExportService>.Instance);

        public ExportArticleSource VersionSource() =>
            new(ExportSourceTypes.Version, null, FirstVersionId);

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

            var historicalVersion = Version(FirstArticleId, 2, "versions/history/content.html");
            historicalVersion.SnapshotReason = ArticleSnapshotReasons.SubmittedForReview;
            historicalVersion.PublishedAt = null;
            historicalVersion.PublishedByFk = null;
            HistoricalVersionId = historicalVersion.VersionId;
            Context.ArticleVersions.Add(historicalVersion);
            Storage.Seed(Options.ArticleContentContainerName, historicalVersion.RenderedHtmlStoragePath!,
                "<p>historical version content</p>");
            Storage.Seed(Options.ArticleContentContainerName, historicalVersion.ContentJsonStoragePath,
                "{\"type\":\"doc\",\"content\":[]}");

            var first = await Context.Articles.SingleAsync(item => item.ArticleId == FirstArticleId);
            var currentRowVersion = Guid.NewGuid().ToByteArray();
            var historicalRowVersion = Guid.NewGuid().ToByteArray();
            await Context.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO ARTICLE_DRAFTS
                    (DraftID, ArticleID_FK, DraftNumber, ContentJsonStoragePath, RenderedHtmlStoragePath,
                     ContentSizeBytes, RowVersion, IsLocked, CreatedBy_FK, UpdatedBy_FK, CreatedAt, UpdatedAt, Status)
                VALUES ({CurrentDraftId}, {FirstArticleId}, {3}, {"drafts/current/content.json"},
                        {"drafts/current/content.html"}, {10L}, {currentRowVersion}, {false}, {UserId},
                        {UserId}, {Now}, {Now}, {ArticleStatuses.Draft})
                """);
            await Context.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO ARTICLE_DRAFTS
                    (DraftID, ArticleID_FK, DraftNumber, ContentJsonStoragePath, RenderedHtmlStoragePath,
                     ContentSizeBytes, RowVersion, IsLocked, CreatedBy_FK, UpdatedBy_FK, CreatedAt, UpdatedAt, Status)
                VALUES ({HistoricalDraftId}, {FirstArticleId}, {2}, {"drafts/history/content.json"},
                        {"drafts/history/content.html"}, {10L}, {historicalRowVersion}, {false}, {UserId},
                        {UserId}, {Now}, {Now}, {ArticleStatuses.Approved})
                """);
            first.CurrentDraftIdFk = CurrentDraftId;
            Storage.Seed(Options.ArticleContentContainerName, "drafts/current/content.html",
                "<p>current draft content</p>");
            Storage.Seed(Options.ArticleContentContainerName, "drafts/current/content.json",
                "{\"type\":\"doc\",\"content\":[]}");
            Storage.Seed(Options.ArticleContentContainerName, "drafts/history/content.html",
                "<p>historical draft content</p>");
            Storage.Seed(Options.ArticleContentContainerName, "drafts/history/content.json",
                "{\"type\":\"doc\",\"content\":[]}");
            OtherArticleVersionId = await Context.ArticleVersions
                .Where(item => item.ArticleIdFk != FirstArticleId).Select(item => item.VersionId).FirstAsync();
            await Context.SaveChangesAsync();
        }

        private void AddPublished(Guid articleId, Guid categoryId, string title, string slug, int position,
            string path, string html)
        {
            var version = Version(articleId, 1, path);
            if (articleId == FirstArticleId) FirstVersionId = version.VersionId;
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

    private sealed class FakeSignal : IExportJobSignal
    {
        public void Notify() { }
        public Task WaitAsync(TimeSpan maximumDelay, CancellationToken cancellationToken) => Task.CompletedTask;
    }

    private sealed class FakePdfRenderer : IPdfRenderer
    {
        public bool Fail { get; set; }
        public bool Hang { get; set; }
        public string LastHtml { get; private set; } = string.Empty;
        public async Task<Stream> RenderAsync(string html, CancellationToken cancellationToken)
        {
            LastHtml = html;
            if (Fail) throw new InvalidOperationException("renderer failed");
            if (Hang) await Task.Delay(Timeout.InfiniteTimeSpan, cancellationToken);
            return new MemoryStream(Encoding.UTF8.GetBytes("%PDF-fake"));
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
