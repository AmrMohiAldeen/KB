using System.Text.Json;
using Kb.Application.Exceptions;
using Kb.Application.Translations;
using Kb.Domain.Constants;
using Kb.Infrastructure.Data;
using Kb.Infrastructure.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Kb.Infrastructure.Translations;

public sealed class ProtectedTranslationTermRepository(KbDbContext db) : IProtectedTranslationTermRepository
{
    public async Task<IReadOnlyList<ProtectedTranslationTermData>> GetAllAsync(CancellationToken ct) =>
        await db.ProtectedTranslationTerms.AsNoTracking()
            .OrderBy(x => x.LocaleCode).ThenBy(x => x.Term).Select(ToDataProjection).ToListAsync(ct);

    public async Task<IReadOnlyList<string>> GetEnabledAsync(string targetLocaleCode, CancellationToken ct) =>
        await db.ProtectedTranslationTerms.AsNoTracking()
            .Where(x => x.IsEnabled && (x.LocaleCode == null || x.LocaleCode == targetLocaleCode))
            .OrderByDescending(x => x.Term.Length).Select(x => x.Term).ToListAsync(ct);

    public async Task<ProtectedTranslationTermData> CreateAsync(ProtectedTranslationTermMutation value,
        ProtectedTranslationTermAuditData audit, CancellationToken ct)
    {
        await EnsureAvailable(value.Term, value.LocaleCode, null, ct);
        await EnsureLanguage(value.LocaleCode, ct);
        var entity = new ProtectedTranslationTerm
        {
            ProtectedTranslationTermId = Guid.NewGuid(), Term = value.Term, LocaleCode = value.LocaleCode,
            IsEnabled = value.IsEnabled, MetadataJson = value.MetadataJson,
            CreatedAt = audit.CreatedAt, UpdatedAt = audit.CreatedAt
        };
        db.ProtectedTranslationTerms.Add(entity);
        AddAudit(entity.ProtectedTranslationTermId, audit, ProtectedTranslationTermAuditActions.Created,
            new { entity.Term, entity.LocaleCode, entity.IsEnabled });
        await db.SaveChangesAsync(ct);
        return ToData(entity);
    }

    public async Task<ProtectedTranslationTermData> UpdateAsync(Guid id, ProtectedTranslationTermMutation value,
        ProtectedTranslationTermAuditData audit, CancellationToken ct)
    {
        var entity = await Find(id, ct);
        await EnsureAvailable(value.Term, value.LocaleCode, id, ct);
        await EnsureLanguage(value.LocaleCode, ct);
        entity.Term = value.Term; entity.LocaleCode = value.LocaleCode; entity.IsEnabled = value.IsEnabled;
        entity.MetadataJson = value.MetadataJson; entity.UpdatedAt = audit.CreatedAt;
        AddAudit(id, audit, ProtectedTranslationTermAuditActions.Updated,
            new { entity.Term, entity.LocaleCode, entity.IsEnabled });
        await db.SaveChangesAsync(ct);
        return ToData(entity);
    }

    public async Task DeleteAsync(Guid id, ProtectedTranslationTermAuditData audit, CancellationToken ct)
    {
        var entity = await Find(id, ct);
        AddAudit(id, audit, ProtectedTranslationTermAuditActions.Deleted,
            new { entity.Term, entity.LocaleCode });
        db.ProtectedTranslationTerms.Remove(entity);
        await db.SaveChangesAsync(ct);
    }

    private async Task EnsureAvailable(string term, string? locale, Guid? excludedId, CancellationToken ct)
    {
        if (await db.ProtectedTranslationTerms.AnyAsync(x => x.Term == term && x.LocaleCode == locale &&
                (!excludedId.HasValue || x.ProtectedTranslationTermId != excludedId), ct))
            throw new ConflictException("That protected term is already configured for this locale scope.");
    }

    private async Task EnsureLanguage(string? locale, CancellationToken ct)
    {
        if (locale is not null && !await db.KbLanguages.AnyAsync(x => x.LocaleCode == locale, ct))
            throw new NotFoundException("The scoped language was not found.");
    }

    private async Task<ProtectedTranslationTerm> Find(Guid id, CancellationToken ct) =>
        await db.ProtectedTranslationTerms.SingleOrDefaultAsync(x => x.ProtectedTranslationTermId == id, ct)
        ?? throw new NotFoundException("The protected translation term was not found.");

    private void AddAudit(Guid id, ProtectedTranslationTermAuditData audit, string action, object metadata) =>
        db.ArticleAuditLogs.Add(new ArticleAuditLog
        {
            AuditLogId = db.Database.IsSqlServer() ? Guid.Empty : Guid.NewGuid(), ActorIdFk = audit.ActorId,
            ActionType = action, EntityType = ArticleAuditEntityTypes.ProtectedTranslationTerm, EntityId = id,
            MetaDataJson = JsonSerializer.Serialize(metadata), CreatedAt = audit.CreatedAt
        });

    private static readonly System.Linq.Expressions.Expression<Func<ProtectedTranslationTerm,
        ProtectedTranslationTermData>> ToDataProjection = x => new(x.ProtectedTranslationTermId, x.Term,
        x.LocaleCode, x.IsEnabled, x.MetadataJson, x.CreatedAt, x.UpdatedAt);
    private static ProtectedTranslationTermData ToData(ProtectedTranslationTerm x) =>
        new(x.ProtectedTranslationTermId, x.Term, x.LocaleCode, x.IsEnabled, x.MetadataJson, x.CreatedAt, x.UpdatedAt);
}
