using System.Text.Json;
using Kb.Api.Authorization;
using Kb.Application.Exceptions;
using Kb.Application.Migrations.HelpJuice;
using Kb.Contracts.Migrations;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Kb.Api.Controllers;

[ApiController]
[Authorize(Policy = AdminPolicy.Name)]
[Route("api/migrations/helpjuice")]
public sealed class HelpJuiceMigrationsController(
    HelpJuiceMigrationService migrations,
    HelpJuiceUserMigrationService userMigrations) : ControllerBase
{
    private const int PreviewArticleLimit = 100;

    [HttpPost("preview")]
    [Consumes("multipart/form-data")]
    [RequestFormLimits(ValueCountLimit = 100_000)]
    [ProducesResponseType<HelpJuiceMigrationPreviewResponse>(StatusCodes.Status200OK)]
    public async Task<ActionResult<HelpJuiceMigrationPreviewResponse>> Preview(CancellationToken ct)
    {
        var files = await ReadFilesAsync(ct);
        try
        {
            var result = await migrations.PreviewAsync(files, PreviewArticleLimit, ct);
            return Ok(ToPreviewResponse(result));
        }
        finally
        {
            foreach (var file in files) await file.Content.DisposeAsync();
        }
    }

    [HttpPost("diagnostics")]
    [Consumes("multipart/form-data")]
    [Produces("text/csv")]
    [RequestFormLimits(ValueCountLimit = 100_000)]
    [ProducesResponseType<FileResult>(StatusCodes.Status200OK)]
    public async Task<IActionResult> Diagnostics(CancellationToken ct)
    {
        var files = await ReadFilesAsync(ct);
        try
        {
            var report = await migrations.GenerateDiagnosticReportAsync(files, ct);
            Response.Headers["X-HelpJuice-Diagnostic-Records"] = report.TotalRecordsScanned.ToString();
            Response.Headers["X-HelpJuice-Diagnostic-Errors"] = report.ErrorCount.ToString();
            Response.Headers["X-HelpJuice-Diagnostic-Warnings"] = report.WarningCount.ToString();
            Response.Headers["X-HelpJuice-Diagnostic-Status"] = report.ScanFailed ? "Partial" : "Completed";
            Response.OnCompleted(() =>
            {
                try { if (System.IO.File.Exists(report.Path)) System.IO.File.Delete(report.Path); }
                catch { /* A stale temporary report is preferable to failing an already completed download. */ }
                return Task.CompletedTask;
            });
            return PhysicalFile(report.Path, "text/csv; charset=utf-8", report.FileName);
        }
        finally
        {
            foreach (var file in files) await file.Content.DisposeAsync();
        }
    }

    [HttpPost]
    [Consumes("multipart/form-data")]
    [RequestFormLimits(ValueCountLimit = 100_000)]
    [ProducesResponseType<HelpJuiceMigrationResponse>(StatusCodes.Status200OK)]
    public async Task<ActionResult<HelpJuiceMigrationResponse>> Import(CancellationToken ct)
    {
        var form = await Request.ReadFormAsync(ct);
        var options = ParseOptions(form["options"].FirstOrDefault());
        var files = form.Files.Select(file => new MigrationUploadFile(
            file.FileName, file.ContentType, file.Length, file.OpenReadStream())).ToArray();
        try
        {
            var result = await migrations.ExecuteAsync(files, options, ct);
            return Ok(ToResponse(result));
        }
        finally
        {
            foreach (var file in files) await file.Content.DisposeAsync();
        }
    }

    [HttpPost("users")]
    [Consumes("multipart/form-data")]
    [RequestFormLimits(ValueCountLimit = 100_000)]
    [ProducesResponseType<HelpJuiceUserMigrationResponse>(StatusCodes.Status200OK)]
    public async Task<ActionResult<HelpJuiceUserMigrationResponse>> ImportUsers(CancellationToken ct)
    {
        var files = await ReadFilesAsync(ct);
        try
        {
            var result = await userMigrations.ExecuteAsync(files, ct);
            return Ok(new HelpJuiceUserMigrationResponse(
                result.JobId, result.Status, result.OriginalFileName, result.StartedAt, result.CompletedAt,
                result.TotalRows, result.ImportedUsers, result.UpdatedUsers, result.SkippedUsers,
                result.FailedUsers, result.Issues.Select(ToIssueResponse).ToArray()));
        }
        finally
        {
            foreach (var file in files) await file.Content.DisposeAsync();
        }
    }

    private async Task<MigrationUploadFile[]> ReadFilesAsync(CancellationToken ct)
    {
        var form = await Request.ReadFormAsync(ct);
        return form.Files.Select(file => new MigrationUploadFile(
            file.FileName, file.ContentType, file.Length, file.OpenReadStream())).ToArray();
    }

    private static HelpJuiceMigrationOptions ParseOptions(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new();
        try
        {
            var request = JsonSerializer.Deserialize<HelpJuiceMigrationOptionsRequest>(json,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? new();
            return new(request.ImportPublished, request.ImportUnpublishedAsDrafts, request.ImportCategories,
                request.ImportMedia, request.PreserveTimestamps, request.ConflictBehavior);
        }
        catch (JsonException exception)
        {
            throw new BusinessRuleException($"Migration options are invalid: {exception.Message}");
        }
    }

    private static HelpJuiceMigrationResponse ToResponse(HelpJuiceMigrationExecutionResult result) => new(
        result.JobId, result.Status, result.OriginalFileName, result.StartedAt, result.CompletedAt,
        new(result.Options.ImportPublished, result.Options.ImportUnpublishedAsDrafts,
            result.Options.ImportCategories, result.Options.ImportMedia, result.Options.PreserveTimestamps,
            result.Options.ConflictBehavior),
        new(result.Validation.TotalArticles, result.Validation.PublishedArticles,
            result.Validation.UnpublishedArticles, result.Validation.Categories, result.Validation.CategoryDepth,
            result.Validation.ArticlesMissingAnswers, result.Validation.DuplicateIds,
            result.Validation.DuplicateSlugs, result.Validation.InvalidCategoryReferences,
            result.Validation.MissingMedia, result.Validation.AvailableFiles,
            result.Validation.MissingRequiredFiles, result.Validation.UnsupportedFiles,
            result.Validation.BlockingErrorCount, result.Validation.WarningCount),
        result.Result is null ? null : new(result.Result.ImportedItems, result.Result.UpdatedItems,
            result.Result.SkippedItems, result.Result.FailedItems, result.Result.CategoryImported,
            result.Result.CategoryUpdated, result.Result.CategorySkipped, result.Result.PublishedImported,
            result.Result.DraftImported, result.Result.ArchivedImported, result.Result.MediaImported, result.Result.MediaReused,
            result.Result.UnresolvedMedia, result.Result.UnsupportedData, result.Result.WarningCount),
        result.Phases.Select(phase => new HelpJuiceMigrationPhaseResponse(phase.Phase, phase.Status,
            phase.TotalItems, phase.ProcessedItems, phase.ImportedItems, phase.UpdatedItems,
            phase.SkippedItems, phase.FailedItems)).ToArray(),
        result.Issues.Select(ToIssueResponse).ToArray());

    private static HelpJuiceMigrationPreviewResponse ToPreviewResponse(HelpJuiceMigrationPreview result) => new(
        result.PreviewLimit, result.SourceArticleCount, result.SourceCategoryCount, result.IsLimited,
        result.AvailableFiles, result.MissingRequiredFiles, result.UnsupportedFiles,
        result.PackageIssues.Select(ToIssueResponse).ToArray(),
        result.Articles.Select(article => new HelpJuiceMigrationPreviewArticleResponse(
            article.ExternalId, article.QuestionRowNumber, article.AnswerExternalId, article.AnswerRowNumber,
            article.Title, article.Slug, article.Description, article.IsPublished, article.IsArchived, article.CreatedAt,
            article.UpdatedAt, article.CategoryExternalId, article.CategoryLocation, article.Visibility,
            article.HelpJuiceAuthorId, article.AuthorUserId, article.AuthorName, article.ContentHtml,
            article.ContentTextLength, article.SourceMetadata, article.Issues.Select(ToIssueResponse).ToArray()))
            .ToArray());

    private static MigrationIssueResponse ToIssueResponse(MigrationIssueData issue) => new(
        issue.Id, issue.Severity, issue.FileName, issue.RowNumber, issue.ExternalEntityType, issue.ExternalId,
        issue.ErrorCode, issue.Message, issue.SourceDataSummary, issue.CreatedAt);
}
