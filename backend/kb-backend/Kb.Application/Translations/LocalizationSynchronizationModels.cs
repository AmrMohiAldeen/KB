namespace Kb.Application.Translations;

public static class LocalizationSyncScopes
{
    public const string MissingOnly = "MissingOnly";
    public const string UpdateExisting = "UpdateExisting";
}

public static class LocalizationSyncModes
{
    public const string CopySource = "CopySource";
    public const string AutomaticTranslation = "AutomaticTranslation";
}

public static class LocalizationSyncStates
{
    public const string Missing = "Missing";
    public const string Current = "Current";
    public const string OutOfDate = "OutOfDate";
}

public static class LocalizationSyncOperations
{
    public const string Skip = "Skip";
    public const string CreateCopy = "CreateCopy";
    public const string CreateAutomaticTranslation = "CreateAutomaticTranslation";
    public const string UpdateCopy = "UpdateCopy";
    public const string UpdateAutomaticTranslation = "UpdateAutomaticTranslation";
}

public sealed record LocalizationSyncRequestData(IReadOnlyList<string> TargetLocaleCodes, string Scope, string Mode);

public sealed record LocalizationSyncPreviewItemData(string TargetLocaleCode, Guid? TargetArticleId,
    string State, string Operation, bool MayReplaceManualDraftContent);

public sealed record LocalizationSyncPreviewData(Guid SourceArticleId, string SourceLocaleCode,
    Guid SourceVersionId, int SourceVersionNumber, string Scope, string Mode,
    IReadOnlyList<LocalizationSyncPreviewItemData> Items);

public sealed record LocalizationSyncOutcomeData(string TargetLocaleCode, Guid? TargetArticleId,
    string Operation, string Outcome, Guid? TargetDraftId, string? TranslationStatus, string? Error);

public sealed record LocalizationSyncResultData(Guid SourceArticleId, Guid SourceVersionId,
    int SourceVersionNumber, IReadOnlyList<LocalizationSyncOutcomeData> Outcomes);

public sealed record LocalizationSyncSourceSnapshot(Guid SourceArticleId, Guid TranslationGroupId,
    string SourceLocaleCode, string SourceTitle, string SourceSlug, string Visibility, Guid? CategoryId,
    IReadOnlyList<Guid> CategoryIds, Guid SourceVersionId, int SourceVersionNumber,
    string SourceContentJsonPath, DateTime SourceUpdatedAt);

public sealed record LocalizationSyncTargetSnapshot(string TargetLocaleCode, Guid? TargetArticleId,
    string State, Guid? TargetCurrentDraftId, byte[]? TargetDraftRowVersion);

public sealed record LocalizationSyncPlan(LocalizationSyncSourceSnapshot Source,
    IReadOnlyList<LocalizationSyncTargetSnapshot> Targets);

public sealed record LocalizationSyncCommit(LocalizationSyncSourceSnapshot Source, string TargetLocaleCode,
    Guid? TargetArticleId, Guid? ExpectedTargetDraftId, byte[]? ExpectedTargetDraftRowVersion,
    string Operation, string Title, string ContentJsonPath, string ContentHash, long ContentSizeBytes,
    IReadOnlyCollection<Guid> MediaIds, string TranslationMethod, string TranslationStatus,
    string? ProviderName, int TranslatedSegmentCount, Guid ActorId, DateTime SynchronizedAt);

public sealed record LocalizationSyncCommitResult(Guid TargetArticleId, Guid TargetDraftId,
    string TranslationStatus);

public interface ILocalizationSynchronizationRepository
{
    Task<LocalizationSyncPlan> GetPlanAsync(Guid sourceArticleId, IReadOnlyCollection<string> targetLocaleCodes,
        CancellationToken cancellationToken);
    Task<LocalizationSyncCommitResult> CommitAsync(LocalizationSyncCommit command,
        CancellationToken cancellationToken);
}
