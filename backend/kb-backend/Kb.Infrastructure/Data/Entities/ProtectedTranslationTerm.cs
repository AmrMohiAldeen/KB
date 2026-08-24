namespace Kb.Infrastructure.Data.Entities;

public sealed class ProtectedTranslationTerm
{
    public Guid ProtectedTranslationTermId { get; set; }
    public string Term { get; set; } = null!;
    public string? LocaleCode { get; set; }
    public bool IsEnabled { get; set; }
    public string? MetadataJson { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public KbLanguage? Language { get; set; }
}
