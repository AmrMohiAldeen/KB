using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Kb.Application.Exceptions;

namespace Kb.Application.Translations;

public sealed record TiptapTranslationResult(string Title, string ContentJson, int TranslatedSegmentCount);

public sealed class TiptapTranslationProcessor(ITranslationProvider provider)
{
    private static readonly IReadOnlySet<string> NonTranslatableNodeTypes = new HashSet<string>(
        ["code", "codeBlock", "code_block", "pre", "script", "style"], StringComparer.OrdinalIgnoreCase);

    private static readonly IReadOnlyDictionary<string, IReadOnlySet<string>> TranslatableAttributes =
        new Dictionary<string, IReadOnlySet<string>>(StringComparer.Ordinal)
        {
            ["tabItem"] = new HashSet<string>(["label"], StringComparer.Ordinal),
            ["accordionItem"] = new HashSet<string>(["title"], StringComparer.Ordinal),
            ["callout"] = new HashSet<string>(["title"], StringComparer.Ordinal),
            ["image"] = new HashSet<string>(["alt", "title"], StringComparer.Ordinal),
            ["inlineImage"] = new HashSet<string>(["alt", "title"], StringComparer.Ordinal),
            ["video"] = new HashSet<string>(["title"], StringComparer.Ordinal),
            ["documentEmbed"] = new HashSet<string>(["title"], StringComparer.Ordinal),
            ["externalEmbed"] = new HashSet<string>(["title"], StringComparer.Ordinal),
            ["youtube"] = new HashSet<string>(["title"], StringComparer.Ordinal),
            ["figure"] = new HashSet<string>(["caption"], StringComparer.Ordinal),
            ["table"] = new HashSet<string>(["caption"], StringComparer.Ordinal),
            ["glossary"] = new HashSet<string>(["term", "definition"], StringComparer.Ordinal)
        };

    private static readonly IReadOnlySet<string> AccessibilityAttributes = new HashSet<string>(
        ["aria-label", "ariaLabel", "accessibilityLabel"], StringComparer.Ordinal);

    public async Task<TiptapTranslationResult> TranslateAsync(string title, string contentJson,
        string sourceLocaleCode, string targetLocaleCode, IReadOnlyList<string> protectedTerms,
        CancellationToken cancellationToken)
    {
        JsonNode root;
        try { root = JsonNode.Parse(contentJson) ?? throw new JsonException("Document is empty."); }
        catch (JsonException exception)
        { throw new BusinessRuleException($"Source content is not valid Tiptap JSON: {exception.Message}"); }

        if (root is not JsonObject document || document["type"]?.GetValue<string>() != "doc")
            throw new BusinessRuleException("Source content must be a Tiptap JSON document with a 'doc' root.");

        var segments = new List<Segment> { Segment.Create(title, value => title = value) };
        Collect(document, false, segments);
        var translatable = segments.Where(x => !string.IsNullOrWhiteSpace(x.Value)).ToArray();
        if (translatable.Length == 0)
            return new(title, document.ToJsonString(), 0);

        var masks = translatable.Select(x => ProtectedTermMask.Create(x.Value, protectedTerms)).ToArray();
        IReadOnlyList<string> translated;
        try
        {
            translated = await provider.TranslateAsync(new(sourceLocaleCode, targetLocaleCode,
                masks.Select(x => x.MaskedText).ToArray()), cancellationToken);
        }
        catch (OperationCanceledException) { throw; }
        catch (ExternalServiceException) { throw; }
        catch (Exception exception)
        { throw new ExternalServiceException("The translation provider failed.", exception); }

        if (translated.Count != translatable.Length)
            throw new ExternalServiceException("The translation provider returned an incomplete batch.");

        var restored = new string[translatable.Length];
        for (var index = 0; index < translatable.Length; index++)
        {
            if (translated[index] is null)
                throw new ExternalServiceException("The translation provider returned a null text segment.");
            restored[index] = masks[index].Restore(translated[index]);
        }
        for (var index = 0; index < translatable.Length; index++)
            translatable[index].Set(restored[index]);

        return new(title, document.ToJsonString(new JsonSerializerOptions { WriteIndented = false }),
            translatable.Length);
    }

    private static void Collect(JsonObject node, bool insideCodeBlock, ICollection<Segment> segments)
    {
        var type = node["type"]?.GetValue<string>() ?? string.Empty;
        var skipChildren = insideCodeBlock || NonTranslatableNodeTypes.Contains(type);
        if (type == "text" && !skipChildren && !HasCodeMark(node) &&
            node["text"] is JsonValue textValue && textValue.TryGetValue<string>(out var text))
            segments.Add(Segment.Create(text, value => node["text"] = value));

        if (!skipChildren && node["attrs"] is JsonObject attributes)
        {
            var attributeNames = TranslatableAttributes.TryGetValue(type, out var configured)
                ? configured.Concat(AccessibilityAttributes)
                : AccessibilityAttributes;
            foreach (var name in attributeNames)
                if (attributes[name] is JsonValue value && value.TryGetValue<string>(out var attributeText) &&
                    !string.IsNullOrWhiteSpace(attributeText))
                    segments.Add(Segment.Create(attributeText, translated => attributes[name] = translated));
        }

        if (skipChildren || node["content"] is not JsonArray content) return;
        foreach (var child in content.OfType<JsonObject>()) Collect(child, false, segments);
    }

    private static bool HasCodeMark(JsonObject node) => node["marks"] is JsonArray marks &&
        marks.OfType<JsonObject>().Any(mark => mark["type"]?.GetValue<string>() == "code");

    private sealed record Segment(string Value, Action<string> Set)
    {
        public static Segment Create(string value, Action<string> set)
        {
            var first = 0;
            while (first < value.Length && char.IsWhiteSpace(value[first])) first++;
            var last = value.Length;
            while (last > first && char.IsWhiteSpace(value[last - 1])) last--;
            var leading = value[..first];
            var trailing = value[last..];
            return new(value[first..last], translated => set(leading + translated + trailing));
        }
    }

    private sealed class ProtectedTermMask
    {
        private readonly IReadOnlyDictionary<string, string> replacements;
        public string MaskedText { get; }

        private ProtectedTermMask(string maskedText, IReadOnlyDictionary<string, string> replacements)
        { MaskedText = maskedText; this.replacements = replacements; }

        public static ProtectedTermMask Create(string text, IReadOnlyList<string> terms)
        {
            var usable = terms.Where(x => !string.IsNullOrEmpty(x)).Distinct(StringComparer.Ordinal)
                .OrderByDescending(x => x.Length).ToArray();
            var patterns = usable.Select(Regex.Escape).Concat([TechnicalTokenPattern]);
            var regex = new Regex(string.Join('|', patterns),
                RegexOptions.CultureInvariant, TimeSpan.FromSeconds(1));
            var replacements = new Dictionary<string, string>(StringComparer.Ordinal);
            var sequence = 0;
            var masked = regex.Replace(text, match =>
            {
                var token = $"\uE100KBTERM{sequence++:X8}\uE101";
                replacements[token] = match.Value;
                return token;
            });
            return new(masked, replacements);
        }

        // Technical values can occur inside otherwise human-readable text. Mask them so the provider never
        // receives authority to rewrite routes, URLs, paths, filenames, MIME types, or environment variables.
        private const string TechnicalTokenPattern =
            @"(?:https?://|mailto:|tel:)[^\s<>\""']+|" +
            @"(?<![\p{L}\p{N}])(?:/[A-Za-z0-9._~%!$&'()*+,;=:@-]+)+(?:\?[A-Za-z0-9._~%!$&'()*+,;=:@/?-]*)?(?:#[A-Za-z0-9._~-]*)?|" +
            @"[A-Za-z]:\\(?:[^\\\s<>:\""|?*]+\\)*[^\\\s<>:\""|?*]*|" +
            @"\b[a-z][a-z0-9.+-]*/[a-z0-9][a-z0-9.+-]*\b|" +
            @"\$\{?[A-Z_][A-Z0-9_]*\}?|%[A-Z_][A-Z0-9_]*%|" +
            @"\b[A-Za-z0-9_-]+\.[A-Za-z0-9]{1,12}\b";

        public string Restore(string translated)
        {
            foreach (var (token, term) in replacements)
            {
                var first = translated.IndexOf(token, StringComparison.Ordinal);
                if (first < 0 || translated.IndexOf(token, first + token.Length, StringComparison.Ordinal) >= 0)
                    throw new ExternalServiceException(
                        "The translation provider changed a protected-term marker; no draft was updated.");
                translated = translated.Replace(token, term, StringComparison.Ordinal);
            }
            return translated;
        }
    }
}
