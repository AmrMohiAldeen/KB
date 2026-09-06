using Kb.Application.Abstractions;
using Kb.Application.Abstractions.Storage;
using Kb.Application.Drafts;
using Kb.Application.Exceptions;
using Kb.Application.Translations;
using Kb.Domain.Constants;
using Microsoft.Extensions.Options;

namespace Kb.Tests.Translations;

public sealed class AutomaticArticleTranslationServiceTests
{
    private static readonly Guid ActorId = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static readonly Guid SourceId = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    private static readonly Guid TargetId = Guid.Parse("cccccccc-cccc-cccc-cccc-cccccccccccc");
    private static readonly Guid DraftId = Guid.Parse("dddddddd-dddd-dddd-dddd-dddddddddddd");

    [Fact]
    public async Task Incomplete_provider_result_does_not_stage_or_commit_target_draft()
    {
        var repository = new FakeAutomaticRepository(Snapshot());
        var storage = new FakeStorage();
        var service = Service(repository, storage, new FakeProvider(_ => Array.Empty<string>()));

        await Assert.ThrowsAsync<ExternalServiceException>(() =>
            service.TranslateAsync(SourceId, TargetId, CancellationToken.None));

        Assert.Equal(0, repository.CommitCount);
        Assert.Equal(0, storage.UploadCount);
        Assert.Empty(storage.DeletedPaths);
    }

    [Fact]
    public async Task Concurrency_failure_after_staging_deletes_new_blob_and_preserves_old_blob()
    {
        var repository = new FakeAutomaticRepository(Snapshot()) { FailCommit = true };
        var storage = new FakeStorage();
        var service = Service(repository, storage, new FakeProvider(texts => texts.ToArray()));

        await Assert.ThrowsAsync<ConcurrencyConflictException>(() =>
            service.TranslateAsync(SourceId, TargetId, CancellationToken.None));

        Assert.Equal(1, repository.CommitCount);
        Assert.Equal(1, storage.UploadCount);
        Assert.Single(storage.DeletedPaths);
        Assert.NotEqual("old-target.json", storage.DeletedPaths[0]);
    }

    [Fact]
    public async Task Synchronization_preview_reports_state_operation_and_manual_replacement_warning()
    {
        var repository = new FakeSyncRepository(SyncPlan([
            new("fr", null, LocalizationSyncStates.Missing, null, null),
            new("ar", TargetId, LocalizationSyncStates.OutOfDate, DraftId, [1, 2, 3]),
            new("de", Guid.NewGuid(), LocalizationSyncStates.Current, Guid.NewGuid(), [4, 5, 6])
        ]));
        var service = SyncService(repository, new FakeStorage(), new FakeProvider(texts => texts.ToArray()));

        var missing = await service.PreviewAsync(SourceId,
            new(["fr", "ar", "de"], LocalizationSyncScopes.MissingOnly,
                LocalizationSyncModes.AutomaticTranslation), default);
        Assert.Equal(LocalizationSyncOperations.CreateAutomaticTranslation, missing.Items[0].Operation);
        Assert.Equal(LocalizationSyncOperations.Skip, missing.Items[1].Operation);
        Assert.False(missing.Items[0].MayReplaceManualDraftContent);

        var updates = await service.PreviewAsync(SourceId,
            new(["fr", "ar", "de"], LocalizationSyncScopes.UpdateExisting,
                LocalizationSyncModes.AutomaticTranslation), default);
        Assert.Equal(LocalizationSyncOperations.UpdateAutomaticTranslation, updates.Items[1].Operation);
        Assert.True(updates.Items[1].MayReplaceManualDraftContent);
        Assert.Equal(LocalizationSyncOperations.UpdateAutomaticTranslation, updates.Items[2].Operation);
        Assert.True(updates.Items[2].MayReplaceManualDraftContent);
    }

    [Fact]
    public async Task Bulk_synchronization_reports_each_outcome_and_stages_full_automatic_translation()
    {
        var otherTarget = Guid.NewGuid();
        var repository = new FakeSyncRepository(SyncPlan([
            new("fr", TargetId, LocalizationSyncStates.OutOfDate, DraftId, [1, 2, 3]),
            new("de", otherTarget, LocalizationSyncStates.OutOfDate, Guid.NewGuid(), [4, 5, 6])
        ]));
        repository.FailingLocales.Add("fr");
        var storage = new FakeStorage();
        var service = SyncService(repository, storage, new FakeProvider(texts =>
            texts.Select(text => $"translated:{text}").ToArray()));

        var result = await service.SynchronizeAsync(SourceId,
            new(["fr", "de"], LocalizationSyncScopes.UpdateExisting,
                LocalizationSyncModes.AutomaticTranslation), default);

        Assert.Equal(["Failed", "Succeeded"], result.Outcomes.Select(x => x.Outcome));
        Assert.Equal(2, repository.Commits.Count);
        Assert.All(repository.Commits, commit =>
        {
            Assert.Equal(ArticleTranslationStatuses.NeedsVerification, commit.TranslationStatus);
            Assert.Equal(ArticleTranslationMethods.Automatic, commit.TranslationMethod);
            Assert.Equal(7, commit.Source.SourceVersionNumber);
        });
        Assert.Equal(2, storage.UploadCount);
        Assert.Single(storage.DeletedPaths);
    }

    private static AutomaticArticleTranslationService Service(FakeAutomaticRepository repository,
        FakeStorage storage, ITranslationProvider provider) => new(repository, new FakeTerms(), provider, storage,
        new CurrentUser(), new AllowPermissions(), TimeProvider.System,
        Options.Create(new DraftContentOptions { ContainerName = "article-content", MaxContentSizeBytes = 1024 * 1024 }));

    private static LocalizationSynchronizationService SyncService(FakeSyncRepository repository,
        FakeStorage storage, ITranslationProvider provider) => new(repository, new FakeTerms(), provider, storage,
        new CurrentUser(), new AllowPermissions(), TimeProvider.System,
        Options.Create(new DraftContentOptions { ContainerName = "article-content", MaxContentSizeBytes = 1024 * 1024 }));

    private static LocalizationSyncPlan SyncPlan(IReadOnlyList<LocalizationSyncTargetSnapshot> targets) => new(
        new(SourceId, Guid.NewGuid(), "en", "GamaLearn guide", "guide", "Public", Guid.NewGuid(), [],
            Guid.NewGuid(), 7, "source.json", new DateTime(2026, 8, 25, 12, 0, 0, DateTimeKind.Utc)), targets);

    private static AutomaticTranslationSnapshot Snapshot() => new(SourceId, "en", "GamaLearn guide",
        new DateTime(2026, 8, 24, 12, 0, 0, DateTimeKind.Utc), Guid.NewGuid(), 3, null, null, string.Empty,
        TargetId, "fr", DraftId, [1, 2, 3], "old-target.json", "old-target.html", "old-target.txt");

    private sealed class FakeProvider(Func<IReadOnlyList<string>, IReadOnlyList<string>> translate)
        : ITranslationProvider
    {
        public string Name => "Fake";
        public Task<IReadOnlyList<string>> TranslateAsync(TranslationProviderRequest request,
            CancellationToken cancellationToken) => Task.FromResult(translate(request.Texts));
    }

    private sealed class FakeAutomaticRepository(AutomaticTranslationSnapshot snapshot)
        : IAutomaticArticleTranslationRepository
    {
        public int CommitCount { get; private set; }
        public bool FailCommit { get; init; }
        public Task<AutomaticTranslationSnapshot> GetSnapshotAsync(Guid sourceArticleId, Guid targetArticleId,
            CancellationToken cancellationToken) => Task.FromResult(snapshot);
        public Task<AutomaticTranslationCommitResult> CommitAsync(AutomaticTranslationCommit command,
            CancellationToken cancellationToken)
        {
            CommitCount++;
            if (FailCommit) throw new ConcurrencyConflictException();
            return Task.FromResult(new AutomaticTranslationCommitResult(TargetId, DraftId, "fr",
                command.TranslatedTitle, command.TranslatedAt));
        }
    }

    private sealed class FakeSyncRepository(LocalizationSyncPlan plan) : ILocalizationSynchronizationRepository
    {
        public List<LocalizationSyncCommit> Commits { get; } = [];
        public HashSet<string> FailingLocales { get; } = new(StringComparer.OrdinalIgnoreCase);
        public Task<LocalizationSyncPlan> GetPlanAsync(Guid sourceArticleId,
            IReadOnlyCollection<string> targetLocaleCodes, CancellationToken cancellationToken) =>
            Task.FromResult(plan);
        public Task<LocalizationSyncCommitResult> CommitAsync(LocalizationSyncCommit command,
            CancellationToken cancellationToken)
        {
            Commits.Add(command);
            if (FailingLocales.Contains(command.TargetLocaleCode)) throw new ConcurrencyConflictException("changed");
            return Task.FromResult(new LocalizationSyncCommitResult(command.TargetArticleId ?? Guid.NewGuid(),
                Guid.NewGuid(), command.TranslationStatus));
        }
    }

    private sealed class FakeTerms : IProtectedTranslationTermRepository
    {
        public Task<IReadOnlyList<string>> GetEnabledAsync(string targetLocaleCode, CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyList<string>>(["GamaLearn"]);
        public Task<IReadOnlyList<ProtectedTranslationTermData>> GetAllAsync(CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<ProtectedTranslationTermData> CreateAsync(ProtectedTranslationTermMutation value, ProtectedTranslationTermAuditData audit, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<ProtectedTranslationTermData> UpdateAsync(Guid id, ProtectedTranslationTermMutation value, ProtectedTranslationTermAuditData audit, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task DeleteAsync(Guid id, ProtectedTranslationTermAuditData audit, CancellationToken cancellationToken) => throw new NotSupportedException();
    }

    private sealed class FakeStorage : IObjectStorage
    {
        public int UploadCount { get; private set; }
        public List<string> DeletedPaths { get; } = [];
        public Task<string> UploadAsync(string containerName, string objectName, Stream content, string contentType,
            CancellationToken cancellationToken) { UploadCount++; return Task.FromResult(objectName); }
        public Task<Stream> DownloadAsync(string containerName, string objectName, CancellationToken cancellationToken) =>
            Task.FromResult<Stream>(new MemoryStream(System.Text.Encoding.UTF8.GetBytes(
                """{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Complete source article"}]}]}""")));
        public Task DeleteAsync(string containerName, string objectName, CancellationToken cancellationToken)
        { DeletedPaths.Add(objectName); return Task.CompletedTask; }
    }

    private sealed class CurrentUser : ICurrentUser
    { public bool IsAuthenticated => true; public Guid UserId => ActorId; public string? Email => null; }
    private sealed class AllowPermissions : IPermissionChecker
    { public Task<bool> HasPermissionAsync(Guid userId, string permissionCode, CancellationToken cancellationToken) => Task.FromResult(true); }
}
