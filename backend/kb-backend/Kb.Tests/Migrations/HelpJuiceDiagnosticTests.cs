using System.Text;
using Kb.Application.Abstractions;
using Kb.Application.Abstractions.Storage;
using Kb.Application.Drafts;
using Kb.Application.Exceptions;
using Kb.Application.Media;
using Kb.Application.Migrations.HelpJuice;
using Microsoft.Extensions.Options;

namespace Kb.Tests.Migrations;

public sealed class HelpJuiceDiagnosticTests
{
    [Fact]
    public async Task Content_import_requires_a_completed_users_migration()
    {
        await using var package = Stream("not a package");
        var service = new HelpJuiceMigrationService(new ReadOnlyWriter(userMigrationCompleted: false),
            new UnusedStorage(), new ClientFactory(), new User(), TimeProvider.System,
            Options.Create(new HelpJuiceMigrationLimits()), Options.Create(new MediaOptions()),
            Options.Create(new DraftContentOptions()));

        var error = await Assert.ThrowsAsync<BusinessRuleException>(() => service.ExecuteAsync(
            [new("export.zip", "application/zip", package.Length, package)], new(), default));

        Assert.Contains("Complete Users Migration", error.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Preview_plans_external_media_without_downloading_uploading_or_persisting()
    {
        await using var questionStream = Stream("id,name\nq1,Media\n");
        await using var answerStream = Stream("id,question_id,body\na1,q1,\"<img src='https://cdn.example.test/image.png'>\"\n");
        var writer = new ReadOnlyWriter();
        var clientFactory = new CountingClientFactory();
        var service = new HelpJuiceMigrationService(writer, new UnusedStorage(), clientFactory,
            new User(), TimeProvider.System, Options.Create(new HelpJuiceMigrationLimits()),
            Options.Create(new MediaOptions()), Options.Create(new DraftContentOptions()));

        var preview = await service.PreviewAsync([
            new("questions.csv", "text/csv", questionStream.Length, questionStream),
            new("answers.csv", "text/csv", answerStream.Length, answerStream)
        ], 100, default);

        Assert.Contains(Assert.Single(preview.Articles).Issues, issue => issue.ErrorCode == "EXTERNAL_MEDIA_IMPORT_PLANNED");
        Assert.Equal(0, clientFactory.CreateCalls);
        Assert.Equal(3, writer.ReadCalls);
    }

    [Fact]
    public async Task Preview_enriches_authors_by_HelpJuice_id_and_warns_without_blocking()
    {
        var resolvedUserId=Guid.NewGuid();
        await using var questionStream = Stream(
            "id,name,created_by_id\nq1,Resolved,HJ-42\nq2,Unresolved,missing-7\nq3,Missing,\n");
        await using var answerStream = Stream(
            "id,question_id,body\na1,q1,One\na2,q2,Two\na3,q3,Three\n");
        var mappings=new Dictionary<string,HelpJuiceAuthorMapping>(StringComparer.OrdinalIgnoreCase)
        {
            ["hj-42"]=new("hj-42",resolvedUserId,"Source Author")
        };
        var writer = new ReadOnlyWriter(mappings);
        var service = new HelpJuiceMigrationService(writer, new UnusedStorage(), new ClientFactory(),
            new User(), TimeProvider.System, Options.Create(new HelpJuiceMigrationLimits()),
            Options.Create(new MediaOptions()), Options.Create(new DraftContentOptions()));

        var preview = await service.PreviewAsync([
            new("questions.csv", "text/csv", questionStream.Length, questionStream),
            new("answers.csv", "text/csv", answerStream.Length, answerStream)
        ], 100, default);

        var resolved=preview.Articles.Single(article=>article.ExternalId=="q1");
        Assert.Equal("HJ-42",resolved.HelpJuiceAuthorId);
        Assert.Equal(resolvedUserId,resolved.AuthorUserId);
        Assert.Equal("Source Author",resolved.AuthorName);
        Assert.DoesNotContain(resolved.Issues,issue=>issue.ErrorCode=="HELPJUICE_AUTHOR_MAPPING_MISSING");
        var unresolved=preview.Articles.Single(article=>article.ExternalId=="q2");
        Assert.Null(unresolved.AuthorUserId);
        Assert.Contains(unresolved.Issues,issue=>issue.ErrorCode=="HELPJUICE_AUTHOR_MAPPING_MISSING"&&
            issue.Message.Contains("missing-7",StringComparison.Ordinal));
        var missing=preview.Articles.Single(article=>article.ExternalId=="q3");
        Assert.Null(missing.HelpJuiceAuthorId);
        Assert.Contains(missing.Issues,issue=>issue.ErrorCode=="HELPJUICE_AUTHOR_ID_MISSING");
        Assert.Equal(0,preview.PackageIssues.Count(issue=>issue.Severity=="Error"));
    }

    [Fact]
    public async Task Full_diagnostic_scans_beyond_preview_limit_and_never_invokes_import_writes()
    {
        var questions = new StringBuilder("id,codename,name,is_published\n");
        var answers = new StringBuilder("id,question_id,body\n");
        for (var index = 1; index <= 101; index++)
        {
            questions.Append($"q{index},article-{index},{(index == 101 ? string.Empty : $"Article {index}")},true\n");
            answers.Append($"a{index},q{index},Body {index}\n");
        }
        await using var questionStream = Stream(questions.ToString());
        await using var answerStream = Stream(answers.ToString());
        var writer = new ReadOnlyWriter();
        var service = new HelpJuiceMigrationService(writer, new UnusedStorage(), new ClientFactory(),
            new User(), TimeProvider.System, Options.Create(new HelpJuiceMigrationLimits()),
            Options.Create(new MediaOptions()), Options.Create(new DraftContentOptions()));

        var report = await service.GenerateDiagnosticReportAsync([
            new("questions.csv", "text/csv", questionStream.Length, questionStream),
            new("answers.csv", "text/csv", answerStream.Length, answerStream)
        ], default);
        try
        {
            Assert.Equal(202, report.TotalRecordsScanned);
            Assert.Equal(3, writer.ReadCalls);
            var csv = await File.ReadAllTextAsync(report.Path);
            Assert.Contains("\"questions.csv\",\"102\",\"q101\",\"Article\",\"Untitled HelpJuice article q101\",\"TITLE_DERIVED\"", csv);
            Assert.Contains("\"End: total records scanned\",\"202\"", csv);
        }
        finally { if (File.Exists(report.Path)) File.Delete(report.Path); }
    }

    [Fact]
    public async Task Full_diagnostic_records_a_malformed_optional_csv_and_continues_other_validation()
    {
        await using var questionStream = Stream("id,codename,name,is_published\nq1,,,true\n");
        await using var answerStream = Stream("id,question_id,body\na1,q1,Body\n");
        await using var categoryStream = Stream("id,name\nc1,\"unclosed");
        var writer = new ReadOnlyWriter();
        var service = new HelpJuiceMigrationService(writer, new UnusedStorage(), new ClientFactory(),
            new User(), TimeProvider.System, Options.Create(new HelpJuiceMigrationLimits()),
            Options.Create(new MediaOptions()), Options.Create(new DraftContentOptions()));

        var report = await service.GenerateDiagnosticReportAsync([
            new("questions.csv", "text/csv", questionStream.Length, questionStream),
            new("answers.csv", "text/csv", answerStream.Length, answerStream),
            new("categories.csv", "text/csv", categoryStream.Length, categoryStream)
        ], default);
        try
        {
            Assert.True(report.ScanFailed);
            var csv = await File.ReadAllTextAsync(report.Path);
            Assert.Contains("\"categories.csv\",\"2\",\"\",\"Category\"", csv);
            Assert.Contains("\"MALFORMED_CSV\"", csv);
            Assert.Contains("\"TITLE_DERIVED\"", csv);
            Assert.Contains("\"Partial - scan failure recorded below\"", csv);
        }
        finally { if (File.Exists(report.Path)) File.Delete(report.Path); }
    }

    private static MemoryStream Stream(string value) => new(Encoding.UTF8.GetBytes(value), writable: false);

    private sealed class User : ICurrentUser
    {
        public bool IsAuthenticated => true;
        public Guid UserId { get; } = Guid.NewGuid();
        public string? Email => "admin@example.test";
    }

    private sealed class ClientFactory : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new();
    }

    private sealed class CountingClientFactory : IHttpClientFactory
    {
        public int CreateCalls { get; private set; }
        public HttpClient CreateClient(string name) { CreateCalls++; return new(); }
    }

    private sealed class UnusedStorage : IObjectStorage
    {
        public Task<string> UploadAsync(string containerName, string objectName, Stream content, string contentType, CancellationToken cancellationToken) => throw new InvalidOperationException("Diagnostics must not upload.");
        public Task<Stream> DownloadAsync(string containerName, string objectName, CancellationToken cancellationToken) => throw new InvalidOperationException("Diagnostics must not download.");
        public Task DeleteAsync(string containerName, string objectName, CancellationToken cancellationToken) => throw new InvalidOperationException("Diagnostics must not delete.");
    }

    private sealed class ReadOnlyWriter(
        IReadOnlyDictionary<string,HelpJuiceAuthorMapping>? authorMappings=null,
        bool userMigrationCompleted=true) : IHelpJuiceImportWriter
    {
        public int ReadCalls { get; private set; }
        public void ResetState() => throw Mutation();
        public Task<IReadOnlySet<string>> GetActiveArticleSlugsAsync(CancellationToken cancellationToken)
        {
            ReadCalls++;
            return Task.FromResult<IReadOnlySet<string>>(new HashSet<string>());
        }
        public Task<IReadOnlyDictionary<string, string>> GetMappedArticleSlugsAsync(CancellationToken cancellationToken)
        {
            ReadCalls++;
            return Task.FromResult<IReadOnlyDictionary<string, string>>(new Dictionary<string,string>());
        }
        public Task<IReadOnlyDictionary<string, HelpJuiceAuthorMapping>> ResolveHelpJuiceAuthorsAsync(
            IReadOnlyCollection<string> helpJuiceUserIds, CancellationToken cancellationToken)
        {
            ReadCalls++;
            return Task.FromResult(authorMappings ??
                (IReadOnlyDictionary<string,HelpJuiceAuthorMapping>)
                new Dictionary<string,HelpJuiceAuthorMapping>(StringComparer.OrdinalIgnoreCase));
        }
        public Task<bool> HasCompletedUserMigrationAsync(CancellationToken cancellationToken) =>
            Task.FromResult(userMigrationCompleted);
        public Task WriteOperationAuditAsync(Guid operationId, string action, string status, Guid actorId, CancellationToken cancellationToken) => throw Mutation();
        public Task<Guid> StartOrResumeJobAsync(Guid proposedJobId, string packageHash, string optionsJson, Guid actorId, DateTime startedAt, CancellationToken cancellationToken) => throw Mutation();
        public Task PersistJobResultAsync(Guid jobId, string status, string summaryJson, IReadOnlyList<MigrationIssueData> issues, DateTime completedAt, CancellationToken cancellationToken) => throw Mutation();
        public Task<MigrationWriteResult> WriteCategoryAsync(Guid operationId, ImportedCategoryData category, string conflictBehavior, Guid actorId, CancellationToken cancellationToken) => throw Mutation();
        public Task<MigrationWriteResult> WriteMediaAsync(Guid operationId, ImportedMediaData media, CancellationToken cancellationToken) => throw Mutation();
        public Task<MigrationWriteResult> WriteArticleAsync(Guid operationId, ImportedArticleData article, string conflictBehavior, CancellationToken cancellationToken) => throw Mutation();
        private static InvalidOperationException Mutation() => new("Diagnostics invoked an import write.");
    }
}
