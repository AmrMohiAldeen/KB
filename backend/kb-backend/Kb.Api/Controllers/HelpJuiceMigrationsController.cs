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
public sealed class HelpJuiceMigrationsController(HelpJuiceMigrationService migrations) : ControllerBase
{
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
        result.Status, result.OriginalFileName, result.StartedAt, result.CompletedAt,
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
            result.Result.DraftImported, result.Result.MediaImported, result.Result.MediaReused,
            result.Result.UnresolvedMedia, result.Result.UnsupportedData, result.Result.WarningCount),
        result.Phases.Select(phase => new HelpJuiceMigrationPhaseResponse(phase.Phase, phase.Status,
            phase.TotalItems, phase.ProcessedItems, phase.ImportedItems, phase.UpdatedItems,
            phase.SkippedItems, phase.FailedItems)).ToArray(),
        result.Issues.Select(issue => new MigrationIssueResponse(issue.Id, issue.Severity, issue.FileName,
            issue.RowNumber, issue.ExternalEntityType, issue.ExternalId, issue.ErrorCode, issue.Message,
            issue.SourceDataSummary, issue.CreatedAt)).ToArray());
}
