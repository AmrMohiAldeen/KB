using Kb.Application.ExportJobs;
using Kb.Contracts.Common;
using Kb.Contracts.ExportJobs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Kb.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/export-jobs")]
public sealed class ExportJobsController(ExportService exports) : ControllerBase
{
    [HttpPost("articles/{articleId:guid}")]
    [ProducesResponseType<ExportJobResponse>(StatusCodes.Status202Accepted)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ExportJobResponse>> ExportArticle(Guid articleId,
        CreateExportRequest request, CancellationToken cancellationToken)
    {
        var job = await exports.RequestArticleAsync(articleId, request.ExportType, cancellationToken);
        return AcceptedAtAction(nameof(Get), new { jobId = job.Id }, ToResponse(job));
    }

    [HttpPost("categories/{categoryId:guid}")]
    [ProducesResponseType<ExportJobResponse>(StatusCodes.Status202Accepted)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ExportJobResponse>> ExportCategory(Guid categoryId,
        CreateExportRequest request, CancellationToken cancellationToken)
    {
        var job = await exports.RequestCategoryAsync(categoryId, request.ExportType, cancellationToken);
        return AcceptedAtAction(nameof(Get), new { jobId = job.Id }, ToResponse(job));
    }

    [HttpGet("{jobId:guid}", Name = nameof(Get))]
    [ProducesResponseType<ExportJobResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ExportJobResponse>> Get(Guid jobId,
        CancellationToken cancellationToken) => ToResponse(await exports.GetAsync(jobId, cancellationToken));

    [HttpGet("{jobId:guid}/download")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Download(Guid jobId, CancellationToken cancellationToken)
    {
        var result = await exports.DownloadAsync(jobId, cancellationToken);
        return File(result.Content, result.ContentType, result.FileName, enableRangeProcessing: true);
    }

    private static ExportJobResponse ToResponse(ExportJobData job) => new(job.Id, job.EntityType,
        job.ArticleId, job.CategoryId, job.VersionId, job.ExportType, job.Status,
        new UserSummaryResponse(job.RequestedById, job.RequestedByName), job.RequestedAt,
        job.StartedAt, job.CompletedAt, job.FileName,
        job.Status == Kb.Domain.Constants.JobStatuses.Completed
            ? $"/api/export-jobs/{job.Id:D}/download" : null,
        job.ErrorMessage);
}
