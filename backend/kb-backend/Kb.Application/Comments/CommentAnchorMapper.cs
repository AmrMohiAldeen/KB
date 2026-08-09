using System.Text;
using System.Text.Json;
using Kb.Domain.Constants;

namespace Kb.Application.Comments;

public static class CommentAnchorMapper
{
    public static CommentAnchorUpdate Remap(
        CommentAnchorSource source,
        Guid draftId,
        JsonElement newDocument)
    {
        using var anchorDocument = JsonDocument.Parse(source.AnchorDataJson);
        var anchor = anchorDocument.RootElement;

        return source.AnchorType switch
        {
            "TextRange" => RemapTextRange(source, draftId, anchor, newDocument),
            "Block" => RemapBlock(source, draftId, anchor, newDocument),
            _ => Detached(source)
        };
    }

    private static CommentAnchorUpdate RemapTextRange(
        CommentAnchorSource source,
        Guid draftId,
        JsonElement anchor,
        JsonElement document)
    {
        if (!TryString(anchor, "selectedText", out var quote) || string.IsNullOrEmpty(quote))
            return Detached(source);

        var mapped = FlattenDocument(document);
        var matches = FindAll(mapped.Text, quote);
        if (matches.Count == 0)
            return Detached(source);

        var contextual = matches.Where(index => ContextMatches(anchor, mapped.Text, index, quote.Length)).ToArray();
        var hasContext = HasNonEmptyString(anchor, "prefix") || HasNonEmptyString(anchor, "suffix");
        if (hasContext && contextual.Length == 0)
            return Detached(source);
        var safeMatches = hasContext ? contextual : matches.ToArray();
        if (safeMatches.Length != 1)
            return Detached(source);

        var startIndex = safeMatches[0];
        var endIndex = startIndex + quote.Length - 1;
        if (startIndex >= mapped.Positions.Count || endIndex >= mapped.Positions.Count ||
            mapped.Positions[startIndex] is null || mapped.Positions[endIndex] is null)
            return Detached(source);

        var updated = Merge(anchor, new Dictionary<string, object?>
        {
            ["from"] = mapped.Positions[startIndex]!.Value,
            ["to"] = mapped.Positions[endIndex]!.Value + 1
        });
        return Changed(source, draftId, source.AnchorType, updated, CommentAnchorStatuses.Attached);
    }

    private static CommentAnchorUpdate RemapBlock(
        CommentAnchorSource source,
        Guid draftId,
        JsonElement anchor,
        JsonElement document)
    {
        var blocks = ReadBlocks(document);
        var matches = Array.Empty<Block>();
        if (TryString(anchor, "blockId", out var blockId) && !string.IsNullOrWhiteSpace(blockId))
            matches = blocks.Where(block => string.Equals(block.Id, blockId, StringComparison.Ordinal)).ToArray();

        if (matches.Length == 0 && TryString(anchor, "text", out var text))
        {
            var type = TryString(anchor, "nodeType", out var nodeType) ? nodeType : null;
            matches = blocks.Where(block =>
                string.Equals(block.Text, text, StringComparison.Ordinal) &&
                (type is null || string.Equals(block.Type, type, StringComparison.Ordinal))).ToArray();
        }

        if (matches.Length == 0)
            return Detached(source);
        if (matches.Length != 1)
            return Detached(source);

        var updated = Merge(anchor, new Dictionary<string, object?> { ["position"] = matches[0].Position });
        return Changed(source, draftId, source.AnchorType, updated, CommentAnchorStatuses.Attached);
    }

    private static CommentAnchorUpdate Changed(
        CommentAnchorSource source,
        Guid? draftId,
        string? anchorType,
        string? anchorDataJson,
        string status) =>
        new(source.CommentId, draftId, anchorType, anchorDataJson, status, source.AnchorStatus);

    private static CommentAnchorUpdate Detached(CommentAnchorSource source) =>
        Changed(source, null, null, null, CommentAnchorStatuses.Attached);

    private static bool ContextMatches(JsonElement anchor, string text, int index, int length)
    {
        var prefixMatches = !TryString(anchor, "prefix", out var prefix) || string.IsNullOrEmpty(prefix) ||
                            text[..index].EndsWith(prefix, StringComparison.Ordinal);
        var suffixStart = index + length;
        var suffixMatches = !TryString(anchor, "suffix", out var suffix) || string.IsNullOrEmpty(suffix) ||
                            text[suffixStart..].StartsWith(suffix, StringComparison.Ordinal);
        return prefixMatches && suffixMatches;
    }

    private static bool HasNonEmptyString(JsonElement value, string property) =>
        TryString(value, property, out var result) && !string.IsNullOrEmpty(result);

    private static List<int> FindAll(string text, string value)
    {
        var matches = new List<int>();
        var offset = 0;
        while (offset <= text.Length - value.Length)
        {
            var index = text.IndexOf(value, offset, StringComparison.Ordinal);
            if (index < 0) break;
            matches.Add(index);
            offset = index + 1;
        }
        return matches;
    }

    private static FlattenedDocument FlattenDocument(JsonElement document)
    {
        var text = new StringBuilder();
        var positions = new List<int?>();
        var position = 0;
        if (document.TryGetProperty("content", out var content) && content.ValueKind == JsonValueKind.Array)
        {
            var first = true;
            foreach (var child in content.EnumerateArray())
            {
                if (!first)
                {
                    text.Append('\n');
                    positions.Add(null);
                }
                FlattenNode(child, position, text, positions);
                position += NodeSize(child);
                first = false;
            }
        }
        return new(text.ToString(), positions);
    }

    private static void FlattenNode(JsonElement node, int start, StringBuilder text, List<int?> positions)
    {
        var type = node.TryGetProperty("type", out var typeValue) ? typeValue.GetString() : null;
        if (type == "text")
        {
            var value = node.TryGetProperty("text", out var textValue) ? textValue.GetString() ?? "" : "";
            for (var index = 0; index < value.Length; index++)
            {
                text.Append(value[index]);
                positions.Add(start + index);
            }
            return;
        }
        if (type == "hardBreak")
        {
            text.Append('\n');
            positions.Add(start);
            return;
        }
        if (!node.TryGetProperty("content", out var content) || content.ValueKind != JsonValueKind.Array) return;
        var childStart = start + 1;
        foreach (var child in content.EnumerateArray())
        {
            FlattenNode(child, childStart, text, positions);
            childStart += NodeSize(child);
        }
    }

    private static IReadOnlyList<Block> ReadBlocks(JsonElement document)
    {
        var result = new List<Block>();
        var position = 0;
        if (!document.TryGetProperty("content", out var content) || content.ValueKind != JsonValueKind.Array)
            return result;
        foreach (var node in content.EnumerateArray())
        {
            var type = node.TryGetProperty("type", out var typeValue) ? typeValue.GetString() ?? "unknown" : "unknown";
            string? id = null;
            if (node.TryGetProperty("attrs", out var attrs) && attrs.ValueKind == JsonValueKind.Object &&
                attrs.TryGetProperty("id", out var idValue) && idValue.ValueKind == JsonValueKind.String)
                id = idValue.GetString();
            result.Add(new(position, type, id, NodeText(node)));
            position += NodeSize(node);
        }
        return result;
    }

    private static int NodeSize(JsonElement node)
    {
        if (node.TryGetProperty("type", out var type) && type.GetString() == "text")
            return node.TryGetProperty("text", out var value) ? value.GetString()?.Length ?? 0 : 0;
        if (!node.TryGetProperty("content", out var content) || content.ValueKind != JsonValueKind.Array)
            return 1;
        return 2 + content.EnumerateArray().Sum(NodeSize);
    }

    private static string NodeText(JsonElement node)
    {
        var value = new StringBuilder();
        Visit(node);
        return value.ToString();

        void Visit(JsonElement current)
        {
            if (current.TryGetProperty("type", out var type) && type.GetString() == "text" &&
                current.TryGetProperty("text", out var text))
                value.Append(text.GetString());
            if (current.TryGetProperty("content", out var content) && content.ValueKind == JsonValueKind.Array)
                foreach (var child in content.EnumerateArray()) Visit(child);
        }
    }

    private static bool TryString(JsonElement value, string property, out string result)
    {
        result = "";
        return value.ValueKind == JsonValueKind.Object &&
               value.TryGetProperty(property, out var item) &&
               item.ValueKind == JsonValueKind.String &&
               (result = item.GetString() ?? "") is not null;
    }

    private static string Merge(JsonElement source, IReadOnlyDictionary<string, object?> changes)
    {
        var values = new Dictionary<string, object?>(StringComparer.Ordinal);
        foreach (var property in source.EnumerateObject())
            values[property.Name] = JsonSerializer.Deserialize<object?>(property.Value.GetRawText());
        foreach (var change in changes) values[change.Key] = change.Value;
        return JsonSerializer.Serialize(values);
    }

    private sealed record FlattenedDocument(string Text, IReadOnlyList<int?> Positions);
    private sealed record Block(int Position, string Type, string? Id, string Text);
}
