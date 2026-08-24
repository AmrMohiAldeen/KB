using Kb.Application.Abstractions;
using Kb.Application.Abstractions.Storage;
using Kb.Application.Drafts;
using Kb.Application.Exceptions;
using Kb.Application.Translations;
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

    private static AutomaticArticleTranslationService Service(FakeAutomaticRepository repository,
        FakeStorage storage, ITranslationProvider provider) => new(repository, new FakeTerms(), provider, storage,
        new CurrentUser(), new AllowPermissions(), TimeProvider.System,
        Options.Create(new DraftContentOptions { ContainerName = "article-content", MaxContentSizeBytes = 1024 * 1024 }));

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
            throw new NotSupportedException();
        public Task DeleteAsync(string containerName, string objectName, CancellationToken cancellationToken)
        { DeletedPaths.Add(objectName); return Task.CompletedTask; }
    }

    private sealed class CurrentUser : ICurrentUser
    { public bool IsAuthenticated => true; public Guid UserId => ActorId; public string? Email => null; }
    private sealed class AllowPermissions : IPermissionChecker
    { public Task<bool> HasPermissionAsync(Guid userId, string permissionCode, CancellationToken cancellationToken) => Task.FromResult(true); }
}
