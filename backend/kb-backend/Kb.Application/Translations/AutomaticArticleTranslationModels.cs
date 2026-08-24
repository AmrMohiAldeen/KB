namespace Kb.Application.Translations;

public sealed record AutomaticTranslationSnapshot(
    Guid SourceArticleId, string SourceLocaleCode, string SourceTitle, DateTime SourceUpdatedAt,
    Guid? SourceVersionId, int? SourceVersionNumber, Guid? SourceDraftId, byte[]? SourceDraftRowVersion,
    string SourceContentJsonPath, Guid TargetArticleId, string TargetLocaleCode, Guid TargetDraftId,
    byte[] TargetDraftRowVersion, string TargetContentJsonPath, string? TargetRenderedHtmlPath,
    string? TargetPlainTextPath);

public sealed record AutomaticTranslationCommit(
    AutomaticTranslationSnapshot Snapshot, string TranslatedTitle, string ContentJsonPath, string ContentHash,
    long ContentSizeBytes, IReadOnlyCollection<Guid> MediaIds, string ProviderName, int SegmentCount,
    Guid ActorId, DateTime TranslatedAt);

public sealed record AutomaticTranslationCommitResult(Guid TargetArticleId, Guid TargetDraftId,
    string TargetLocaleCode, string TranslatedTitle, DateTime TranslatedAt);

public sealed record AutomaticArticleTranslationData(Guid SourceArticleId, Guid TargetArticleId,
    Guid TargetDraftId, string SourceLocaleCode, string TargetLocaleCode, string TranslatedTitle,
    int TranslatedSegmentCount, string TranslationMethod, string TranslationStatus, DateTime TranslatedAt);

public interface IAutomaticArticleTranslationRepository
{
    Task<AutomaticTranslationSnapshot> GetSnapshotAsync(Guid sourceArticleId, Guid targetArticleId,
        CancellationToken cancellationToken);
    Task<AutomaticTranslationCommitResult> CommitAsync(AutomaticTranslationCommit command,
        CancellationToken cancellationToken);
}
