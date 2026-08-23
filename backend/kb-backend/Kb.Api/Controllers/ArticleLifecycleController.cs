using Kb.Application.Lifecycle;
using Kb.Contracts.Articles;
using Kb.Contracts.Common;
using Kb.Contracts.Drafts;
using Kb.Contracts.Reviews;
using Kb.Contracts.Versions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Kb.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/articles/{articleId:guid}")]
public sealed class ArticleLifecycleController(ArticleLifecycleService lifecycle) : ControllerBase
{
    [HttpGet("permissions")]
    public async Task<ActionResult<ArticlePermissionsResponse>> GetPermissions(
        Guid articleId,
        CancellationToken cancellationToken)
    {
        var permissions = await lifecycle.GetPermissionsAsync(articleId, cancellationToken);
        return Ok(new ArticlePermissionsResponse(
            permissions.CanEdit,
            permissions.CanSubmitForReview,
            permissions.CanReview,
            permissions.CanRequestChanges,
            permissions.CanApprove,
            permissions.CanPublish,
            permissions.CanDelete,
            permissions.CanViewVersionHistory,
            permissions.CanRestoreVersion,
            permissions.CanLock,
            permissions.CanUnlock,
            permissions.CanComment,
            permissions.CanSuggest,
            permissions.CanOverrideWorkflow,
            permissions.WorkflowOverrideTargets));
    }

    [HttpGet("review-history")]
    public async Task<ActionResult<IReadOnlyList<ArticleReviewEventResponse>>> GetReviewHistory(
        Guid articleId,
        CancellationToken cancellationToken) =>
        Ok((await lifecycle.GetReviewHistoryAsync(articleId, cancellationToken))
            .Select(review => new ArticleReviewEventResponse(
                review.ReviewEventId,
                review.ArticleId,
                review.DraftId,
                review.FromStatus,
                review.ToStatus,
                review.Action,
                new(review.Actor.Id, review.Actor.Name),
                review.Comment,
                review.CreatedAt))
            .ToArray());

    [HttpGet("versions")]
    public async Task<ActionResult<PagedResponse<ArticleVersionSummaryResponse>>> GetVersions(
        Guid articleId,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = ArticleLifecycleService.DefaultVersionPageSize,
        CancellationToken cancellationToken = default)
    {
        var versions = await lifecycle.GetVersionsAsync(articleId, page, pageSize, cancellationToken);
        return Ok(new PagedResponse<ArticleVersionSummaryResponse>(
            versions.Items.Select(ToVersionSummary).ToArray(),
            versions.Page,
            versions.PageSize,
            versions.TotalCount));
    }

    [HttpGet("versions/{versionId:guid}")]
    public async Task<ActionResult<ArticleVersionDetailsResponse>> GetVersion(
        Guid articleId,
        Guid versionId,
        CancellationToken cancellationToken) =>
        Ok(ToVersionDetails(await lifecycle.GetVersionDetailsAsync(articleId, versionId, cancellationToken)));

    [HttpGet("published-version")]
    public async Task<ActionResult<PublishedArticleVersionResponse>> GetPublishedVersion(
        Guid articleId,
        CancellationToken cancellationToken)
    {
        var details = await lifecycle.GetPublishedVersionAsync(articleId, cancellationToken);
        var version = details.Version;
        return Ok(new PublishedArticleVersionResponse(
            version.VersionId,
            version.ArticleId,
            version.VersionNumber,
            details.Content,
            version.ContentHash,
            version.ContentSizeBytes,
            new(version.CreatedBy.Id, version.CreatedBy.Name),
            version.CreatedAt,
            version.PublishedBy is null ? null : new(version.PublishedBy.Id, version.PublishedBy.Name),
            version.PublishedAt));
    }

    [HttpGet("versions/compare")]
    public async Task<ActionResult<ArticleVersionComparisonResponse>> CompareVersions(
        Guid articleId,
        [FromQuery] Guid baseVersionId,
        [FromQuery] Guid targetVersionId,
        CancellationToken cancellationToken)
    {
        var comparison = await lifecycle.CompareVersionsAsync(
            articleId, baseVersionId, targetVersionId, cancellationToken);
        return Ok(new ArticleVersionComparisonResponse(
            ToVersionSummary(comparison.BaseVersion),
            ToVersionSummary(comparison.TargetVersion),
            comparison.BaseContent,
            comparison.TargetContent,
            comparison.Changes.Select(change => new VersionDiffEntryResponse(
                change.ChangeType,
                change.BlockType,
                change.BlockLabel,
                change.BeforePosition,
                change.AfterPosition,
                change.BeforeText,
                change.AfterText,
                change.Segments.Select(segment =>
                    new VersionDiffSegmentResponse(segment.ChangeType, segment.Text)).ToArray())).ToArray(),
            comparison.AddedCount,
            comparison.RemovedCount,
            comparison.ChangedCount,
            comparison.UnchangedCount));
    }

    [HttpPost("submit-for-review")]
    public Task<ActionResult<ArticleLifecycleResponse>> Submit(
        Guid articleId,
        SubmitForReviewRequest request,
        CancellationToken cancellationToken) =>
        Execute(articleId, lifecycle.SubmitAsync(articleId,
            new(Decode(request.RowVersion), request.Comment, request.AdditionalRecipientIds), cancellationToken));

    [HttpPost("review/start")]
    public Task<ActionResult<ArticleLifecycleResponse>> StartReview(
        Guid articleId,
        StartReviewRequest request,
        CancellationToken cancellationToken) =>
        Execute(articleId, lifecycle.StartReviewAsync(articleId,
            new(Decode(request.RowVersion), request.Comment, request.AdditionalRecipientIds), cancellationToken));

    [HttpPost("review/request-changes")]
    public Task<ActionResult<ArticleLifecycleResponse>> RequestChanges(
        Guid articleId,
        RequestChangesRequest request,
        CancellationToken cancellationToken) =>
        Execute(articleId, lifecycle.RequestChangesAsync(articleId,
            new(Decode(request.RowVersion), request.Comment, request.AdditionalRecipientIds), cancellationToken));

    [HttpPost("review/approve")]
    public Task<ActionResult<ArticleLifecycleResponse>> Approve(
        Guid articleId,
        ApproveArticleRequest request,
        CancellationToken cancellationToken) =>
        Execute(articleId, lifecycle.ApproveAsync(articleId,
            new(Decode(request.RowVersion), request.Comment, request.AdditionalRecipientIds), cancellationToken));

    [HttpPost("review/reject")]
    public Task<ActionResult<ArticleLifecycleResponse>> Reject(
        Guid articleId,
        RejectArticleRequest request,
        CancellationToken cancellationToken) =>
        Execute(articleId, lifecycle.RejectAsync(articleId,
            new(Decode(request.RowVersion), request.Comment, request.AdditionalRecipientIds), cancellationToken));

    [HttpPost("publish")]
    public Task<ActionResult<ArticleLifecycleResponse>> Publish(
        Guid articleId,
        PublishArticleRequest request,
        CancellationToken cancellationToken) =>
        Execute(articleId, lifecycle.PublishAsync(articleId,
            new(Decode(request.RowVersion), request.Comment, request.AdditionalRecipientIds), cancellationToken));

    [HttpPost("workflow/override")]
    public Task<ActionResult<ArticleLifecycleResponse>> Override(
        Guid articleId,
        WorkflowOverrideRequest request,
        CancellationToken cancellationToken) =>
        Execute(articleId, lifecycle.OverrideAsync(articleId,
            new(request.TargetStatus, request.Reason, Decode(request.RowVersion), request.AdditionalRecipientIds), cancellationToken));

    [HttpPost("versions/{versionId:guid}/restore")]
    public Task<ActionResult<ArticleLifecycleResponse>> Restore(
        Guid articleId,
        Guid versionId,
        RestoreArticleVersionRequest request,
        CancellationToken cancellationToken) =>
        Execute(articleId, lifecycle.RestoreAsync(articleId, versionId,
            new(Decode(request.RowVersion)), cancellationToken));

    [HttpPost("archive")]
    public async Task<IActionResult> Archive(
        Guid articleId,
        ArchiveArticleRequest request,
        CancellationToken cancellationToken)
    {
        await lifecycle.ArchiveAsync(articleId, Decode(request.RowVersion), request.AdditionalRecipientIds,
            cancellationToken);
        return NoContent();
    }

    [HttpPost("unarchive")]
    public Task<ActionResult<ArticleLifecycleResponse>> Unarchive(
        Guid articleId,
        CancellationToken cancellationToken) =>
        Execute(articleId, lifecycle.UnarchiveAsync(articleId, cancellationToken));

    private static async Task<ActionResult<ArticleLifecycleResponse>> Execute(
        Guid articleId,
        Task<LifecycleResultData> operation)
    {
        var result = await operation;
        return new ArticleLifecycleResponse(articleId, result.DraftId, result.Status,
            Convert.ToBase64String(result.RowVersion), result.PublishedVersionId,
            result.PublishedVersionNumber, result.ChangedAt);
    }

    private static byte[] Decode(string value) => Convert.FromBase64String(value);

    private static ArticleVersionSummaryResponse ToVersionSummary(LifecycleVersionSummaryData version) =>
        new(
            version.VersionId,
            version.ArticleId,
            version.VersionNumber,
            version.ContentHash,
            version.ContentSizeBytes,
            version.SourceDraftId,
            version.SourceDraftNumber,
            version.SnapshotReason,
            version.IsPublished,
            new(version.CreatedBy.Id, version.CreatedBy.Name),
            version.CreatedAt,
            version.PublishedBy is null ? null : new(version.PublishedBy.Id, version.PublishedBy.Name),
            version.PublishedAt);

    private static ArticleVersionDetailsResponse ToVersionDetails(LifecycleVersionDetailsData details)
    {
        var version = details.Version;
        return new(
            version.VersionId,
            version.ArticleId,
            version.VersionNumber,
            details.PlainText,
            details.RenderedHtml,
            version.ContentHash,
            version.ContentSizeBytes,
            version.SourceDraftId,
            version.SourceDraftNumber,
            version.SnapshotReason,
            version.IsPublished,
            new(version.CreatedBy.Id, version.CreatedBy.Name),
            version.CreatedAt,
            version.PublishedBy is null ? null : new(version.PublishedBy.Id, version.PublishedBy.Name),
            version.PublishedAt);
    }
}
