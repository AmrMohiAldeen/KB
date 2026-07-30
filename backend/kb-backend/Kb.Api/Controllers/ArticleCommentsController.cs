using Kb.Application.Authorization;
using Kb.Application.Comments;
using Kb.Contracts.Comments;
using Kb.Contracts.Common;
using Kb.Domain.Constants;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Kb.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/articles/{articleId:guid}/comments")]
public sealed class ArticleCommentsController(ArticleCommentService comments) : ControllerBase
{
    private const string CreatePolicy = PermissionPolicy.Prefix + Kb.Contracts.Common.PermissionCodes.CommentsCreate;

    [HttpGet]
    [ProducesResponseType<ArticleCommentsResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ArticleCommentsResponse>> List(
        Guid articleId,
        CancellationToken cancellationToken)
    {
        var result = await comments.ListAsync(articleId, cancellationToken);
        return Ok(ToListResponse(result));
    }

    [HttpPost]
    [Authorize(Policy = CreatePolicy)]
    [ProducesResponseType<CommentResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<CommentResponse>> Create(
        Guid articleId,
        CreateCommentRequest request,
        CancellationToken cancellationToken)
    {
        var created = await comments.CreateAsync(articleId,
            new(request.Body, request.CurrentDraftId, request.AnchorType, request.AnchorData),
            cancellationToken);
        var response = ToResponse(created, [], created.CreatedBy.Id, true, false, created.Status);
        return CreatedAtAction(nameof(List), new { articleId }, response);
    }

    [HttpPost("{threadId:guid}/replies")]
    [Authorize(Policy = CreatePolicy)]
    [ProducesResponseType<CommentResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<CommentResponse>> Reply(
        Guid articleId,
        Guid threadId,
        ReplyToCommentRequest request,
        CancellationToken cancellationToken)
    {
        var created = await comments.ReplyAsync(articleId, threadId, request.Body, cancellationToken);
        return CreatedAtAction(nameof(List), new { articleId },
            ToResponse(created, [], created.CreatedBy.Id, true, false, CommentThreadStatuses.Open));
    }

    [HttpPut("{commentId:guid}")]
    [ProducesResponseType<CommentResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<CommentResponse>> Update(
        Guid articleId,
        Guid commentId,
        UpdateCommentRequest request,
        CancellationToken cancellationToken)
    {
        var updated = await comments.UpdateAsync(articleId, commentId, request.Body, Decode(request.RowVersion),
            cancellationToken);
        return Ok(ToResponse(updated, [], updated.CreatedBy.Id, true, false, updated.Status));
    }

    [HttpDelete("{commentId:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Delete(
        Guid articleId,
        Guid commentId,
        [FromBody] CommentConcurrencyRequest request,
        CancellationToken cancellationToken)
    {
        await comments.DeleteAsync(articleId, commentId, Decode(request.RowVersion), cancellationToken);
        return NoContent();
    }

    [HttpPost("{threadId:guid}/resolve")]
    [ProducesResponseType<CommentResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<CommentResponse>> Resolve(
        Guid articleId,
        Guid threadId,
        CommentConcurrencyRequest request,
        CancellationToken cancellationToken)
    {
        var updated = await comments.ResolveAsync(articleId, threadId, Decode(request.RowVersion),
            cancellationToken);
        return Ok(ToResponse(updated, [], updated.CreatedBy.Id, true, false, updated.Status));
    }

    [HttpPost("{threadId:guid}/reopen")]
    [ProducesResponseType<CommentResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<CommentResponse>> Reopen(
        Guid articleId,
        Guid threadId,
        CommentConcurrencyRequest request,
        CancellationToken cancellationToken)
    {
        var updated = await comments.ReopenAsync(articleId, threadId, Decode(request.RowVersion),
            cancellationToken);
        return Ok(ToResponse(updated, [], updated.CreatedBy.Id, true, false, updated.Status));
    }

    private static ArticleCommentsResponse ToListResponse(ArticleCommentListData result)
    {
        var roots = result.Comments.Where(comment => comment.ParentCommentId is null)
            .OrderBy(comment => comment.CreatedAt)
            .ThenBy(comment => comment.CommentId)
            .Select(root =>
            {
                var replies = result.Comments.Where(comment => comment.ParentCommentId == root.CommentId)
                    .OrderBy(comment => comment.CreatedAt)
                    .ThenBy(comment => comment.CommentId)
                    .Select(reply => ToResponse(reply, [], result.ActorId, result.CanComment,
                        result.CanModerate, root.Status))
                    .ToArray();
                return ToResponse(root, replies, result.ActorId, result.CanComment, result.CanModerate, root.Status);
            })
            .ToArray();
        return new(roots, result.CanComment, result.CanModerate);
    }

    private static CommentResponse ToResponse(
        ArticleCommentData value,
        IReadOnlyList<CommentResponse> replies,
        Guid actorId,
        bool canComment,
        bool canModerate,
        string threadStatus)
    {
        var owns = value.CreatedBy.Id == actorId;
        var mutable = value.DeletedAt is null && threadStatus == CommentThreadStatuses.Open;
        var canModify = mutable && (canModerate || owns && canComment);
        return new(
            value.CommentId,
            value.ArticleId,
            value.ParentCommentId,
            value.DeletedAt is null ? value.Body : null,
            value.CurrentDraftId,
            value.OriginDraftId,
            value.AnchorType,
            value.AnchorData,
            value.AnchorStatus,
            value.Status,
            ToUser(value.CreatedBy),
            value.CreatedAt,
            value.UpdatedAt,
            value.ResolvedBy is null ? null : ToUser(value.ResolvedBy),
            value.ResolvedAt,
            value.DeletedAt,
            Convert.ToBase64String(value.RowVersion),
            canModify,
            canModify,
            value.ParentCommentId is null && value.DeletedAt is null && (canModerate || owns && canComment),
            replies);
    }

    private static UserSummaryResponse ToUser(CommentUserData user) => new(user.Id, user.Name);
    private static byte[] Decode(string rowVersion) => Convert.FromBase64String(rowVersion);
}
