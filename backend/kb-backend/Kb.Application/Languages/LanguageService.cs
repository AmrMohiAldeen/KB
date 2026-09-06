using Kb.Application.Abstractions;
using Kb.Application.Exceptions;
using Kb.Domain.Constants;

namespace Kb.Application.Languages;

public sealed class LanguageService(ILanguageRepository repository, ICurrentUser currentUser,
    IPermissionChecker permissions, TimeProvider timeProvider)
{
    public async Task<IReadOnlyList<LanguageData>> GetAllAsync(CancellationToken ct) { await RequireManageAsync(ct); return await repository.GetAllAsync(ct); }
    public async Task<IReadOnlyList<LanguageData>> GetEnabledForTranslationAsync(CancellationToken ct)
    {
        await RequireTranslationAsync(ct);
        return await repository.GetEnabledAsync(ct);
    }
    public async Task<LanguageData> CreateAsync(NewLanguageData request, CancellationToken ct)
    { await RequireManageAsync(ct); return await repository.CreateAsync(new(NormalizeLocale(request.LocaleCode), Required(request.DisplayName, "Display name", 200), Required(request.NativeName, "Native name", 200), request.IsRtl, Sort(request.SortOrder)), Audit(), ct); }
    public async Task<LanguageData> UpdateAsync(Guid id, UpdateLanguageData request, CancellationToken ct)
    { await RequireManageAsync(ct); Id(id, "Language"); return await repository.UpdateAsync(id, new(Required(request.DisplayName, "Display name", 200), Required(request.NativeName, "Native name", 200), request.IsRtl, Sort(request.SortOrder)), Audit(), ct); }
    public async Task<LanguageData> SetEnabledAsync(Guid id, bool enabled, CancellationToken ct)
    { await RequireManageAsync(ct); Id(id, "Language"); return await repository.SetEnabledAsync(id, enabled, Audit(), ct); }
    public async Task<LanguageData> SetDefaultAsync(Guid id, CancellationToken ct)
    { await RequireManageAsync(ct); Id(id, "Language"); return await repository.SetDefaultAsync(id, Audit(), ct); }
    private async Task RequireManageAsync(CancellationToken ct) { if (!currentUser.IsAuthenticated) throw new UnauthorizedAccessException(); if (!await permissions.HasPermissionAsync(currentUser.UserId, PermissionCodes.LanguagesManage, ct)) throw new ForbiddenException("You do not have permission to manage languages."); }
    private async Task RequireTranslationAsync(CancellationToken ct) { if (!currentUser.IsAuthenticated) throw new UnauthorizedAccessException(); if (!await permissions.HasPermissionAsync(currentUser.UserId, PermissionCodes.ArticlesTranslate, ct)) throw new ForbiddenException("You do not have permission to manage article translations."); }
    private LanguageAuditData Audit() => new(currentUser.UserId, timeProvider.GetUtcNow().UtcDateTime);
    private static int Sort(int value) => value >= 0 ? value : throw new BusinessRuleException("Sort order cannot be negative.");
    private static void Id(Guid id, string name) { if (id == Guid.Empty) throw new BusinessRuleException($"{name} is required."); }
    private static string NormalizeLocale(string? value) { var locale = Required(value, "Locale code", 35).Replace('_', '-'); if (!System.Text.RegularExpressions.Regex.IsMatch(locale, "^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$")) throw new BusinessRuleException("Locale code must be a valid BCP-47-style code."); return locale; }
    private static string Required(string? value, string name, int max) { if (string.IsNullOrWhiteSpace(value)) throw new BusinessRuleException($"{name} is required."); var trimmed = value.Trim(); return trimmed.Length > max ? throw new BusinessRuleException($"{name} cannot exceed {max} characters.") : trimmed; }
}
