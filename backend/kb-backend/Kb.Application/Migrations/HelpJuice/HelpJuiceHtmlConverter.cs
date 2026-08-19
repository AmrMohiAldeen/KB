using System.Net;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace Kb.Application.Migrations.HelpJuice;

public static partial class HelpJuiceHtmlConverter
{
    private static readonly HashSet<string> Supported = new(StringComparer.OrdinalIgnoreCase)
    {
        "p", "br", "h1", "h2", "h3", "h4", "h5", "h6", "strong", "b", "em", "i", "u", "a",
        "ul", "ol", "li", "blockquote", "pre", "code", "table", "thead", "tbody", "tfoot", "colgroup", "col", "tr", "th", "td",
        "img", "figure", "figcaption", "div", "span", "article", "section", "details", "summary", "hr", "iframe", "video", "source",
        "button", "input",
        "s", "strike", "del", "sup", "sub", "font", "o:p", "o:lock", "v:stroke", "v:path", "v:f",
        "v:formulas", "v:imagedata", "v:shape", "v:shapetype", "w:wrap"
    };
    private static readonly HashSet<string> DropWithContent = new(StringComparer.OrdinalIgnoreCase)
        { "script", "style", "object", "embed", "form", "noscript", "template", "svg", "math" };
    private static readonly HashSet<string> VoidTags = new(StringComparer.OrdinalIgnoreCase)
        { "br", "img", "hr", "source", "meta", "link", "input", "col", "o:lock", "v:stroke", "v:path", "v:f", "v:imagedata", "w:wrap" };
    private static readonly HashSet<string> IgnoredMetadata = new(StringComparer.OrdinalIgnoreCase)
        { "meta", "link" };

    public static HelpJuiceHtmlConversion Convert(string? sourceHtml,
        Func<string, (Guid MediaId, string Url)?>? resolveMedia = null,
        Func<string, HelpJuiceLinkResolution?>? resolveLink = null)
    {
        var warnings = new List<(string, string)>();
        var mediaSources = new List<string>();
        var root = new Node("doc");
        var stack = new Stack<Node>(); stack.Push(root);
        var marks = new Stack<ActiveMark>();
        var droppedDepth = 0;
        var ignoredControlDepth = 0;

        foreach (Match token in TokenRegex().Matches(sourceHtml ?? string.Empty))
        {
            if (token.Value.StartsWith("<!--", StringComparison.Ordinal) || token.Value.StartsWith("<!", StringComparison.Ordinal))
                continue;
            if (!token.Value.StartsWith('<'))
            {
                if (droppedDepth == 0) AddText(stack.Peek(), WebUtility.HtmlDecode(token.Value),
                    EffectiveMarks(marks));
                continue;
            }
            var parsed = ParseTag(token.Value);
            if (parsed is null) continue;
            var (name, closing, attrs, selfClosing) = parsed.Value;
            if (ignoredControlDepth > 0)
            {
                if (closing) ignoredControlDepth--;
                else if (!selfClosing && !VoidTags.Contains(name)) ignoredControlDepth++;
                continue;
            }
            if (!closing && IsHelpJuiceControl(attrs))
            {
                if (!selfClosing && !VoidTags.Contains(name)) ignoredControlDepth = 1;
                continue;
            }
            if (DropWithContent.Contains(name))
            {
                if (!closing) { droppedDepth++; Warn("UNSAFE_ELEMENT_REMOVED", $"The unsafe <{name}> element was removed."); }
                else if (droppedDepth > 0) droppedDepth--;
                continue;
            }
            if (droppedDepth > 0) continue;
            if (closing)
            {
                if (!Supported.Contains(name)) continue;
                CloseMarks(name, marks);
                if (name is "strong" or "b" or "em" or "i" or "u" or "a" or "code" or "s" or "strike" or "del" or "sup" or "sub" or "font")
                {
                    continue;
                }
                while (stack.Count > 1)
                {
                    var popped = stack.Pop();
                    if (popped.SourceTag.Equals(name, StringComparison.OrdinalIgnoreCase)) break;
                }
                continue;
            }
            if (IgnoredMetadata.Contains(name)) continue;
            if (!Supported.Contains(name))
            {
                Warn("UNSUPPORTED_ELEMENT", $"Unsupported <{name}> markup was flattened while preserving readable text.");
                continue;
            }
            if (name == "font")
            {
                marks.Push(new(name, LegacyFontMark(attrs, Warn)));
                continue;
            }
            if (!selfClosing && !VoidTags.Contains(name) && TextStyleMark(attrs, Warn) is { } styleMark)
                marks.Push(new(name, styleMark));
            if (name is "strong" or "b") { marks.Push(new(name, new("bold"))); continue; }
            if (name is "em" or "i") { marks.Push(new(name, new("italic"))); continue; }
            if (name == "u") { marks.Push(new(name, new("underline"))); continue; }
            if (name is "s" or "strike" or "del") { marks.Push(new(name, new("strike"))); continue; }
            if (name == "sup") { marks.Push(new(name, new("superscript"))); continue; }
            if (name == "sub") { marks.Push(new(name, new("subscript"))); continue; }
            if (name == "code" && stack.Peek().Type != "codeBlock") { marks.Push(new(name, new("code"))); continue; }
            if (name == "a")
            {
                var href = attrs.GetValueOrDefault("href");
                var rewritten = href is null ? null : resolveLink?.Invoke(href);
                if (rewritten?.WarningCode is not null)
                    Warn(rewritten.WarningCode, rewritten.WarningMessage ?? "A HelpJuice link could not be rewritten safely.");
                if (TrySafeUrl(rewritten?.Url ?? href, allowRelative: true, out var safe))
                    marks.Push(new(name, new("link", new() { ["href"] = safe, ["target"] = "_blank", ["rel"] = "noopener noreferrer nofollow" })));
                else
                {
                    marks.Push(new(name, new("invalidLink")));
                    if (!string.IsNullOrWhiteSpace(href))
                        Warn("DANGEROUS_URL_REMOVED", "A link with an unsafe URL was converted to text.");
                }
                continue;
            }
            if (name == "br") { stack.Peek().Children.Add(new("hardBreak")); continue; }
            if (name == "hr") { stack.Peek().Children.Add(new("horizontalRule")); continue; }
            if (name == "input")
            {
                AddLegacyInputText(stack.Peek(), attrs, EffectiveMarks(marks));
                continue;
            }
            if (name is "img" or "v:imagedata")
            {
                var src = attrs.GetValueOrDefault("src") ?? attrs.GetValueOrDefault("data-src") ??
                    attrs.GetValueOrDefault("data-mce-src") ?? attrs.GetValueOrDefault("o:href") ?? attrs.GetValueOrDefault("href");
                if (string.IsNullOrWhiteSpace(src))
                { AddImagePlaceholder(stack.Peek(), attrs, "An image without a source could not be recovered."); continue; }
                mediaSources.Add(src);
                var mapped = resolveMedia?.Invoke(src);
                if (mapped is null && src.StartsWith("data:", StringComparison.OrdinalIgnoreCase))
                { AddImagePlaceholder(stack.Peek(), attrs, "An embedded image could not be decoded."); Warn("INVALID_INLINE_MEDIA", "An embedded Base64 image could not be decoded and was replaced with a text placeholder."); continue; }
                if (mapped is null && src.StartsWith("blob:", StringComparison.OrdinalIgnoreCase))
                { AddImagePlaceholder(stack.Peek(), attrs, "Temporary image unavailable after migration."); Warn("UNRESOLVED_TEMPORARY_MEDIA", "A temporary browser image URL cannot be recovered and was replaced with a text placeholder."); continue; }
                if (mapped is null && !TrySafeUrl(src, allowRelative: true, out _))
                { Warn("DANGEROUS_URL_REMOVED", "An image with an unsafe URL was omitted."); continue; }
                var image = new Node("image") { Attributes = new()
                {
                    ["src"] = mapped?.Url ?? src,
                    ["alt"] = attrs.GetValueOrDefault("alt"),
                    ["title"] = attrs.GetValueOrDefault("title"),
                    ["mediaId"] = mapped?.MediaId.ToString()
                }};
                stack.Peek().Children.Add(image);
                if (mapped is null) Warn("UNRESOLVED_MEDIA", $"Media source '{Limit(src)}' was retained for review.");
                continue;
            }
            if (name is "iframe" or "video" or "source")
            {
                var src = attrs.GetValueOrDefault("src") ?? attrs.GetValueOrDefault("data-src") ??
                    attrs.GetValueOrDefault("data-lazy-src") ?? attrs.GetValueOrDefault("data-original") ??
                    attrs.GetValueOrDefault("data-url") ?? attrs.GetValueOrDefault("href");
                if (src?.StartsWith("//", StringComparison.Ordinal) == true) src = "https:" + src;
                if (name is "video" or "source" && !string.IsNullOrWhiteSpace(src)) mediaSources.Add(src);
                if (name is "video" or "source" && !string.IsNullOrWhiteSpace(src) && resolveMedia?.Invoke(src) is { } videoMedia)
                {
                    stack.Peek().Children.Add(new("video") { Attributes = new() { ["src"] = videoMedia.Url, ["mediaId"] = videoMedia.MediaId.ToString(), ["title"] = attrs.GetValueOrDefault("title") } });
                }
                else if (TryYoutubeUrl(src, out var youtube))
                {
                    stack.Peek().Children.Add(new("youtube") { Attributes = new() { ["src"] = youtube } });
                }
                else if (TrySafeUrl(src, false, out var safe))
                {
                    var paragraph = new Node("paragraph");
                    paragraph.Children.Add(new("text") { Text = safe, Marks = [new("link", new() { ["href"] = safe })] });
                    stack.Peek().Children.Add(paragraph);
                    Warn("EMBED_CONVERTED_TO_LINK", "A supported video/embed URL was converted to a safe link.");
                }
                else Warn("UNSAFE_EMBED_REMOVED", "An unsafe or unsupported embed was removed.");
                continue;
            }

            if (name == "col")
            {
                CaptureColumnWidth(stack, attrs, Warn);
                continue;
            }
            var node = CreateNode(name, attrs, stack, Warn);
            if (node is null) continue;
            stack.Peek().Children.Add(node);
            if (!selfClosing && !VoidTags.Contains(name)) stack.Push(node);
        }
        while (stack.Count > 1) stack.Pop();
        var accordionId = 0;
        var tabId = 0;
        Normalize(root, ref accordionId, ref tabId);
        NormalizeTableWidths(root, Warn);
        var json = root.ToJson().ToJsonString(new JsonSerializerOptions { Encoder = JavaScriptEncoder.Default });
        return new(json, Render(root), PlainText(root), warnings.Distinct().ToArray(), mediaSources.Distinct().ToArray());

        void Warn(string code, string message) => warnings.Add((code, message));
    }

    private static Node? CreateNode(string tag, Dictionary<string, string> attrs, Stack<Node> stack,
        Action<string, string> warning)
    {
        var classes = Classes(attrs);
        if (classes.Contains("helpjuice-callout") || classes.Contains("callout") || attrs.ContainsKey("data-kb-callout"))
            return new("callout", tag) { Attributes = new() { ["variant"] = CalloutVariant(classes, attrs) } };
        if (classes.Contains("helpjuice-callout-body")) return new("fragment", tag);

        if (classes.Contains("helpjuice-accordion-title") ||
            classes.Contains("panel-title") && stack.Any(node => node.Type == "legacyAccordionItem") || tag == "summary")
            return new("legacyStructuredTitle", tag);
        if (classes.Contains("helpjuice-accordion-body") ||
            classes.Contains("panel-content") && stack.Any(node => node.Type == "legacyAccordionItem"))
            return new("legacyStructuredBody", tag);
        if (classes.Contains("helpjuice-accordion") || classes.Contains("f-accordion-panel") || tag == "details")
            return new("legacyAccordionItem", tag)
            {
                Attributes = new() { ["open"] = attrs.ContainsKey("open") }
            };

        if (classes.Contains("helpjuice-tab-title") || classes.Contains("f-tab-title"))
            return new("legacyStructuredTitle", tag);
        if (classes.Contains("helpjuice-tab-body") || classes.Contains("f-tab-content"))
            return new("legacyStructuredBody", tag);
        if (classes.Contains("panel-title") && stack.Any(node => node.Type == "legacyTabItem"))
            return new("legacyStructuredTitle", tag);
        if (classes.Contains("panel-content") && stack.Any(node => node.Type == "legacyTabItem"))
            return new("legacyStructuredBody", tag);
        if (classes.Contains("helpjuice-tab") || classes.Contains("f-tab-panel") || classes.Contains("f-tabs-panel"))
            return new("legacyTabItem", tag);

        return tag.ToLowerInvariant() switch
        {
            "p" => WithDirection(new("paragraph", tag), attrs),
            "h1" or "h2" or "h3" or "h4" or "h5" or "h6" => WithDirection(new("heading", tag) { Attributes = new() { ["level"] = int.Parse(tag[1..]) } }, attrs),
            "ul" => WithDirection(new("bulletList", tag), attrs),
            "ol" => WithDirection(new("orderedList", tag) { Attributes = new() { ["start"] = ParsePositive(attrs.GetValueOrDefault("start"), 1) } }, attrs),
            "li" => WithDirection(new("listItem", tag), attrs),
            "blockquote" => WithDirection(new("blockquote", tag), attrs),
            "pre" => new("codeBlock", tag),
            "table" => WithDirection(new("table", tag) { Attributes = TableAttrs(attrs, warning) }, attrs),
            "tr" => new("tableRow", tag),
            "th" => WithDirection(new("tableHeader", tag) { Attributes = CellAttrs(attrs, warning) }, attrs),
            "td" => WithDirection(new("tableCell", tag) { Attributes = CellAttrs(attrs, warning) }, attrs),
            "div" or "span" or "button" or "figure" or "figcaption" or "thead" or "tbody" or "tfoot" or "colgroup" or "col" or "article" or "section" or
                "o:p" or "o:lock" or "v:stroke" or "v:path" or "v:f" or "v:formulas" or "v:shape" or "v:shapetype" or "w:wrap" => new("fragment", tag),
            _ => null
        };
    }

    private static Mark LegacyFontMark(IReadOnlyDictionary<string, string> attrs,
        Action<string, string> warning)
    {
        var values = new Dictionary<string, object?>();
        var face = attrs.GetValueOrDefault("face")?.Trim();
        if (!string.IsNullOrWhiteSpace(face) && face.Length <= 160 && face.All(ch => !char.IsControl(ch) && ch is not ';' and not '<' and not '>'))
            values["fontFamily"] = face;
        var color = ParseStyle(attrs.GetValueOrDefault("style")).GetValueOrDefault("color") ??
                    FirstAttribute(attrs, "color", "data-color", "data-text-color", "data-font-color");
        if (!string.IsNullOrWhiteSpace(color))
        {
            if (TryNormalizeCssColor(color, out var safeColor)) values["color"] = safeColor;
            else warning("UNSUPPORTED_TEXT_COLOR", $"Unsupported Helpjuice text color '{Limit(color)}' was omitted.");
        }
        if (int.TryParse(attrs.GetValueOrDefault("size"), out var size) && size is >= 1 and <= 7)
            values["fontSize"] = new[] { "10px", "13px", "16px", "18px", "24px", "32px", "48px" }[size - 1];
        return values.Count == 0 ? new("passthrough") : new("textStyle", values);
    }

    private static Mark? TextStyleMark(IReadOnlyDictionary<string, string> attrs,
        Action<string, string> warning)
    {
        var values = new Dictionary<string, object?>();
        var styles = ParseStyle(attrs.GetValueOrDefault("style"));
        var color = styles.GetValueOrDefault("color") ??
            FirstAttribute(attrs, "color", "data-color", "data-text-color", "data-font-color");
        if (!string.IsNullOrWhiteSpace(color))
        {
            if (TryNormalizeCssColor(color, out var safeColor)) values["color"] = safeColor;
            else warning("UNSUPPORTED_TEXT_COLOR", $"Unsupported Helpjuice text color '{Limit(color)}' was omitted.");
        }
        return values.Count == 0 ? null : new("textStyle", values);
    }

    private static Dictionary<string, object?> TableAttrs(Dictionary<string, string> attrs,
        Action<string, string> warning)
    {
        var result = new Dictionary<string, object?>();
        var rawWidth = ParseStyle(attrs.GetValueOrDefault("style")).GetValueOrDefault("width") ??
                       attrs.GetValueOrDefault("width");
        if (string.IsNullOrWhiteSpace(rawWidth)) return result;
        if (TryCssLength(rawWidth, out var value, out var unit))
        {
            if (unit == "%" && value is >= 10 and <= 100) result["tableWidthPct"] = value;
            else if (unit == "px" && value is >= 25 and <= 4000) result["tableWidthPx"] = (int)Math.Round(value);
            else warning("UNSUPPORTED_TABLE_WIDTH", $"Table width '{Limit(rawWidth)}' is outside supported migration limits.");
        }
        else warning("UNSUPPORTED_TABLE_WIDTH", $"Unsupported table width '{Limit(rawWidth)}' was omitted.");
        return result;
    }

    private static Dictionary<string, object?> CellAttrs(Dictionary<string, string> attrs,
        Action<string, string> warning)
    {
        var result = new Dictionary<string, object?>
        {
            ["colspan"] = ParsePositive(attrs.GetValueOrDefault("colspan"), 1),
            ["rowspan"] = ParsePositive(attrs.GetValueOrDefault("rowspan"), 1)
        };
        var rawWidth = ParseStyle(attrs.GetValueOrDefault("style")).GetValueOrDefault("width") ??
                       attrs.GetValueOrDefault("width");
        if (!string.IsNullOrWhiteSpace(rawWidth))
        {
            if (TryCssLength(rawWidth, out _, out _)) result["_sourceWidth"] = rawWidth.Trim();
            else warning("UNSUPPORTED_TABLE_COLUMN_WIDTH",
                $"Unsupported table cell width '{Limit(rawWidth)}' was omitted.");
        }
        return result;
    }
    private static Node WithDirection(Node node, IReadOnlyDictionary<string, string> attrs)
    {
        var direction = attrs.GetValueOrDefault("dir")?.ToLowerInvariant();
        if (direction is "rtl" or "ltr") (node.Attributes ??= [])["dir"] = direction;
        return node;
    }
    private static int ParsePositive(string? value, int fallback) => int.TryParse(value, out var number) && number > 0 ? Math.Min(number, 100) : fallback;

    private static HashSet<string> Classes(IReadOnlyDictionary<string, string> attrs) =>
        (attrs.GetValueOrDefault("class") ?? string.Empty)
        .Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
        .ToHashSet(StringComparer.OrdinalIgnoreCase);

    private static bool IsHelpJuiceControl(IReadOnlyDictionary<string, string> attrs)
    {
        var classes = Classes(attrs);
        return classes.Overlaps(["helpjuice-callout-delete", "helpjuice-accordion-delete",
            "helpjuice-accordion-toggle", "helpjuice-tab-delete", "helpjuice-tab-toggle"]);
    }

    private static string CalloutVariant(IReadOnlySet<string> classes,
        IReadOnlyDictionary<string, string> attrs)
    {
        var explicitVariant = attrs.GetValueOrDefault("data-kb-callout-variant")?.ToLowerInvariant();
        if (explicitVariant is "info" or "warning" or "success" or "danger" or "tip") return explicitVariant;
        if (classes.Contains("warning")) return "warning";
        if (classes.Contains("callout-warning")) return "warning";
        if (classes.Contains("success") || classes.Contains("callout-success")) return "success";
        if (classes.Contains("danger") || classes.Contains("error") || classes.Contains("callout-danger") || classes.Contains("callout-error")) return "danger";
        if (classes.Contains("tip") || classes.Contains("callout-tip")) return "tip";
        return "info";
    }

    private static void CaptureColumnWidth(Stack<Node> stack,
        IReadOnlyDictionary<string, string> attrs, Action<string, string> warning)
    {
        var table = stack.FirstOrDefault(node => node.Type == "table");
        if (table is null) return;
        var width = ParseStyle(attrs.GetValueOrDefault("style")).GetValueOrDefault("width") ??
                    attrs.GetValueOrDefault("width");
        if (string.IsNullOrWhiteSpace(width)) return;
        if (!TryCssLength(width, out _, out _))
        {
            warning("UNSUPPORTED_TABLE_COLUMN_WIDTH",
                $"Unsupported <col> width '{Limit(width)}' was omitted.");
            return;
        }
        var span = ParsePositive(attrs.GetValueOrDefault("span"), 1);
        for (var index = 0; index < span; index++) table.TransientColumnWidths.Add(width.Trim());
    }

    private static void NormalizeTableWidths(Node root, Action<string, string> warning)
    {
        Visit(root);
        return;

        void Visit(Node node)
        {
            if (node.Type == "table") NormalizeTable(node, warning);
            foreach (var child in node.Children) Visit(child);
        }
    }

    private static void NormalizeTable(Node table, Action<string, string> warning)
    {
        var rows = table.Children.Where(child => child.Type == "tableRow").ToArray();
        if (rows.Length == 0) return;
        var columnCount = rows.Max(row => row.Children
            .Where(IsTableCell).Sum(cell => AttributeInt(cell, "colspan", 1)));
        if (columnCount <= 0) return;

        var tablePixelWidth = AttributeInt(table, "tableWidthPx", 0);
        var percentageBase = tablePixelWidth > 0 ? tablePixelWidth : 1000;
        var widths = new int?[columnCount];
        for (var index = 0; index < Math.Min(columnCount, table.TransientColumnWidths.Count); index++)
            widths[index] = ResolveColumnPixels(table.TransientColumnWidths[index], percentageBase, warning);

        ForEachCell(rows, (cell, column, colspan) =>
        {
            if (cell.Attributes?.GetValueOrDefault("_sourceWidth") is not string sourceWidth) return;
            var pixels = ResolveColumnPixels(sourceWidth, percentageBase, warning);
            if (pixels is null) return;
            var perColumn = Math.Max(25, (int)Math.Round(pixels.Value / (double)colspan));
            for (var offset = 0; offset < colspan && column + offset < widths.Length; offset++)
                widths[column + offset] ??= perColumn;
        });

        var hasExplicitWidth = widths.Any(width => width is not null);
        if (hasExplicitWidth)
        {
            var fallback = Math.Max(25, percentageBase / columnCount);
            for (var index = 0; index < widths.Length; index++) widths[index] ??= fallback;
            ForEachCell(rows, (cell, column, colspan) =>
            {
                var cellWidths = widths.Skip(column).Take(colspan).Select(value => value!.Value).ToArray();
                if (cellWidths.Length == colspan) (cell.Attributes ??= [])["colwidth"] = cellWidths;
            });
        }

        foreach (var cell in rows.SelectMany(row => row.Children).Where(IsTableCell))
            cell.Attributes?.Remove("_sourceWidth");
        table.TransientColumnWidths.Clear();
    }

    private static void ForEachCell(IEnumerable<Node> rows, Action<Node, int, int> action)
    {
        var occupied = new List<int>();
        foreach (var row in rows)
        {
            for (var index = 0; index < occupied.Count; index++) occupied[index] = Math.Max(0, occupied[index] - 1);
            var column = 0;
            foreach (var cell in row.Children.Where(IsTableCell))
            {
                while (column < occupied.Count && occupied[column] > 0) column++;
                var colspan = AttributeInt(cell, "colspan", 1);
                var rowspan = AttributeInt(cell, "rowspan", 1);
                action(cell, column, colspan);
                while (occupied.Count < column + colspan) occupied.Add(0);
                if (rowspan > 1)
                    for (var offset = 0; offset < colspan; offset++)
                        occupied[column + offset] = Math.Max(occupied[column + offset], rowspan);
                column += colspan;
            }
        }
    }

    private static bool IsTableCell(Node node) => node.Type is "tableCell" or "tableHeader";

    private static int AttributeInt(Node node, string name, int fallback) =>
        node.Attributes?.GetValueOrDefault(name) switch
        {
            int value => value,
            long value when value is >= int.MinValue and <= int.MaxValue => (int)value,
            _ => fallback
        };

    private static int? ResolveColumnPixels(string value, int percentageBase,
        Action<string, string> warning)
    {
        if (!TryCssLength(value, out var amount, out var unit)) return null;
        var pixels = unit == "%" ? percentageBase * amount / 100d : amount;
        if (pixels is < 25 or > 2000)
        {
            warning("UNSUPPORTED_TABLE_COLUMN_WIDTH",
                $"Table column width '{Limit(value)}' is outside supported migration limits.");
            return null;
        }
        return (int)Math.Round(pixels);
    }

    private static IReadOnlyList<Mark> EffectiveMarks(IEnumerable<ActiveMark> activeMarks)
    {
        var result = new List<Mark>();
        var textStyle = new Dictionary<string, object?>();
        foreach (var active in activeMarks.Reverse())
        {
            var mark = active.Mark;
            if (mark.Type == "textStyle")
            {
                foreach (var attribute in mark.Attrs ?? []) textStyle[attribute.Key] = attribute.Value;
                continue;
            }
            if (mark.Type is "passthrough" or "invalidLink") continue;
            var existing = result.FindIndex(item => item.Type == mark.Type);
            if (existing >= 0) result[existing] = mark;
            else result.Add(mark);
        }
        if (textStyle.Count > 0) result.Add(new("textStyle", textStyle));
        return result;
    }

    private static void CloseMarks(string tag, Stack<ActiveMark> marks)
    {
        if (!marks.Any(mark => mark.SourceTag.Equals(tag, StringComparison.OrdinalIgnoreCase))) return;
        while (marks.Count > 0)
        {
            var matched = marks.Pop().SourceTag.Equals(tag, StringComparison.OrdinalIgnoreCase);
            if (!matched) continue;
            while (marks.Count > 0 && marks.Peek().SourceTag.Equals(tag, StringComparison.OrdinalIgnoreCase)) marks.Pop();
            return;
        }
    }

    private static Dictionary<string, string> ParseStyle(string? style)
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var declaration in (style ?? string.Empty).Split(';', StringSplitOptions.RemoveEmptyEntries))
        {
            var separator = declaration.IndexOf(':');
            if (separator <= 0) continue;
            var property = declaration[..separator].Trim();
            var value = declaration[(separator + 1)..].Trim();
            if (property.Length > 0 && value.Length > 0) result[property] = value;
        }
        return result;
    }

    private static string? FirstAttribute(IReadOnlyDictionary<string, string> attrs,
        params string[] names) => names.Select(name => attrs.GetValueOrDefault(name))
        .FirstOrDefault(value => !string.IsNullOrWhiteSpace(value))?.Trim();

    private static bool TryCssLength(string value, out double amount, out string unit)
    {
        amount = 0;
        unit = string.Empty;
        var normalized = Regex.Replace(value.Trim(), @"\s*!important\s*$", string.Empty,
            RegexOptions.IgnoreCase).Trim();
        var match = CssLengthRegex().Match(normalized);
        if (!match.Success || !double.TryParse(match.Groups[1].Value,
                System.Globalization.NumberStyles.AllowDecimalPoint,
                System.Globalization.CultureInfo.InvariantCulture, out amount) || !double.IsFinite(amount)) return false;
        unit = match.Groups[2].Success ? match.Groups[2].Value.ToLowerInvariant() : "px";
        return amount > 0;
    }

    private static bool TryNormalizeCssColor(string value, out string safe)
    {
        safe = Regex.Replace(value.Trim(), @"\s*!important\s*$", string.Empty,
            RegexOptions.IgnoreCase).Trim();
        if (HexColorRegex().IsMatch(safe)) return true;
        if (CssNamedColors.Contains(safe))
        {
            safe = safe.ToLowerInvariant();
            return true;
        }
        var match = RgbColorRegex().Match(safe);
        if (!match.Success) return false;
        var parts = match.Groups[3].Value.Split(',', StringSplitOptions.TrimEntries);
        var alpha = match.Groups[2].Success;
        if (parts.Length != (alpha ? 4 : 3)) return false;
        for (var index = 0; index < 3; index++)
        {
            var component = parts[index];
            var percentage = component.EndsWith('%');
            var numberText = percentage ? component[..^1] : component;
            if (!double.TryParse(numberText, System.Globalization.NumberStyles.AllowDecimalPoint,
                    System.Globalization.CultureInfo.InvariantCulture, out var number) ||
                number < 0 || number > (percentage ? 100 : 255)) return false;
        }
        if (alpha)
        {
            var component = parts[3];
            var percentage = component.EndsWith('%');
            var numberText = percentage ? component[..^1] : component;
            if (!double.TryParse(numberText, System.Globalization.NumberStyles.AllowDecimalPoint,
                    System.Globalization.CultureInfo.InvariantCulture, out var number) ||
                number < 0 || number > (percentage ? 100 : 1)) return false;
        }
        safe = safe.ToLowerInvariant();
        return true;
    }

    private static readonly HashSet<string> CssNamedColors = new(
        ("aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood " +
         "cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray " +
         "darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen " +
         "darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue " +
         "firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew " +
         "hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan " +
         "lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray " +
         "lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid " +
         "mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream " +
         "mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise " +
         "palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown " +
         "salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan " +
         "teal thistle tomato transparent turquoise violet wheat white whitesmoke yellow yellowgreen")
        .Split(' ', StringSplitOptions.RemoveEmptyEntries), StringComparer.OrdinalIgnoreCase);

    private static void AddText(Node parent, string value, IReadOnlyList<Mark> marks)
    {
        if (string.IsNullOrEmpty(value)) return;
        var normalized = parent.Type is "codeBlock" ? value : WhitespaceRegex().Replace(value, " ");
        if (normalized.Length == 0) return;
        parent.Children.Add(new("text") { Text = normalized, Marks = marks.Where(mark => mark.Type is not ("invalidLink" or "passthrough")).ToList() });
    }

    private static void AddLegacyInputText(Node parent, IReadOnlyDictionary<string, string> attrs,
        IReadOnlyList<Mark> marks)
    {
        var type = attrs.GetValueOrDefault("type")?.Trim().ToLowerInvariant();
        var label = attrs.GetValueOrDefault("aria-label") ?? attrs.GetValueOrDefault("title") ??
            attrs.GetValueOrDefault("value") ?? attrs.GetValueOrDefault("placeholder");
        var text = type is "checkbox" or "radio"
            ? $"[{(attrs.ContainsKey("checked") ? "x" : " ")}]"
            : string.IsNullOrWhiteSpace(label) ? "[Input]" : $"[{label.Trim()}]";
        AddText(parent, text, marks);
    }

    private static void Normalize(Node node, ref int accordionId, ref int tabId)
    {
        foreach (var child in node.Children.ToArray()) Normalize(child, ref accordionId, ref tabId);
        if (node.Type is "legacyAccordionItem" or "legacyTabItem")
        {
            var titleNode = node.Children.FirstOrDefault(child => child.Type == "legacyStructuredTitle");
            var bodyNode = node.Children.FirstOrDefault(child => child.Type == "legacyStructuredBody");
            var title = NodeText(titleNode).Trim();
            if (title.Length == 0) title = node.Type == "legacyTabItem" ? "Tab" : "Section";
            var content = bodyNode?.Children.ToArray() ?? node.Children
                .Where(child => child != titleNode && child != bodyNode).ToArray();
            node.Children.Clear();
            node.Children.AddRange(content);
            if (node.Type == "legacyAccordionItem")
            {
                node.Type = "accordionItem";
                node.Attributes = new()
                {
                    ["itemId"] = $"helpjuice-accordion-{++accordionId}",
                    ["title"] = title,
                    ["open"] = node.Attributes?.GetValueOrDefault("open") as bool? ?? false
                };
            }
            else
            {
                node.Type = "tabItem";
                node.Attributes = new()
                {
                    ["itemId"] = $"helpjuice-tab-{++tabId}",
                    ["label"] = title
                };
            }
        }
        for (var i = node.Children.Count - 1; i >= 0; i--)
        {
            var child = node.Children[i];
            if (child.Type is "fragment" or "legacyStructuredBody" or "legacyStructuredTitle")
            { node.Children.RemoveAt(i); node.Children.InsertRange(i, child.Children); }
        }
        if (node.Children.Any(child => child.Type is "accordionItem" or "tabItem"))
            node.Children.RemoveAll(child => child.Type == "text" && string.IsNullOrWhiteSpace(child.Text));
        GroupStructuredItems(node, "accordionItem", "accordion");
        GroupStructuredItems(node, "tabItem", "tabs");
        if (node.Type == "doc" && node.Children.Count == 0) node.Children.Add(new("paragraph"));
        if (node.Type == "doc") WrapInlineRuns(node);
        if (node.Type is "listItem" or "tableCell" or "tableHeader" && node.Children.Count == 0) node.Children.Add(new("paragraph"));
        if (node.Type == "listItem" && node.Children.FirstOrDefault()?.Type is not ("paragraph" or "heading"))
        { var paragraph = new Node("paragraph"); while (node.Children.Count > 0 && node.Children[0].Type is not ("bulletList" or "orderedList")) { paragraph.Children.Add(node.Children[0]); node.Children.RemoveAt(0); } node.Children.Insert(0, paragraph); }
        if (node.Type is "tableCell" or "tableHeader" or "callout" or "accordionItem" or "tabItem")
        {
            WrapInlineRuns(node);
            if (node.Children.Count == 0) node.Children.Add(new("paragraph"));
        }
    }

    private static void GroupStructuredItems(Node parent, string itemType, string containerType)
    {
        for (var index = 0; index < parent.Children.Count;)
        {
            if (parent.Children[index].Type != itemType) { index++; continue; }
            var container = new Node(containerType);
            while (index < parent.Children.Count && parent.Children[index].Type == itemType)
            {
                container.Children.Add(parent.Children[index]);
                parent.Children.RemoveAt(index);
            }
            parent.Children.Insert(index++, container);
        }
    }

    private static string NodeText(Node? node)
    {
        if (node is null) return string.Empty;
        var builder = new StringBuilder();
        void Visit(Node current)
        {
            if (current.Text is not null) builder.Append(current.Text);
            foreach (var child in current.Children) Visit(child);
        }
        Visit(node);
        return WhitespaceRegex().Replace(builder.ToString(), " ");
    }

    private static void WrapInlineRuns(Node parent)
    {
        for (var index = 0; index < parent.Children.Count;)
        {
            if (parent.Children[index].Type is not ("text" or "hardBreak" or "image")) { index++; continue; }
            var paragraph = new Node("paragraph");
            while (index < parent.Children.Count && parent.Children[index].Type is "text" or "hardBreak" or "image")
            { paragraph.Children.Add(parent.Children[index]); parent.Children.RemoveAt(index); }
            parent.Children.Insert(index++, paragraph);
        }
    }

    private static void AddImagePlaceholder(Node parent, IReadOnlyDictionary<string, string> attrs, string fallback)
    {
        var label = attrs.GetValueOrDefault("alt") ?? attrs.GetValueOrDefault("title") ?? fallback;
        var paragraph = new Node("paragraph");
        paragraph.Children.Add(new("text") { Text = $"[Image: {label}]" });
        parent.Children.Add(paragraph);
    }

    private static string Render(Node root)
    {
        var builder = new StringBuilder(); foreach (var node in root.Children) RenderNode(node, builder); return builder.ToString();
    }
    private static void RenderNode(Node node, StringBuilder b)
    {
        if (node.Type == "text") { var text = WebUtility.HtmlEncode(node.Text); foreach (var mark in node.Marks) b.Append(mark.OpenHtml()); b.Append(text); foreach (var mark in node.Marks.AsEnumerable().Reverse()) b.Append(mark.CloseHtml()); return; }
        var (open, close) = node.Type switch
        {
            "paragraph" => ("<p>", "</p>"), "heading" => ($"<h{node.Attributes?["level"]}>", $"</h{node.Attributes?["level"]}>"),
            "bulletList" => ("<ul>", "</ul>"), "orderedList" => ("<ol>", "</ol>"), "listItem" => ("<li>", "</li>"),
            "blockquote" => ("<blockquote>", "</blockquote>"), "codeBlock" => ("<pre><code>", "</code></pre>"),
            "table" => (RenderTableOpen(node), "</table>"), "tableRow" => ("<tr>", "</tr>"),
            "tableHeader" => (RenderCellOpen(node, "th"), "</th>"), "tableCell" => (RenderCellOpen(node, "td"), "</td>"),
            "hardBreak" => ("<br>", ""), "horizontalRule" => ("<hr>", ""),
            "image" => ($"<img src=\"{WebUtility.HtmlEncode(node.Attributes?["src"]?.ToString())}\" alt=\"{WebUtility.HtmlEncode(node.Attributes?["alt"]?.ToString())}\"{(node.Attributes?["mediaId"] is string id ? $" data-media-id=\"{id}\"" : "")}>", ""),
            "youtube" => ($"<div data-youtube-video><iframe src=\"{WebUtility.HtmlEncode(node.Attributes?["src"]?.ToString())}\" allowfullscreen></iframe></div>", ""),
            "video" => ($"<video src=\"{WebUtility.HtmlEncode(node.Attributes?["src"]?.ToString())}\" data-media-id=\"{WebUtility.HtmlEncode(node.Attributes?["mediaId"]?.ToString())}\" controls preload=\"metadata\"></video>", ""),
            "callout" => ($"<aside data-kb-callout data-kb-callout-variant=\"{WebUtility.HtmlEncode(node.Attributes?["variant"]?.ToString())}\"><div data-kb-callout-content>", "</div></aside>"),
            "tabs" => ("<div data-kb-tabs>", "</div>"),
            "tabItem" => ($"<section data-kb-tab-item data-kb-tab-id=\"{WebUtility.HtmlEncode(node.Attributes?["itemId"]?.ToString())}\" data-kb-tab-label=\"{WebUtility.HtmlEncode(node.Attributes?["label"]?.ToString())}\"><div data-kb-tab-panel>", "</div></section>"),
            "accordion" => ("<div data-kb-accordion>", "</div>"),
            "accordionItem" => ($"<details data-kb-accordion-item data-kb-accordion-id=\"{WebUtility.HtmlEncode(node.Attributes?["itemId"]?.ToString())}\" data-kb-accordion-title=\"{WebUtility.HtmlEncode(node.Attributes?["title"]?.ToString())}\"{(node.Attributes?["open"] is true ? " open" : "")}><summary>{WebUtility.HtmlEncode(node.Attributes?["title"]?.ToString())}</summary><div data-kb-accordion-panel>", "</div></details>"),
            _ => ("", "")
        };
        b.Append(open); foreach (var child in node.Children) RenderNode(child, b); b.Append(close);
    }

    private static string RenderTableOpen(Node node)
    {
        var attributes = new StringBuilder("<table");
        if (AttributeInt(node, "tableWidthPx", 0) is > 0 and var pixels)
            attributes.Append(" data-table-width-px=\"").Append(pixels).Append("\" style=\"width:")
                .Append(pixels).Append("px; max-width:100%;\"");
        else if (node.Attributes?.GetValueOrDefault("tableWidthPct") is { } percentage)
            attributes.Append(" data-table-width-pct=\"").Append(EInvariant(percentage)).Append("\" style=\"width:")
                .Append(EInvariant(percentage)).Append("%;\"");
        attributes.Append('>');

        var firstRow = node.Children.FirstOrDefault(child => child.Type == "tableRow");
        var widths = firstRow?.Children.Where(IsTableCell)
            .SelectMany(cell => AttributeWidths(cell)).ToArray() ?? [];
        if (widths.Length > 0)
        {
            attributes.Append("<colgroup>");
            foreach (var width in widths) attributes.Append("<col width=\"").Append(width)
                .Append("\" style=\"width:").Append(width).Append("px;\">");
            attributes.Append("</colgroup>");
        }
        return attributes.ToString();
    }

    private static string RenderCellOpen(Node node, string tag)
    {
        var result = new StringBuilder("<").Append(tag);
        var colspan = AttributeInt(node, "colspan", 1);
        var rowspan = AttributeInt(node, "rowspan", 1);
        var widths = AttributeWidths(node);
        if (colspan > 1) result.Append(" colspan=\"").Append(colspan).Append('"');
        if (rowspan > 1) result.Append(" rowspan=\"").Append(rowspan).Append('"');
        if (widths.Length > 0)
        {
            result.Append(" colwidth=\"").Append(string.Join(',', widths)).Append("\" style=\"width:")
                .Append(widths.Sum()).Append("px;\"");
        }
        return result.Append('>').ToString();
    }

    private static int[] AttributeWidths(Node node) => node.Attributes?.GetValueOrDefault("colwidth") switch
    {
        int[] values => values,
        IEnumerable<int> values => values.ToArray(),
        _ => []
    };

    private static string EInvariant(object value) => System.Convert.ToString(value,
        System.Globalization.CultureInfo.InvariantCulture) ?? string.Empty;
    private static string PlainText(Node root) { var b = new StringBuilder(); Visit(root); return b.ToString().Trim(); void Visit(Node n) { if (n.Type == "tabItem" && n.Attributes?["label"] is { } label) b.AppendLine(label.ToString()); if (n.Type == "accordionItem" && n.Attributes?["title"] is { } title) b.AppendLine(title.ToString()); if (n.Text is not null) b.Append(n.Text); foreach (var c in n.Children) Visit(c); if (n.Type is "paragraph" or "heading" or "listItem" or "blockquote" or "codeBlock" or "tableRow") b.AppendLine(); } }

    private static bool TrySafeUrl(string? value, bool allowRelative, out string safe)
    {
        safe = WebUtility.HtmlDecode(value ?? string.Empty).Trim();
        if (safe.Length == 0 || safe.Length > 2048 || safe.Any(char.IsControl)) return false;
        if (safe.StartsWith('#') || allowRelative && safe.StartsWith('/')) return true;
        if (allowRelative && Uri.TryCreate(safe, UriKind.Relative, out _) && !safe.StartsWith("//") &&
            !safe.Split('/', StringSplitOptions.RemoveEmptyEntries).Any(segment => segment == "..")) return true;
        return Uri.TryCreate(safe, UriKind.Absolute, out var uri) && uri.Scheme is "http" or "https" or "mailto";
    }
    private static bool TryYoutubeUrl(string? value,out string canonical){canonical="";if(!Uri.TryCreate(WebUtility.HtmlDecode(value??"").Trim(),UriKind.Absolute,out var uri)||uri.Scheme!="https")return false;var host=uri.Host.ToLowerInvariant();string? id=null;if(host is "youtu.be" or "www.youtu.be")id=uri.AbsolutePath.Trim('/').Split('/')[0];else if(host is "youtube.com" or "www.youtube.com" or "m.youtube.com"){if(uri.AbsolutePath=="/watch")id=System.Web.HttpUtility.ParseQueryString(uri.Query)["v"];else if(uri.AbsolutePath.StartsWith("/embed/"))id=uri.AbsolutePath.Split('/',StringSplitOptions.RemoveEmptyEntries).ElementAtOrDefault(1);}else if(host is "youtube-nocookie.com" or "www.youtube-nocookie.com"&&uri.AbsolutePath.StartsWith("/embed/"))id=uri.AbsolutePath.Split('/',StringSplitOptions.RemoveEmptyEntries).ElementAtOrDefault(1);if(id is null||id.Length is < 6 or > 20||id.Any(ch=>!char.IsLetterOrDigit(ch)&&ch is not '-' and not '_'))return false;canonical=$"https://www.youtube.com/watch?v={id}";return true;}
    private static string Limit(string value) => value.Length <= 160 ? value : value[..157] + "...";

    private static (string Name, bool Closing, Dictionary<string, string> Attributes, bool SelfClosing)? ParseTag(string token)
    {
        var match = TagRegex().Match(token); if (!match.Success) return null;
        var attrs = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (Match attr in AttributeRegex().Matches(match.Groups[3].Value))
        {
            var key = attr.Groups[1].Value;
            if (key.StartsWith("on", StringComparison.OrdinalIgnoreCase) || key is "srcdoc") continue;
            attrs[key] = WebUtility.HtmlDecode(attr.Groups[2].Success ? attr.Groups[2].Value : attr.Groups[3].Success ? attr.Groups[3].Value : attr.Groups[4].Value);
        }
        return (match.Groups[2].Value.ToLowerInvariant(), match.Groups[1].Success, attrs, token.EndsWith("/>", StringComparison.Ordinal));
    }

    private sealed class Node(string type, string? sourceTag = null)
    {
        public string Type { get; set; } = type; public string SourceTag { get; } = sourceTag ?? type;
        public string? Text { get; set; } public List<Node> Children { get; } = [];
        public List<string> TransientColumnWidths { get; } = [];
        public List<Mark> Marks { get; set; } = []; public Dictionary<string, object?>? Attributes { get; set; }
        public JsonObject ToJson() { var o = new JsonObject { ["type"] = Type }; if (Text is not null) o["text"] = Text; if (Attributes?.Count > 0) o["attrs"] = JsonSerializer.SerializeToNode(Attributes); if (Marks.Count > 0) o["marks"] = new JsonArray(Marks.Select(m => m.ToJson()).ToArray()); if (Children.Count > 0) o["content"] = new JsonArray(Children.Select(c => c.ToJson()).ToArray()); return o; }
    }
    private sealed record ActiveMark(string SourceTag, Mark Mark);
    private sealed record Mark(string Type, Dictionary<string, object?>? Attrs = null)
    {
        public JsonObject ToJson() { var o = new JsonObject { ["type"] = Type }; if (Attrs?.Count > 0) o["attrs"] = JsonSerializer.SerializeToNode(Attrs); return o; }
        public string OpenHtml() => Type switch { "bold" => "<strong>", "italic" => "<em>", "underline" => "<u>", "strike" => "<s>", "superscript" => "<sup>", "subscript" => "<sub>", "code" => "<code>", "link" => $"<a href=\"{WebUtility.HtmlEncode(Attrs?["href"]?.ToString())}\" rel=\"noopener noreferrer nofollow\">", "textStyle" => $"<span style=\"{TextStyleCss()}\">", _ => "" };
        public string CloseHtml() => Type switch { "bold" => "</strong>", "italic" => "</em>", "underline" => "</u>", "strike" => "</s>", "superscript" => "</sup>", "subscript" => "</sub>", "code" => "</code>", "link" => "</a>", "textStyle" => "</span>", _ => "" };
        private string TextStyleCss() => string.Join(' ', new[]
        {
            Attrs?.GetValueOrDefault("fontFamily") is { } family ? $"font-family:{family};" : null,
            Attrs?.GetValueOrDefault("fontSize") is { } size ? $"font-size:{size};" : null,
            Attrs?.GetValueOrDefault("color") is { } color ? $"color:{color};" : null
        }.Where(value => value is not null).Select(WebUtility.HtmlEncode));
    }

    [GeneratedRegex(@"<!--[\s\S]*?-->|<![^>]*>|</?[^>]+>|[^<]+", RegexOptions.Compiled)] private static partial Regex TokenRegex();
    [GeneratedRegex(@"^<\s*(/)?\s*([a-zA-Z0-9:-]+)([\s\S]*?)/?\s*>$", RegexOptions.Compiled)] private static partial Regex TagRegex();
    [GeneratedRegex("""([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))""", RegexOptions.Compiled)] private static partial Regex AttributeRegex();
    [GeneratedRegex(@"\s+", RegexOptions.Compiled)] private static partial Regex WhitespaceRegex();
    [GeneratedRegex(@"^(\d+(?:\.\d+)?)(%|px)?$", RegexOptions.Compiled | RegexOptions.IgnoreCase)] private static partial Regex CssLengthRegex();
    [GeneratedRegex(@"^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$", RegexOptions.Compiled | RegexOptions.IgnoreCase)] private static partial Regex HexColorRegex();
    [GeneratedRegex(@"^(rgb)(a)?\(([^)]*)\)$", RegexOptions.Compiled | RegexOptions.IgnoreCase)] private static partial Regex RgbColorRegex();
}
