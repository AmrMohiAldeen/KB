using System.Text;
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
    [HttpPost("validate")]
    [Consumes("multipart/form-data")]
    [RequestFormLimits(ValueCountLimit = 100_000)]
    [ProducesResponseType<HelpJuiceMigrationAcceptedResponse>(StatusCodes.Status202Accepted)]
    public async Task<ActionResult<HelpJuiceMigrationAcceptedResponse>> Validate(CancellationToken ct)
    {
        var form = await Request.ReadFormAsync(ct);
        var options = ParseOptions(form["options"].FirstOrDefault());
        var files = form.Files.Select(file => new MigrationUploadFile(
            file.FileName, file.ContentType, file.Length, file.OpenReadStream())).ToArray();
        try
        {
            var id = await migrations.CreateValidationJobAsync(files, options, ct);
            var url = Url.ActionLink(nameof(Get), values: new { jobId = id }) ?? $"/api/migrations/helpjuice/{id}";
            return Accepted(url, new HelpJuiceMigrationAcceptedResponse(id, MigrationJobStatuses.Pending, url));
        }
        finally { foreach (var file in files) await file.Content.DisposeAsync(); }
    }

    [HttpPost]
    [ProducesResponseType<HelpJuiceMigrationAcceptedResponse>(StatusCodes.Status202Accepted)]
    public async Task<ActionResult<HelpJuiceMigrationAcceptedResponse>> Start(StartHelpJuiceMigrationRequest request,
        CancellationToken ct)
    {
        await migrations.StartAsync(request.JobId, ToOptions(request.Options), ct);
        var url = Url.ActionLink(nameof(Get), values: new { jobId = request.JobId }) ?? $"/api/migrations/helpjuice/{request.JobId}";
        return Accepted(url, new HelpJuiceMigrationAcceptedResponse(request.JobId, MigrationJobStatuses.Running, url));
    }

    [HttpGet("{jobId:guid}", Name = nameof(Get))]
    [ProducesResponseType<HelpJuiceMigrationJobResponse>(StatusCodes.Status200OK)]
    public async Task<ActionResult<HelpJuiceMigrationJobResponse>> Get(Guid jobId, CancellationToken ct)
    {
        var job = await migrations.GetAsync(jobId, ct) ?? throw new NotFoundException("The migration job was not found.");
        return Ok(ToResponse(job));
    }

    [HttpGet("{jobId:guid}/errors")]
    public async Task<IActionResult> Errors(Guid jobId, [FromQuery] string format = "json", CancellationToken ct = default)
    {
        _ = await migrations.GetAsync(jobId, ct) ?? throw new NotFoundException("The migration job was not found.");
        var issues = await migrations.GetIssuesAsync(jobId, ct);
        if (format.Equals("json", StringComparison.OrdinalIgnoreCase))
            return File(JsonSerializer.SerializeToUtf8Bytes(issues, new JsonSerializerOptions { WriteIndented = true }), "application/json", $"helpjuice-{jobId:N}-errors.json");
        if (!format.Equals("csv", StringComparison.OrdinalIgnoreCase))
            throw new BusinessRuleException("Error report format must be csv or json.");
        var csv = new StringBuilder("severity,fileName,rowNumber,externalEntityType,externalId,errorCode,message,sourceDataSummary,createdAt\r\n");
        foreach (var issue in issues)
            csv.AppendLine(string.Join(',', new[] { issue.Severity, issue.FileName, issue.RowNumber?.ToString(), issue.ExternalEntityType,
                issue.ExternalId, issue.ErrorCode, issue.Message, issue.SourceDataSummary, issue.CreatedAt.ToString("O") }.Select(Csv)));
        return File(Encoding.UTF8.GetBytes(csv.ToString()), "text/csv; charset=utf-8", $"helpjuice-{jobId:N}-errors.csv");
    }

    [HttpPost("{jobId:guid}/cancel")]
    [ProducesResponseType(StatusCodes.Status202Accepted)]
    public async Task<IActionResult> Cancel(Guid jobId, CancellationToken ct)
    { _ = await migrations.GetAsync(jobId, ct) ?? throw new NotFoundException("The migration job was not found."); await migrations.CancelAsync(jobId, ct); return Accepted(); }

    private static HelpJuiceMigrationOptions ParseOptions(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new();
        try { return ToOptions(JsonSerializer.Deserialize<HelpJuiceMigrationOptionsRequest>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? new()); }
        catch (JsonException exception) { throw new BusinessRuleException($"Migration options are invalid: {exception.Message}"); }
    }
    private static HelpJuiceMigrationOptions ToOptions(HelpJuiceMigrationOptionsRequest value) => new(value.ImportPublished,value.ImportUnpublishedAsDrafts,value.ImportCategories,value.ImportMedia,value.PreserveTimestamps,value.ConflictBehavior);
    private static string Csv(string? value) => $"\"{(value ?? string.Empty).Replace("\"", "\"\"")}\"";
    private static MigrationIssueResponse ToIssue(MigrationIssueData x)=>new(x.Id,x.Severity,x.FileName,x.RowNumber,x.ExternalEntityType,x.ExternalId,x.ErrorCode,x.Message,x.SourceDataSummary,x.CreatedAt);
    private static HelpJuiceMigrationJobResponse ToResponse(MigrationJobData j)=>new(j.Id,j.Type,j.Status,j.OriginalFileName,j.RequestedByUserId,j.RequestedByName,j.RequestedAt,j.StartedAt,j.CompletedAt,j.CurrentPhase,j.TotalItems,j.ProcessedItems,j.ImportedItems,j.UpdatedItems,j.SkippedItems,j.FailedItems,j.CancellationRequested,new(j.Options.ImportPublished,j.Options.ImportUnpublishedAsDrafts,j.Options.ImportCategories,j.Options.ImportMedia,j.Options.PreserveTimestamps,j.Options.ConflictBehavior),j.Validation is null?null:new(j.Validation.TotalArticles,j.Validation.PublishedArticles,j.Validation.UnpublishedArticles,j.Validation.Categories,j.Validation.CategoryDepth,j.Validation.ArticlesMissingAnswers,j.Validation.DuplicateIds,j.Validation.DuplicateSlugs,j.Validation.InvalidCategoryReferences,j.Validation.MissingMedia,j.Validation.AvailableFiles,j.Validation.MissingRequiredFiles,j.Validation.UnsupportedFiles,j.Validation.BlockingErrorCount,j.Validation.WarningCount),j.Result is null?null:new(j.Result.CategoryImported,j.Result.CategoryUpdated,j.Result.CategorySkipped,j.Result.PublishedImported,j.Result.DraftImported,j.Result.MediaImported,j.Result.MediaReused,j.Result.UnresolvedMedia,j.Result.UnsupportedData,j.Result.WarningCount),j.FailureCode,j.FailureMessage,j.Issues.Select(ToIssue).ToArray());
}
