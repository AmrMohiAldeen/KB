using System.ComponentModel.DataAnnotations;
using Kb.Contracts.Common;

namespace Kb.Contracts.Translations;

public sealed class CreateArticleTranslationRequest
{
    [Required, NonWhiteSpace, StringLength(35)] public required string LocaleCode { get; init; }
    [Required, NonWhiteSpace, StringLength(300)] public required string Title { get; init; }
    [NonEmptyGuid] public Guid CategoryId { get; init; }
    public IReadOnlyList<Guid>? CategoryIds { get; init; }
    [NonWhiteSpace, StringLength(350)] public string? Slug { get; init; }
    [RegularExpression("^(Public|Internal)$")] public string Visibility { get; init; } = "Public";
    [NonEmptyGuid] public Guid? AssignedTranslatorUserId { get; init; }
}

public sealed class AssignTranslatorRequest
{
    [NonEmptyGuid] public Guid? TranslatorUserId { get; init; }
}

public sealed record ArticleTranslationResponse(Guid ArticleId, Guid TranslationGroupId, string LocaleCode,
    string Title, string Slug, string WorkflowStatus, string TranslationStatus, string TranslationMethod,
    Guid? SourceArticleId, Guid? SourceVersionId, int? SourceVersionNumber, Guid? AssignedTranslatorUserId,
    DateTime? LastTranslatedAt, DateTime? VerifiedAt, Guid? VerifiedByUserId, Guid? CurrentSourceVersionId,
    int? CurrentSourceVersionNumber, bool? IsCurrent);

public sealed class LocalizationSyncRequest
{
    [Required, MinLength(1), MaxLength(50)]
    public required IReadOnlyList<string> TargetLocaleCodes { get; init; }

    [Required, RegularExpression("^(MissingOnly|UpdateExisting)$")]
    public required string Scope { get; init; }

    [Required, RegularExpression("^(CopySource|AutomaticTranslation)$")]
    public required string Mode { get; init; }
}

public sealed record LocalizationSyncPreviewItemResponse(string TargetLocaleCode, Guid? TargetArticleId,
    string State, string Operation, bool MayReplaceManualDraftContent);

public sealed record LocalizationSyncPreviewResponse(Guid SourceArticleId, string SourceLocaleCode,
    Guid? SourceVersionId, int? SourceVersionNumber, string Scope, string Mode,
    IReadOnlyList<LocalizationSyncPreviewItemResponse> Items);

public sealed record LocalizationSyncOutcomeResponse(string TargetLocaleCode, Guid? TargetArticleId,
    string Operation, string Outcome, Guid? TargetDraftId, string? TranslationStatus, string? Error);

public sealed record LocalizationSyncResultResponse(Guid SourceArticleId, Guid? SourceVersionId,
    int? SourceVersionNumber, IReadOnlyList<LocalizationSyncOutcomeResponse> Outcomes);
