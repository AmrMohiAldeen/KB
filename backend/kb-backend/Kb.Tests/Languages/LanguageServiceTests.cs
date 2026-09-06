using Kb.Application.Abstractions;
using Kb.Application.Languages;
using Kb.Domain.Constants;

namespace Kb.Tests.Languages;

public sealed class LanguageServiceTests
{
    [Fact]
    public async Task Translation_editor_can_read_enabled_target_languages_without_language_management_permission()
    {
        var repository = new LanguageRepositoryStub([
            Language("en", enabled: true), Language("fr", enabled: true), Language("de", enabled: false)
        ]);
        var service = new LanguageService(repository, new CurrentUser(), new PermissionStub(PermissionCodes.ArticlesTranslate), TimeProvider.System);

        var result = await service.GetEnabledForTranslationAsync(CancellationToken.None);

        Assert.Equal(["en", "fr"], result.Select(language => language.LocaleCode));
        Assert.True(repository.EnabledReadRequested);
        Assert.False(repository.AllReadRequested);
    }

    private static LanguageData Language(string localeCode, bool enabled) => new(Guid.NewGuid(), localeCode, localeCode,
        localeCode, localeCode == "en", enabled, false, 0, DateTime.UtcNow, DateTime.UtcNow);

    private sealed class CurrentUser : ICurrentUser
    {
        public bool IsAuthenticated => true;
        public Guid UserId => Guid.Parse("1d3f5428-3b0e-48f4-bdc2-d9838ee88e92");
        public string? Email => "editor@example.test";
    }

    private sealed class PermissionStub(string permitted) : IPermissionChecker
    {
        public Task<bool> HasPermissionAsync(Guid userId, string permissionCode, CancellationToken cancellationToken) =>
            Task.FromResult(permissionCode == permitted);
    }

    private sealed class LanguageRepositoryStub(IReadOnlyList<LanguageData> languages) : ILanguageRepository
    {
        public bool AllReadRequested { get; private set; }
        public bool EnabledReadRequested { get; private set; }

        public Task<IReadOnlyList<LanguageData>> GetAllAsync(CancellationToken cancellationToken)
        {
            AllReadRequested = true;
            return Task.FromResult(languages);
        }

        public Task<IReadOnlyList<LanguageData>> GetEnabledAsync(CancellationToken cancellationToken)
        {
            EnabledReadRequested = true;
            return Task.FromResult<IReadOnlyList<LanguageData>>(languages.Where(language => language.IsEnabled).ToArray());
        }

        public Task<LanguageData> CreateAsync(NewLanguageData language, LanguageAuditData audit, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<LanguageData> UpdateAsync(Guid id, UpdateLanguageData language, LanguageAuditData audit, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<LanguageData> SetEnabledAsync(Guid id, bool enabled, LanguageAuditData audit, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<LanguageData> SetDefaultAsync(Guid id, LanguageAuditData audit, CancellationToken cancellationToken) => throw new NotSupportedException();
    }
}
