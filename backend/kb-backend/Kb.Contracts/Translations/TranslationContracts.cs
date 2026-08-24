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

public sealed class LinkArticleTranslationRequest
{
    [NonEmptyGuid] public Guid ArticleId { get; init; }
}

public sealed class AssignTranslatorRequest
{
    [NonEmptyGuid] public Guid? TranslatorUserId { get; init; }
}

public sealed record ArticleTranslationResponse(Guid ArticleId, Guid TranslationGroupId, string LocaleCode,
    string Title, string Slug, string WorkflowStatus, string TranslationStatus, string TranslationMethod,
    Guid? SourceArticleId, Guid? SourceVersionId, int? SourceVersionNumber, Guid? AssignedTranslatorUserId,
    DateTime? LastTranslatedAt, DateTime? VerifiedAt, Guid? VerifiedByUserId);
