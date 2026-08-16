using System.ComponentModel.DataAnnotations;
using Kb.Contracts.Common;

namespace Kb.Contracts.Articles;

public sealed class CreateArticleRequest
{
    [Required, NonWhiteSpace, StringLength(300)]
    public required string Title { get; init; }

    [NonEmptyGuid]
    public Guid CategoryId { get; init; }

    [NonWhiteSpace, StringLength(350)]
    public string? Slug { get; init; }

    [Required, RegularExpression("^(Public|Internal)$")]
    public string Visibility { get; init; } = "Public";
}

public sealed class UpdateArticleMetadataRequest
{
    [Required, NonWhiteSpace, StringLength(300)]
    public required string Title { get; init; }

    [NonEmptyGuid]
    public Guid CategoryId { get; init; }

    [NonWhiteSpace, StringLength(350)]
    public string? Slug { get; init; }

    [Required, Base64RowVersion]
    public required string RowVersion { get; init; }

    [RegularExpression("^(Public|Internal)$")]
    public string? Visibility { get; init; }
}

public sealed record ArticleSummaryResponse(Guid ArticleId, string Title, string Slug,
    CategorySummaryResponse? Category, UserSummaryResponse Author, string Status, DateTime CreatedAt, DateTime UpdatedAt);

public sealed record ArticleListItemResponse(Guid ArticleId, string Title, string Slug, string Status,
    CategorySummaryResponse? Category, UserSummaryResponse Owner, Guid? CurrentDraftId,
    Guid? CurrentPublishedVersionId, DateTime CreatedAt, DateTime UpdatedAt, DateTime? PublishedAt,
    bool IsCurrentDraftLocked, UserSummaryResponse? LockedBy, int Position, string Visibility);

public sealed record ArticleDetailsResponse(Guid ArticleId, string Title, string Slug, string Status,
    CategorySummaryResponse? Category, UserSummaryResponse Owner, ArticleDraftMetadataResponse? CurrentDraft,
    ArticlePublishedVersionMetadataResponse? CurrentPublishedVersion, DateTime CreatedAt, DateTime UpdatedAt,
    DateTime? SubmittedAt, DateTime? ApprovedAt, DateTime? PublishedAt, string Visibility);

public sealed record ArticleDraftMetadataResponse(Guid DraftId, string? ContentHash, long ContentSizeBytes,
    string RowVersion, string Status,
    bool IsLocked, UserSummaryResponse? LockedBy, DateTime? LockedAt, UserSummaryResponse CreatedBy,
    UserSummaryResponse? UpdatedBy, DateTime CreatedAt, DateTime UpdatedAt);

public sealed record ArticlePublishedVersionMetadataResponse(Guid VersionId, int VersionNumber,
    string? ContentHash, long ContentSizeBytes, UserSummaryResponse CreatedBy, DateTime CreatedAt,
    UserSummaryResponse? PublishedBy, DateTime? PublishedAt);

public sealed record ArticlePermissionsResponse(bool CanEdit, bool CanSubmitForReview, bool CanReview,
    bool CanRequestChanges, bool CanApprove, bool CanPublish, bool CanDelete, bool CanViewVersionHistory,
    bool CanRestoreVersion, bool CanLock, bool CanUnlock, bool CanComment, bool CanSuggest,
    bool CanOverrideWorkflow, IReadOnlyList<string> WorkflowOverrideTargets);
