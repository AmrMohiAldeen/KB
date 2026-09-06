using System.Text.Json;
using Kb.Application.Exceptions;
using Kb.Application.Languages;
using Kb.Domain.Constants;
using Kb.Infrastructure.Data;
using Kb.Infrastructure.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Kb.Infrastructure.Languages;

public sealed class LanguageRepository(KbDbContext db) : ILanguageRepository
{
    public async Task<IReadOnlyList<LanguageData>> GetAllAsync(CancellationToken ct) => await db.KbLanguages.AsNoTracking()
        .OrderByDescending(x => x.IsDefault).ThenBy(x => x.SortOrder).ThenBy(x => x.DisplayName).Select(ToDataProjection).ToListAsync(ct);
    public async Task<IReadOnlyList<LanguageData>> GetEnabledAsync(CancellationToken ct) => await db.KbLanguages.AsNoTracking()
        .Where(x => x.IsEnabled).OrderByDescending(x => x.IsDefault).ThenBy(x => x.SortOrder).ThenBy(x => x.DisplayName)
        .Select(ToDataProjection).ToListAsync(ct);
    public async Task<LanguageData> CreateAsync(NewLanguageData value, LanguageAuditData audit, CancellationToken ct)
    {
        if (await db.KbLanguages.AnyAsync(x => x.LocaleCode == value.LocaleCode, ct)) throw new ConflictException("That locale is already configured.");
        var language = new KbLanguage { LanguageId = Guid.NewGuid(), LocaleCode = value.LocaleCode, DisplayName = value.DisplayName, NativeName = value.NativeName, IsRtl = value.IsRtl, SortOrder = value.SortOrder, IsEnabled = false, IsDefault = false, CreatedAt = audit.CreatedAt, UpdatedAt = audit.CreatedAt };
        db.KbLanguages.Add(language); Audit(language.LanguageId, audit, LanguageAuditActions.Configured, new { language.LocaleCode }); await db.SaveChangesAsync(ct); return ToData(language);
    }
    public async Task<LanguageData> UpdateAsync(Guid id, UpdateLanguageData value, LanguageAuditData audit, CancellationToken ct)
    {
        var language = await Find(id, ct); language.DisplayName = value.DisplayName; language.NativeName = value.NativeName; language.IsRtl = value.IsRtl; language.SortOrder = value.SortOrder; language.UpdatedAt = audit.CreatedAt;
        await db.SaveChangesAsync(ct); return ToData(language);
    }
    public async Task<LanguageData> SetEnabledAsync(Guid id, bool enabled, LanguageAuditData audit, CancellationToken ct)
    {
        var language = await Find(id, ct); if (!enabled && language.IsDefault) throw new BusinessRuleException("The default language cannot be disabled."); if (language.IsEnabled == enabled) return ToData(language);
        language.IsEnabled = enabled; language.UpdatedAt = audit.CreatedAt; Audit(id, audit, enabled ? LanguageAuditActions.Enabled : LanguageAuditActions.Disabled, new { language.LocaleCode }); await db.SaveChangesAsync(ct); return ToData(language);
    }
    public async Task<LanguageData> SetDefaultAsync(Guid id, LanguageAuditData audit, CancellationToken ct)
    {
        var target = await Find(id, ct); if (!target.IsEnabled) throw new BusinessRuleException("Only an enabled language can be the default."); if (target.IsDefault) return ToData(target);
        var previous = await db.KbLanguages.AsNoTracking().SingleAsync(x => x.IsDefault, ct);
        await db.KbLanguages.ExecuteUpdateAsync(setters => setters.SetProperty(x => x.IsDefault, x => x.LanguageId == id).SetProperty(x => x.UpdatedAt, audit.CreatedAt), ct);
        target.IsDefault = true; target.UpdatedAt = audit.CreatedAt; Audit(id, audit, LanguageAuditActions.DefaultChanged, new { previousLanguageId = previous.LanguageId, previousLocaleCode = previous.LocaleCode, targetLocaleCode = target.LocaleCode }); await db.SaveChangesAsync(ct); return ToData(target);
    }
    private async Task<KbLanguage> Find(Guid id, CancellationToken ct) => await db.KbLanguages.SingleOrDefaultAsync(x => x.LanguageId == id, ct) ?? throw new NotFoundException("The language was not found.");
    private void Audit(Guid languageId, LanguageAuditData audit, string action, object metadata) => db.ArticleAuditLogs.Add(new ArticleAuditLog { AuditLogId = db.Database.IsSqlServer() ? Guid.Empty : Guid.NewGuid(), ActorIdFk = audit.ActorId, ActionType = action, EntityType = ArticleAuditEntityTypes.Language, EntityId = languageId, MetaDataJson = JsonSerializer.Serialize(metadata), CreatedAt = audit.CreatedAt });
    private static readonly System.Linq.Expressions.Expression<Func<KbLanguage, LanguageData>> ToDataProjection = x => new(x.LanguageId, x.LocaleCode, x.DisplayName, x.NativeName, x.IsDefault, x.IsEnabled, x.IsRtl, x.SortOrder, x.CreatedAt, x.UpdatedAt);
    private static LanguageData ToData(KbLanguage x) => new(x.LanguageId, x.LocaleCode, x.DisplayName, x.NativeName, x.IsDefault, x.IsEnabled, x.IsRtl, x.SortOrder, x.CreatedAt, x.UpdatedAt);
}
