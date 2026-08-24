using System.ComponentModel.DataAnnotations;
using Kb.Contracts.Common;

namespace Kb.Contracts.Translations;

public sealed class CreateProtectedTranslationTermRequest
{
    [Required, NonWhiteSpace, StringLength(300)] public required string Term { get; init; }
    [NonWhiteSpace, StringLength(35)] public string? LocaleCode { get; init; }
    public bool IsEnabled { get; init; } = true;
    [StringLength(4000)] public string? Metadata { get; init; }
}

public sealed class UpdateProtectedTranslationTermRequest
{
    [Required, NonWhiteSpace, StringLength(300)] public required string Term { get; init; }
    [NonWhiteSpace, StringLength(35)] public string? LocaleCode { get; init; }
    public bool IsEnabled { get; init; }
    [StringLength(4000)] public string? Metadata { get; init; }
}

public sealed record ProtectedTranslationTermResponse(Guid Id, string Term, string? LocaleCode, bool IsEnabled,
    string? Metadata, DateTime CreatedAt, DateTime UpdatedAt);

public sealed record AutomaticArticleTranslationResponse(Guid SourceArticleId, Guid TargetArticleId,
    Guid TargetDraftId, string SourceLocaleCode, string TargetLocaleCode, string TranslatedTitle,
    int TranslatedSegmentCount, string TranslationMethod, string TranslationStatus, DateTime TranslatedAt);
