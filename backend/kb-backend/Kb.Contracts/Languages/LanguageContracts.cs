using System.ComponentModel.DataAnnotations;
using Kb.Contracts.Common;

namespace Kb.Contracts.Languages;

public sealed class CreateLanguageRequest
{
    [Required, NonWhiteSpace, StringLength(35)] public required string LocaleCode { get; init; }
    [Required, NonWhiteSpace, StringLength(200)] public required string DisplayName { get; init; }
    [Required, NonWhiteSpace, StringLength(200)] public required string NativeName { get; init; }
    public bool IsRtl { get; init; }
    [Range(0, int.MaxValue)] public int SortOrder { get; init; }
}

public sealed class UpdateLanguageRequest
{
    [Required, NonWhiteSpace, StringLength(200)] public required string DisplayName { get; init; }
    [Required, NonWhiteSpace, StringLength(200)] public required string NativeName { get; init; }
    [Range(0, int.MaxValue)] public int SortOrder { get; init; }
    public bool IsRtl { get; init; }
}

public sealed record LanguageResponse(Guid LanguageId, string LocaleCode, string DisplayName, string NativeName,
    bool IsDefault, bool IsEnabled, bool IsRtl, int SortOrder, DateTime CreatedAt, DateTime UpdatedAt);

public sealed record TranslationLanguageResponse(string LocaleCode, string DisplayName, string NativeName, bool IsRtl);
