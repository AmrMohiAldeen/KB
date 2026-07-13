using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using Kb.Contracts.Common;

namespace Kb.Contracts.Articles;

public sealed class CreateArticleRequest
{
    [Required, NonWhiteSpace, StringLength(300)]
    public required string Title { get; init; }

    [NonEmptyGuid]
    public Guid? CategoryId { get; init; }

    [NonEmptyGuid]
    public Guid? TemplateId { get; init; }
}

public sealed class UpdateArticleMetadataRequest
{
    [Required, NonWhiteSpace, StringLength(300)]
    public required string Title { get; init; }

    [NonEmptyGuid]
    public Guid? CategoryId { get; init; }
}

public sealed record ArticleSummaryResponse(
    Guid ArticleId,
    string Title,
    string Slug,
    CategorySummaryResponse? Category,
    UserSummaryResponse Author,
    string Status,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public sealed record ArticleDetailsResponse(
    Guid ArticleId,
    string Title,
    string Slug,
    CategorySummaryResponse? Category,
    UserSummaryResponse Author,
    string Status,
    Guid? CurrentDraftId,
    Guid? LastPublishedVersionId,
    JsonElement Content,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    ArticlePermissionsResponse Permissions);

public sealed record ArticlePermissionsResponse(
    bool CanEdit,
    bool CanSubmitForReview,
    bool CanReview,
    bool CanRequestChanges,
    bool CanApprove,
    bool CanPublish,
    bool CanDelete,
    bool CanViewVersionHistory,
    bool CanRestoreVersion,
    bool CanLock,
    bool CanUnlock,
    bool CanComment,
    bool CanSuggest);
