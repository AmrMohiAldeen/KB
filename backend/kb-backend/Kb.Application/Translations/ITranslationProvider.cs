namespace Kb.Application.Translations;

public sealed record TranslationProviderRequest(string SourceLocaleCode, string TargetLocaleCode,
    IReadOnlyList<string> Texts);

public interface ITranslationProvider
{
    string Name { get; }
    Task<IReadOnlyList<string>> TranslateAsync(TranslationProviderRequest request,
        CancellationToken cancellationToken);
}
