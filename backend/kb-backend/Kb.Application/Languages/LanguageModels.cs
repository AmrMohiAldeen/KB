namespace Kb.Application.Languages;

public sealed record LanguageData(Guid Id, string LocaleCode, string DisplayName, string NativeName, bool IsDefault,
    bool IsEnabled, bool IsRtl, int SortOrder, DateTime CreatedAt, DateTime UpdatedAt);
public sealed record NewLanguageData(string LocaleCode, string DisplayName, string NativeName, bool IsRtl, int SortOrder);
public sealed record UpdateLanguageData(string DisplayName, string NativeName, bool IsRtl, int SortOrder);
public sealed record LanguageAuditData(Guid ActorId, DateTime CreatedAt);

public interface ILanguageRepository
{
    Task<IReadOnlyList<LanguageData>> GetAllAsync(CancellationToken cancellationToken);
    Task<LanguageData> CreateAsync(NewLanguageData language, LanguageAuditData audit, CancellationToken cancellationToken);
    Task<LanguageData> UpdateAsync(Guid id, UpdateLanguageData language, LanguageAuditData audit, CancellationToken cancellationToken);
    Task<LanguageData> SetEnabledAsync(Guid id, bool enabled, LanguageAuditData audit, CancellationToken cancellationToken);
    Task<LanguageData> SetDefaultAsync(Guid id, LanguageAuditData audit, CancellationToken cancellationToken);
}
