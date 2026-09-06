using Kb.Domain.Constants;

namespace Kb.Application.Migrations.HelpJuice;

/// <summary>
/// Converts only explicit HelpJuice language and translation identifiers into migration targets.
/// Numeric language IDs without a languages.csv mapping are deliberately retained as private-use
/// locale codes so content is not flattened into the destination default language.
/// </summary>
public sealed record HelpJuiceLocalizationDiagnostic(string EntityType, string ExternalId, int RowNumber,
    string Code, string Message);

public sealed record HelpJuiceLocalizationPlan(
    IReadOnlyDictionary<string, string> ArticleLocales,
    IReadOnlyDictionary<string, Guid?> ArticleGroups,
    IReadOnlyDictionary<string, string> CategoryLocales,
    IReadOnlyDictionary<string, string> CanonicalCategoryIds,
    IReadOnlyList<HelpJuiceLocalizationDiagnostic> Diagnostics)
{
    public static HelpJuiceLocalizationPlan Build(HelpJuiceSource source)
    {
        var diagnostics = new List<HelpJuiceLocalizationDiagnostic>();
        var localeMap = source.LocaleByLanguageId ?? new Dictionary<int, string>();
        string Locale(int? languageId, string entityType, string externalId, int row)
        {
            if (languageId is null) return KbLocales.DefaultLocaleCode;
            if (localeMap.TryGetValue(languageId.Value, out var locale)) return locale;
            diagnostics.Add(new(entityType, externalId, row, "LANGUAGE_ID_UNMAPPED",
                $"HelpJuice language ID '{languageId}' has no exported locale mapping. The article was retained as '{PrivateLocale(languageId.Value)}' and was not guessed."));
            return PrivateLocale(languageId.Value);
        }

        var articleLocales = source.Questions.ToDictionary(question => question.Id,
            question => Locale(question.LanguageId, "Question", question.Id, question.RowNumber), StringComparer.OrdinalIgnoreCase);
        var categoryLocales = source.Categories.ToDictionary(category => category.Id,
            category => Locale(category.LanguageId, "Category", category.Id, category.RowNumber), StringComparer.OrdinalIgnoreCase);
        var articleGroups = ResolveArticleGroups(source.Questions, articleLocales, diagnostics);
        var canonicalCategories = ResolveCanonicalCategories(source.Categories, categoryLocales, diagnostics);
        return new(articleLocales, articleGroups, categoryLocales, canonicalCategories, diagnostics);
    }

    private static Dictionary<string, Guid?> ResolveArticleGroups(IReadOnlyList<HelpJuiceQuestion> questions,
        IReadOnlyDictionary<string, string> locales, ICollection<HelpJuiceLocalizationDiagnostic> diagnostics)
    {
        var result = questions.ToDictionary(question => question.Id, _ => (Guid?)null, StringComparer.OrdinalIgnoreCase);
        foreach (var group in questions.GroupBy(question => question.TranslationId ?? question.Id, StringComparer.OrdinalIgnoreCase))
        {
            var members = group.ToArray();
            if (members.Length == 1)
            {
                var member = members[0];
                if (!string.IsNullOrWhiteSpace(member.TranslationId))
                    diagnostics.Add(new("Question", member.Id, member.RowNumber, "TRANSLATION_RELATIONSHIP_UNRESOLVED",
                        $"HelpJuice translation_id '{member.TranslationId}' does not identify another exported article; the localized article was imported unlinked."));
                continue;
            }
            if (members.Select(member => locales[member.Id]).Distinct(StringComparer.OrdinalIgnoreCase).Count() != members.Length)
            {
                foreach (var member in members)
                    diagnostics.Add(new("Question", member.Id, member.RowNumber, "TRANSLATION_RELATIONSHIP_AMBIGUOUS",
                        "The translation relationship contains more than one article for the same locale, so no TranslationGroupID was assigned."));
                continue;
            }
            var stableKey = string.Join('|', members.Select(member => member.Id).OrderBy(id => id, StringComparer.OrdinalIgnoreCase));
            var groupId = HelpJuiceSourceParser.StableGuid($"helpjuice:translation-group:{stableKey}");
            foreach (var member in members) result[member.Id] = groupId;
        }
        return result;
    }

    private static Dictionary<string, string> ResolveCanonicalCategories(IReadOnlyList<HelpJuiceCategory> categories,
        IReadOnlyDictionary<string, string> locales, ICollection<HelpJuiceLocalizationDiagnostic> diagnostics)
    {
        var result = categories.ToDictionary(category => category.Id, category => category.Id, StringComparer.OrdinalIgnoreCase);
        foreach (var group in categories.GroupBy(category => category.TranslationId ?? category.Id, StringComparer.OrdinalIgnoreCase))
        {
            var members = group.ToArray();
            if (members.Length == 1) continue;
            if (members.Select(member => locales[member.Id]).Distinct(StringComparer.OrdinalIgnoreCase).Count() != members.Length)
            {
                foreach (var member in members)
                    diagnostics.Add(new("Category", member.Id, member.RowNumber, "CATEGORY_TRANSLATION_AMBIGUOUS",
                        "The category translation relationship contains more than one category for the same locale, so destinations remain separate."));
                continue;
            }
            var canonical = members.Select(member => member.Id).OrderBy(id => id, StringComparer.OrdinalIgnoreCase).First();
            foreach (var member in members) result[member.Id] = canonical;
        }
        return result;
    }

    private static string PrivateLocale(int languageId) => $"und-x-hj-{languageId}";
}
