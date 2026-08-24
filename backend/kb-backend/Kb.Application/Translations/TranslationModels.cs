namespace Kb.Application.Translations;

public sealed record ArticleTranslationData(Guid ArticleId, Guid TranslationGroupId, string LocaleCode, string Title,
    string Slug, string WorkflowStatus, string TranslationStatus, string TranslationMethod, Guid? SourceArticleId,
    Guid? SourceVersionId, int? SourceVersionNumber, Guid? AssignedTranslatorUserId, DateTime? LastTranslatedAt,
    DateTime? VerifiedAt, Guid? VerifiedByUserId);
public sealed record NewArticleTranslationData(string LocaleCode, string Title, Guid CategoryId, IReadOnlyList<Guid>? CategoryIds,
    string? Slug, string Visibility, Guid? AssignedTranslatorUserId);
public sealed record TranslationAuditData(Guid ActorId, DateTime CreatedAt);
public interface IArticleTranslationRepository
{
    Task<IReadOnlyList<ArticleTranslationData>> GetAllAsync(Guid articleId, CancellationToken ct);
    Task<ArticleTranslationData> CreateAsync(Guid sourceArticleId, NewArticleTranslationData request, TranslationAuditData audit, CancellationToken ct);
    Task<ArticleTranslationData> LinkAsync(Guid sourceArticleId, Guid targetArticleId, TranslationAuditData audit, CancellationToken ct);
    Task UnlinkAsync(Guid articleId, TranslationAuditData audit, CancellationToken ct);
    Task<ArticleTranslationData> AssignAsync(Guid articleId, Guid? translatorId, TranslationAuditData audit, CancellationToken ct);
    Task<ArticleTranslationData> VerifyAsync(Guid articleId, TranslationAuditData audit, CancellationToken ct);
}
