namespace Kb.Application.Translations;

public sealed record ProtectedTranslationTermData(Guid Id, string Term, string? LocaleCode, bool IsEnabled,
    string? MetadataJson, DateTime CreatedAt, DateTime UpdatedAt);
public sealed record ProtectedTranslationTermMutation(string Term, string? LocaleCode, bool IsEnabled,
    string? MetadataJson);
public sealed record ProtectedTranslationTermAuditData(Guid ActorId, DateTime CreatedAt);

public interface IProtectedTranslationTermRepository
{
    Task<IReadOnlyList<ProtectedTranslationTermData>> GetAllAsync(CancellationToken cancellationToken);
    Task<IReadOnlyList<string>> GetEnabledAsync(string targetLocaleCode, CancellationToken cancellationToken);
    Task<ProtectedTranslationTermData> CreateAsync(ProtectedTranslationTermMutation value,
        ProtectedTranslationTermAuditData audit, CancellationToken cancellationToken);
    Task<ProtectedTranslationTermData> UpdateAsync(Guid id, ProtectedTranslationTermMutation value,
        ProtectedTranslationTermAuditData audit, CancellationToken cancellationToken);
    Task DeleteAsync(Guid id, ProtectedTranslationTermAuditData audit, CancellationToken cancellationToken);
}
