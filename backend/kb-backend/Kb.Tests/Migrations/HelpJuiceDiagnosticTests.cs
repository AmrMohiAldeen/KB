using System.Text;
using Kb.Application.Abstractions;
using Kb.Application.Abstractions.Storage;
using Kb.Application.Drafts;
using Kb.Application.Media;
using Kb.Application.Migrations.HelpJuice;
using Microsoft.Extensions.Options;

namespace Kb.Tests.Migrations;

public sealed class HelpJuiceDiagnosticTests
{
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
            Assert.Equal(1, writer.ReadCalls);
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

    private sealed class UnusedStorage : IObjectStorage
    {
        public Task<string> UploadAsync(string containerName, string objectName, Stream content, string contentType, CancellationToken cancellationToken) => throw new InvalidOperationException("Diagnostics must not upload.");
        public Task<Stream> DownloadAsync(string containerName, string objectName, CancellationToken cancellationToken) => throw new InvalidOperationException("Diagnostics must not download.");
        public Task DeleteAsync(string containerName, string objectName, CancellationToken cancellationToken) => throw new InvalidOperationException("Diagnostics must not delete.");
    }

    private sealed class ReadOnlyWriter : IHelpJuiceImportWriter
    {
        public int ReadCalls { get; private set; }
        public void ResetState() => throw Mutation();
        public Task<IReadOnlySet<string>> GetActiveArticleSlugsAsync(CancellationToken cancellationToken)
        {
            ReadCalls++;
            return Task.FromResult<IReadOnlySet<string>>(new HashSet<string>());
        }
        public Task WriteOperationAuditAsync(Guid operationId, string action, string status, Guid actorId, CancellationToken cancellationToken) => throw Mutation();
        public Task<Guid> StartOrResumeJobAsync(Guid proposedJobId, string packageHash, string optionsJson, Guid actorId, DateTime startedAt, CancellationToken cancellationToken) => throw Mutation();
        public Task PersistJobResultAsync(Guid jobId, string status, string summaryJson, IReadOnlyList<MigrationIssueData> issues, DateTime completedAt, CancellationToken cancellationToken) => throw Mutation();
        public Task<MigrationWriteResult> WriteCategoryAsync(Guid operationId, ImportedCategoryData category, string conflictBehavior, Guid actorId, CancellationToken cancellationToken) => throw Mutation();
        public Task<MigrationWriteResult> WriteMediaAsync(Guid operationId, ImportedMediaData media, CancellationToken cancellationToken) => throw Mutation();
        public Task<MigrationWriteResult> WriteArticleAsync(Guid operationId, ImportedArticleData article, string conflictBehavior, CancellationToken cancellationToken) => throw Mutation();
        private static InvalidOperationException Mutation() => new("Diagnostics invoked an import write.");
    }
}
