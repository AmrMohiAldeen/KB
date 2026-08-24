using System.Text.Json;
using Kb.Application.Abstractions;
using Kb.Application.Exceptions;
using Kb.Domain.Constants;

namespace Kb.Application.Translations;

public sealed class ProtectedTranslationTermService(IProtectedTranslationTermRepository repository,
    ICurrentUser currentUser, IPermissionChecker permissions, TimeProvider timeProvider)
{
    public async Task<IReadOnlyList<ProtectedTranslationTermData>> GetAllAsync(CancellationToken ct)
    { await RequireManageAsync(ct); return await repository.GetAllAsync(ct); }

    public async Task<ProtectedTranslationTermData> CreateAsync(ProtectedTranslationTermMutation value,
        CancellationToken ct)
    { await RequireManageAsync(ct); return await repository.CreateAsync(Normalize(value), Audit(), ct); }

    public async Task<ProtectedTranslationTermData> UpdateAsync(Guid id, ProtectedTranslationTermMutation value,
        CancellationToken ct)
    { await RequireManageAsync(ct); Id(id); return await repository.UpdateAsync(id, Normalize(value), Audit(), ct); }

    public async Task DeleteAsync(Guid id, CancellationToken ct)
    { await RequireManageAsync(ct); Id(id); await repository.DeleteAsync(id, Audit(), ct); }

    private async Task RequireManageAsync(CancellationToken ct)
    {
        if (!currentUser.IsAuthenticated) throw new UnauthorizedAccessException();
        if (!await permissions.HasPermissionAsync(currentUser.UserId, PermissionCodes.LanguagesManage, ct))
            throw new ForbiddenException("You do not have permission to manage protected translation terms.");
    }

    private ProtectedTranslationTermAuditData Audit() =>
        new(currentUser.UserId, timeProvider.GetUtcNow().UtcDateTime);

    private static ProtectedTranslationTermMutation Normalize(ProtectedTranslationTermMutation value)
    {
        var term = value.Term?.Trim();
        if (string.IsNullOrWhiteSpace(term)) throw new BusinessRuleException("Term is required.");
        if (term.Length > 300) throw new BusinessRuleException("Term cannot exceed 300 characters.");
        var locale = string.IsNullOrWhiteSpace(value.LocaleCode) ? null : NormalizeLocale(value.LocaleCode);
        var metadata = string.IsNullOrWhiteSpace(value.MetadataJson) ? null : value.MetadataJson.Trim();
        if (metadata is not null)
        {
            if (metadata.Length > 4000) throw new BusinessRuleException("Metadata cannot exceed 4000 characters.");
            try { using var _ = JsonDocument.Parse(metadata); }
            catch (JsonException exception) { throw new BusinessRuleException($"Metadata must be valid JSON: {exception.Message}"); }
        }
        return new(term, locale, value.IsEnabled, metadata);
    }

    private static string NormalizeLocale(string value)
    {
        var locale = value.Trim().Replace('_', '-');
        if (locale.Length > 35 || !System.Text.RegularExpressions.Regex.IsMatch(locale,
                "^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$"))
            throw new BusinessRuleException("Locale code must be a valid BCP-47-style code.");
        return locale;
    }

    private static void Id(Guid id)
    { if (id == Guid.Empty) throw new BusinessRuleException("Protected translation term ID is required."); }
}
