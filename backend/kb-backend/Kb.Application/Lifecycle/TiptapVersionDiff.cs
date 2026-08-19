using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Kb.Application.Lifecycle;

internal static partial class TiptapVersionDiff
{
    private sealed record ContentBlock(string Type, string Label, string Text, int Position);

    private static readonly IReadOnlyDictionary<string, string> BlockLabels =
        new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["paragraph"] = "Paragraph",
            ["heading"] = "Heading",
            ["listItem"] = "List item",
            ["taskItem"] = "Task item",
            ["blockquote"] = "Quote",
            ["codeBlock"] = "Code block",
            ["tableRow"] = "Table row",
            ["callout"] = "Callout",
            ["tabItem"] = "Tab",
            ["accordionItem"] = "Accordion section",
            ["details"] = "Details",
            ["image"] = "Image",
            ["inlineImage"] = "Image",
            ["video"] = "Video",
            ["attachment"] = "Attachment",
            ["horizontalRule"] = "Horizontal rule"
        };

    public static LifecycleVersionComparisonData Compare(
        LifecycleVersionSummaryData baseVersion,
        JsonElement baseContent,
        LifecycleVersionSummaryData targetVersion,
        JsonElement targetContent)
    {
        var before = ExtractBlocks(baseContent);
        var after = ExtractBlocks(targetContent);
        var matches = LongestCommonSubsequence(before, after);
        var changes = new List<VersionDiffEntryData>();
        var unchanged = matches.Count;
        var beforeStart = 0;
        var afterStart = 0;

        foreach (var match in matches.Append((before.Length, after.Length)))
        {
            AddChangedRun(
                before.Skip(beforeStart).Take(match.Item1 - beforeStart).ToArray(),
                after.Skip(afterStart).Take(match.Item2 - afterStart).ToArray(),
                changes);
            if (match.Item1 < before.Length && match.Item2 < after.Length)
            {
                var unchangedBlock = before[match.Item1];
                changes.Add(new(
                    "Unchanged",
                    unchangedBlock.Type,
                    unchangedBlock.Label,
                    unchangedBlock.Position,
                    after[match.Item2].Position,
                    unchangedBlock.Text,
                    after[match.Item2].Text,
                    [new("Unchanged", unchangedBlock.Text)]));
            }
            beforeStart = match.Item1 + 1;
            afterStart = match.Item2 + 1;
        }

        return new(
            baseVersion,
            targetVersion,
            changes,
            changes.Count(change => change.ChangeType == "Added"),
            changes.Count(change => change.ChangeType == "Removed"),
            changes.Count(change => change.ChangeType == "Changed"),
            unchanged);
    }

    public static string ToPlainText(JsonElement content) =>
        string.Join(Environment.NewLine + Environment.NewLine,
            ExtractBlocks(content).Select(block => block.Text).Where(text => text.Length > 0));

    private static void AddChangedRun(
        IReadOnlyList<ContentBlock> before,
        IReadOnlyList<ContentBlock> after,
        ICollection<VersionDiffEntryData> changes)
    {
        var paired = Math.Min(before.Count, after.Count);
        for (var index = 0; index < paired; index++)
        {
            var previous = before[index];
            var current = after[index];
            changes.Add(new(
                "Changed",
                current.Type,
                current.Label,
                previous.Position,
                current.Position,
                previous.Text,
                current.Text,
                WordDiff(previous.Text, current.Text)));
        }

        foreach (var previous in before.Skip(paired))
            changes.Add(new(
                "Removed",
                previous.Type,
                previous.Label,
                previous.Position,
                null,
                previous.Text,
                null,
                [new("Removed", previous.Text)]));

        foreach (var current in after.Skip(paired))
            changes.Add(new(
                "Added",
                current.Type,
                current.Label,
                null,
                current.Position,
                null,
                current.Text,
                [new("Added", current.Text)]));
    }

    private static IReadOnlyList<(int, int)> LongestCommonSubsequence(
        IReadOnlyList<ContentBlock> before,
        IReadOnlyList<ContentBlock> after)
    {
        var lengths = new int[before.Count + 1, after.Count + 1];
        for (var left = before.Count - 1; left >= 0; left--)
        for (var right = after.Count - 1; right >= 0; right--)
            lengths[left, right] = Equivalent(before[left], after[right])
                ? lengths[left + 1, right + 1] + 1
                : Math.Max(lengths[left + 1, right], lengths[left, right + 1]);

        var matches = new List<(int, int)>();
        var i = 0;
        var j = 0;
        while (i < before.Count && j < after.Count)
        {
            if (Equivalent(before[i], after[j]))
            {
                matches.Add((i, j));
                i++;
                j++;
            }
            else if (lengths[i + 1, j] >= lengths[i, j + 1])
                i++;
            else
                j++;
        }
        return matches;
    }

    private static IReadOnlyList<VersionDiffSegmentData> WordDiff(string before, string after)
    {
        var left = Tokenize(before);
        var right = Tokenize(after);
        var lengths = new int[left.Length + 1, right.Length + 1];
        for (var i = left.Length - 1; i >= 0; i--)
        for (var j = right.Length - 1; j >= 0; j--)
            lengths[i, j] = string.Equals(left[i], right[j], StringComparison.Ordinal)
                ? lengths[i + 1, j + 1] + 1
                : Math.Max(lengths[i + 1, j], lengths[i, j + 1]);

        var raw = new List<VersionDiffSegmentData>();
        var leftIndex = 0;
        var rightIndex = 0;
        while (leftIndex < left.Length || rightIndex < right.Length)
        {
            if (leftIndex < left.Length && rightIndex < right.Length &&
                string.Equals(left[leftIndex], right[rightIndex], StringComparison.Ordinal))
            {
                raw.Add(new("Unchanged", left[leftIndex]));
                leftIndex++;
                rightIndex++;
            }
            else if (rightIndex < right.Length &&
                     (leftIndex == left.Length ||
                      lengths[leftIndex, rightIndex + 1] > lengths[leftIndex + 1, rightIndex]))
                raw.Add(new("Added", right[rightIndex++]));
            else
                raw.Add(new("Removed", left[leftIndex++]));
        }

        var merged = new List<VersionDiffSegmentData>();
        foreach (var segment in raw)
        {
            if (merged.Count > 0 && merged[^1].ChangeType == segment.ChangeType)
                merged[^1] = merged[^1] with { Text = merged[^1].Text + segment.Text };
            else
                merged.Add(segment);
        }
        return merged;
    }

    private static ContentBlock[] ExtractBlocks(JsonElement root)
    {
        var blocks = new List<ContentBlock>();
        Visit(root);
        return blocks.ToArray();

        void Visit(JsonElement node)
        {
            if (node.ValueKind != JsonValueKind.Object)
                return;

            var type = node.TryGetProperty("type", out var typeValue) &&
                       typeValue.ValueKind == JsonValueKind.String
                ? typeValue.GetString() ?? "content"
                : "content";
            if (BlockLabels.TryGetValue(type, out var label))
            {
                var text = NormalizeWhitespace(ReadBlockText(node, type));
                if (text.Length > 0)
                    blocks.Add(new(type, BlockLabel(node, type, label), text, blocks.Count + 1));
                return;
            }

            if (node.TryGetProperty("content", out var content) &&
                content.ValueKind == JsonValueKind.Array)
                foreach (var child in content.EnumerateArray())
                    Visit(child);
        }
    }

    private static string ReadBlockText(JsonElement node, string type)
    {
        if (type == "tableRow" && node.TryGetProperty("content", out var cells) &&
            cells.ValueKind == JsonValueKind.Array)
            return string.Join(" | ", cells.EnumerateArray()
                .Select(cell => NormalizeWhitespace(ReadBlockText(cell, "tableCell")))
                .Where(value => value.Length > 0));

        var text = new StringBuilder();
        AppendText(node, text);
        if (text.Length > 0)
            return text.ToString();

        if (type == "horizontalRule")
            return "Horizontal rule";
        if (!node.TryGetProperty("attrs", out var attributes) ||
            attributes.ValueKind != JsonValueKind.Object)
            return string.Empty;

        foreach (var name in new[] { "alt", "title", "fileName", "name", "src" })
            if (attributes.TryGetProperty(name, out var value) &&
                value.ValueKind == JsonValueKind.String &&
                !string.IsNullOrWhiteSpace(value.GetString()))
                return value.GetString()!;
        return type;
    }

    private static void AppendText(JsonElement node, StringBuilder output)
    {
        if (node.ValueKind != JsonValueKind.Object)
            return;
        if (node.TryGetProperty("type", out var type) && type.GetString() == "hardBreak")
        {
            output.AppendLine();
            return;
        }
        if (node.TryGetProperty("text", out var text) && text.ValueKind == JsonValueKind.String)
            output.Append(text.GetString());
        if (!node.TryGetProperty("content", out var content) || content.ValueKind != JsonValueKind.Array)
            return;
        foreach (var child in content.EnumerateArray())
        {
            var before = output.Length;
            AppendText(child, output);
            if (before != output.Length && child.TryGetProperty("type", out var childType) &&
                childType.GetString() is "paragraph" or "listItem" or "tableCell")
                output.Append(' ');
        }
    }

    private static string BlockLabel(JsonElement node, string type, string fallback)
    {
        if (!node.TryGetProperty("attrs", out var attrs) || attrs.ValueKind != JsonValueKind.Object)
            return fallback;
        if (type == "heading" && attrs.TryGetProperty("level", out var level) && level.TryGetInt32(out var value))
            return $"Heading {value}";
        if (type == "tabItem" && attrs.TryGetProperty("label", out var tabLabel) &&
            tabLabel.ValueKind == JsonValueKind.String &&
            !string.IsNullOrWhiteSpace(tabLabel.GetString()))
            return $"Tab: {tabLabel.GetString()}";
        if (type == "accordionItem" && attrs.TryGetProperty("title", out var title) &&
            title.ValueKind == JsonValueKind.String &&
            !string.IsNullOrWhiteSpace(title.GetString()))
            return $"Accordion: {title.GetString()}";
        if (type == "callout" && attrs.TryGetProperty("variant", out var variant) &&
            variant.ValueKind == JsonValueKind.String &&
            !string.IsNullOrWhiteSpace(variant.GetString()))
            return $"{variant.GetString()![..1].ToUpperInvariant()}{variant.GetString()![1..]} callout";
        return fallback;
    }

    private static bool Equivalent(ContentBlock left, ContentBlock right) =>
        left.Type == right.Type && left.Text == right.Text;

    private static string[] Tokenize(string value) =>
        TokenRegex().Matches(value).Select(match => match.Value).ToArray();

    private static string NormalizeWhitespace(string value) =>
        WhitespaceRegex().Replace(value, " ").Trim();

    [GeneratedRegex(@"\s+|[^\s]+", RegexOptions.CultureInvariant)]
    private static partial Regex TokenRegex();

    [GeneratedRegex(@"\s+", RegexOptions.CultureInvariant)]
    private static partial Regex WhitespaceRegex();
}
