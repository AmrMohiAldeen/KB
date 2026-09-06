using Kb.Application.Abstractions;
using Kb.Application.Exceptions;
using Kb.Domain.Constants;

namespace Kb.Application.Translations;

public sealed class ArticleTranslationService(IArticleTranslationRepository repository, ICurrentUser currentUser,
    IPermissionChecker permissions, ISlugGenerator slugGenerator, TimeProvider timeProvider)
{
    public async Task<IReadOnlyList<ArticleTranslationData>> GetAllAsync(Guid articleId, CancellationToken ct) { await RequireAsync(ct); Id(articleId); return await repository.GetAllAsync(articleId, ct); }
    public async Task<ArticleTranslationData> CreateAsync(Guid sourceId, NewArticleTranslationData request, CancellationToken ct) { await RequireAsync(ct); Id(sourceId); Id(request.CategoryId); var title = Required(request.Title, "Title", 300); return await repository.CreateAsync(sourceId, new(Locale(request.LocaleCode), title, request.CategoryId, request.CategoryIds, Slug(request.Slug ?? title), Visibility(request.Visibility), request.AssignedTranslatorUserId), Audit(), ct); }
    public async Task UnlinkAsync(Guid articleId, CancellationToken ct) { await RequireAsync(ct); Id(articleId); await repository.UnlinkAsync(articleId, Audit(), ct); }
    public async Task<ArticleTranslationData> AssignAsync(Guid articleId, Guid? translatorId, CancellationToken ct) { await RequireAsync(ct); Id(articleId); if (translatorId == Guid.Empty) throw new BusinessRuleException("Translator is invalid."); return await repository.AssignAsync(articleId, translatorId, Audit(), ct); }
    public async Task<ArticleTranslationData> VerifyAsync(Guid articleId, CancellationToken ct) { await RequireAsync(ct); Id(articleId); return await repository.VerifyAsync(articleId, Audit(), ct); }
    private async Task RequireAsync(CancellationToken ct) { if (!currentUser.IsAuthenticated) throw new UnauthorizedAccessException(); if (!await permissions.HasPermissionAsync(currentUser.UserId, PermissionCodes.ArticlesTranslate, ct)) throw new ForbiddenException("You do not have permission to manage article translations."); }
    private TranslationAuditData Audit() => new(currentUser.UserId, timeProvider.GetUtcNow().UtcDateTime);
    private static void Id(Guid id) { if (id == Guid.Empty) throw new BusinessRuleException("Article and category IDs are required."); }
    private static string Locale(string? value) { var x = Required(value, "Locale code", 35).Replace('_', '-'); if (!System.Text.RegularExpressions.Regex.IsMatch(x, "^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$")) throw new BusinessRuleException("Locale code must be valid."); return x; }
    private static string Visibility(string? x) => x?.Trim() is "Public" or "Internal" ? x.Trim() : throw new BusinessRuleException("Visibility must be Public or Internal.");
    private string Slug(string value) { var slug = slugGenerator.Generate(Required(value, "Slug", 350)); if (slug.Length == 0) throw new BusinessRuleException("Slug must contain a supported letter or number."); return slug[..Math.Min(350, slug.Length)].Trim('-'); }
    private static string Required(string? x, string name, int max) { if (string.IsNullOrWhiteSpace(x)) throw new BusinessRuleException($"{name} is required."); x = x.Trim(); return x.Length > max ? throw new BusinessRuleException($"{name} is too long.") : x; }
}
