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
        "img", "figure", "figcaption", "div", "span", "article", "section", "details", "summary", "hr", "iframe", "video", "audio", "source", "object", "embed",
        "button", "input",
        "s", "strike", "del", "sup", "sub", "font", "o:p", "o:lock", "v:stroke", "v:path", "v:f",
        "v:formulas", "v:imagedata", "v:shape", "v:shapetype", "w:wrap"
    };
    private static readonly HashSet<string> DropWithContent = new(StringComparer.OrdinalIgnoreCase)
        { "script", "style", "form", "noscript", "template", "svg", "math" };
    private static readonly HashSet<string> VoidTags = new(StringComparer.OrdinalIgnoreCase)
        { "br", "img", "hr", "source", "embed", "meta", "link", "input", "col", "o:lock", "v:stroke", "v:path", "v:f", "v:imagedata", "w:wrap" };
    private static readonly HashSet<string> IgnoredMetadata = new(StringComparer.OrdinalIgnoreCase)
        { "meta", "link" };
    private static readonly HashSet<string> RecognizedClasses = new(StringComparer.OrdinalIgnoreCase)
    {
        "helpjuice-callout", "hj-callout", "callout", "notice", "helpjuice-notice", "helpjuice-callout-body",
        "info", "warning", "success", "danger", "error", "tip", "alert", "alert-info", "alert-warning",
        "callout-info", "callout-warning", "callout-success", "callout-danger", "callout-error", "callout-tip",
        "helpjuice-accordion", "f-accordion-panel", "helpjuice-accordion-title", "helpjuice-accordion-body",
        "panel-title", "panel-content", "helpjuice-tab", "f-tab-panel", "f-tabs-panel", "helpjuice-tab-title",
        "f-tab-title", "helpjuice-tab-body", "f-tab-content", "helpjuice-callout-delete", "helpjuice-accordion-delete",
        "helpjuice-accordion-toggle", "helpjuice-tab-delete", "helpjuice-tab-toggle", "MsoNormal", "MsoTableGrid",
        "MsoListParagraph", "WordSection1", "image", "image_resized", "ck-table-resized", "video-wrapper", "video-player"
    };

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
            if (parsed is null)
            {
                Warn("MALFORMED_HTML_TOKEN_REMOVED", $"Malformed HTML token '{Limit(token.Value)}' was removed (action=removed; preserved=false).");
                continue;
            }
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
                if (!closing) { droppedDepth++; Warn("UNSAFE_ELEMENT_REMOVED", $"The unsafe <{name}> element was removed with its content (element={name}; action=unsafe; preserved=false)."); }
                else if (droppedDepth > 0) droppedDepth--;
                continue;
            }
            if (droppedDepth > 0) continue;
            if (closing)
            {
                if (!Supported.Contains(name)) continue;
                CloseMarks(name, marks);
                if (name is "strong" or "b" or "em" or "i" or "u" or "a" or "code" or "s" or "strike" or "del" or "sup" or "sub" or "font" or
                    "iframe" or "video" or "audio" or "source" or "object" or "embed")
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
                Warn("UNSUPPORTED_ELEMENT", $"Unsupported <{name}> markup was flattened while preserving readable text (element={name}; action=normalized; preserved=false).");
                continue;
            }
            AuditSourceFormatting(name, attrs, Warn);
            if (name == "font")
            {
                foreach (var styleMark in TextStyleMarks(attrs, Warn)) marks.Push(new(name, styleMark));
                marks.Push(new(name, LegacyFontMark(attrs, Warn)));
                continue;
            }
            if (!selfClosing && !VoidTags.Contains(name))
                foreach (var styleMark in TextStyleMarks(attrs, Warn)) marks.Push(new(name, styleMark));
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
                    marks.Push(new(name, new("link", safe.StartsWith('/') || safe.StartsWith('#')
                        ? new() { ["href"] = safe, ["target"] = "_self" }
                        : new() { ["href"] = safe, ["target"] = "_blank", ["rel"] = "noopener noreferrer nofollow" })));
                else
                {
                    marks.Push(new(name, new("invalidLink")));
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
                if (mapped is null && !TrySafeUrl(src, allowRelative: true, out _)) continue;
                var imageAttributes = MediaAttributes(attrs, mapped?.Url ?? src, mapped?.MediaId);
                if (imageAttributes.Remove("width", out var imageWidth)) imageAttributes["cssWidth"] = imageWidth;
                if (imageAttributes.Remove("height", out var imageHeight)) imageAttributes["cssHeight"] = imageHeight;
                imageAttributes["alt"] = attrs.GetValueOrDefault("alt");
                imageAttributes["title"] = attrs.GetValueOrDefault("title");
                var image = new Node("image") { Attributes = imageAttributes };
                stack.Peek().Children.Add(image);
                if (mapped is null) Warn("UNRESOLVED_MEDIA", $"Media source '{Limit(src)}' was retained for review.");
                continue;
            }
            if (name is "iframe" or "video" or "audio" or "source" or "object" or "embed")
            {
                var src = attrs.GetValueOrDefault("src") ?? attrs.GetValueOrDefault("data-src") ??
                    attrs.GetValueOrDefault("data-lazy-src") ?? attrs.GetValueOrDefault("data-original") ??
                    attrs.GetValueOrDefault("data-url") ?? attrs.GetValueOrDefault("href") ?? attrs.GetValueOrDefault("data");
                if (src?.StartsWith("//", StringComparison.Ordinal) == true) src = "https:" + src;
                if (name is "video" or "audio" && string.IsNullOrWhiteSpace(src)) continue;
                if (name is "video" or "source" && !string.IsNullOrWhiteSpace(src)) mediaSources.Add(src);
                if (name is "video" or "source" && !string.IsNullOrWhiteSpace(src) && resolveMedia?.Invoke(src) is { } videoMedia)
                {
                    stack.Peek().Children.Add(new("video") { Attributes = MediaAttributes(attrs, videoMedia.Url, videoMedia.MediaId) });
                }
                else if (name == "audio" && !string.IsNullOrWhiteSpace(src) && resolveMedia?.Invoke(src) is { } audioMedia)
                {
                    stack.Peek().Children.Add(new("attachment") { Attributes = new()
                    {
                        ["src"] = audioMedia.Url, ["mediaId"] = audioMedia.MediaId.ToString(),
                        ["fileName"] = Path.GetFileName(Uri.TryCreate(src, UriKind.Absolute, out var audioUri) ? audioUri.LocalPath : src),
                        ["mimeType"] = "audio/*"
                    }});
                }
                else if (TryYoutubeUrl(src, out var youtube))
                {
                    stack.Peek().Children.Add(new("youtube") { Attributes = new() { ["src"] = youtube } });
                }
                else if (TrySafeUrl(src, false, out var safeVideo) && IsVideoSource(safeVideo))
                {
                    stack.Peek().Children.Add(new("video") { Attributes = MediaAttributes(attrs, safeVideo, null) });
                }
                else if (name is "iframe" or "object" or "embed" && TrySafeUrl(src, false, out var safePdf) && IsPdfSource(safePdf))
                {
                    stack.Peek().Children.Add(new("documentEmbed") { Attributes = MediaAttributes(attrs, safePdf, null) });
                }
                else if (name == "iframe" && TryExternalEmbed(src, out var externalEmbed))
                {
                    stack.Peek().Children.Add(new("externalEmbed") { Attributes = MediaAttributes(attrs, externalEmbed, null) });
                }
                else if (TrySafeUrl(src, false, out var safe))
                {
                    var paragraph = new Node("paragraph");
                    paragraph.Children.Add(new("text") { Text = safe, Marks = [new("link", new() { ["href"] = safe })] });
                    stack.Peek().Children.Add(paragraph);
                    if (name == "audio")
                        Warn("UNSUPPORTED_MEDIA_TYPE", $"Audio source '{Limit(safe)}' cannot be represented by the current Media Hub/editor schema (element=audio; action=normalized-to-link; preserved=false).");
                    Warn("EMBED_CONVERTED_TO_LINK", $"The <{name}> URL '{Limit(safe)}' has no lossless editor node and was converted to a safe link (action=normalized; preserved=false).");
                }
                else Warn("UNSAFE_EMBED_REMOVED", $"The <{name}> source '{Limit(src ?? string.Empty)}' was unsafe or unsupported (element={name}; action=unsafe; preserved=false).");
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
        if (tag == "span" && FirstAttribute(attrs, "data-definition", "data-kb-glossary-definition") is { } definition &&
            definition.Length <= 1000)
            return new("glossary", tag) { Attributes = new()
            {
                ["term"] = FirstAttribute(attrs, "data-term", "data-kb-glossary-term"),
                ["definition"] = Regex.Replace(definition, @"<[^>]*>", " ").Trim(),
                ["id"] = SanitizeAnchorId(FirstAttribute(attrs, "data-id", "data-kb-glossary-id"))
            }};
        if (classes.Overlaps(["helpjuice-callout", "hj-callout", "callout", "notice", "helpjuice-notice",
                "callout-info", "callout-warning", "callout-success", "callout-danger", "callout-error",
                "callout-tip", "alert-info", "alert-warning"]) || attrs.ContainsKey("data-kb-callout"))
            return WithDirection(new("callout", tag)
                { Attributes = new() { ["variant"] = CalloutVariant(classes, attrs) } }, attrs);
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

        var created = tag.ToLowerInvariant() switch
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
                "o:p" or "o:lock" or "v:stroke" or "v:path" or "v:f" or "v:formulas" or "v:shape" or "v:shapetype" or "w:wrap" => WithDirection(new("fragment", tag), attrs),
            _ => null
        };
        if (created is not null && created.Attributes?.ContainsKey("dir") != true &&
            stack.FirstOrDefault(parent => parent.Attributes?.GetValueOrDefault("dir") is "rtl" or "ltr")
                ?.Attributes?.GetValueOrDefault("dir") is string inheritedDirection)
            (created.Attributes ??= [])["dir"] = inheritedDirection;
        return created;
    }

    private static Mark LegacyFontMark(IReadOnlyDictionary<string, string> attrs,
        Action<string, string> warning)
    {
        var values = new Dictionary<string, object?>();
        var face = attrs.GetValueOrDefault("face")?.Trim();
        if (!string.IsNullOrWhiteSpace(face) && face.Length <= 160 && face.All(ch => !char.IsControl(ch) && ch is not ';' and not '<' and not '>'))
            values["fontFamily"] = face;
        else if (!string.IsNullOrWhiteSpace(face))
            warning("UNSUPPORTED_STYLE_REMOVED", $"Legacy font face '{Limit(face)}' was removed (element=font; attribute=face; action=removed; preserved=false).");
        var color = ParseStyle(attrs.GetValueOrDefault("style")).GetValueOrDefault("color") ??
                    FirstAttribute(attrs, "color", "data-color", "data-text-color", "data-font-color");
        if (!string.IsNullOrWhiteSpace(color))
        {
            if (TryNormalizeCssColor(color, out var safeColor)) values["color"] = safeColor;
            else warning("UNSUPPORTED_TEXT_COLOR", $"Unsupported Helpjuice text color '{Limit(color)}' was omitted (style=color; original={Limit(color)}; action=removed; preserved=false).");
        }
        if (int.TryParse(attrs.GetValueOrDefault("size"), out var size) && size is >= 1 and <= 7)
            values["fontSize"] = new[] { "10px", "13px", "16px", "18px", "24px", "32px", "48px" }[size - 1];
        else if (!string.IsNullOrWhiteSpace(attrs.GetValueOrDefault("size")))
            warning("UNSUPPORTED_STYLE_REMOVED", $"Legacy font size '{Limit(attrs["size"])}' was removed (element=font; attribute=size; action=removed; preserved=false).");
        return values.Count == 0 ? new("passthrough") : new("textStyle", values);
    }

    private static IReadOnlyList<Mark> TextStyleMarks(IReadOnlyDictionary<string, string> attrs,
        Action<string, string> warning)
    {
        var result = new List<Mark>();
        var values = new Dictionary<string, object?>();
        var styles = ParseStyle(attrs.GetValueOrDefault("style"));
        var color = styles.GetValueOrDefault("color") ??
            FirstAttribute(attrs, "color", "data-color", "data-text-color", "data-font-color");
        if (!string.IsNullOrWhiteSpace(color))
        {
            if (TryNormalizeCssColor(color, out var safeColor)) values["color"] = safeColor;
            else warning("UNSUPPORTED_TEXT_COLOR", $"Unsupported Helpjuice text color '{Limit(color)}' was omitted (style=color; original={Limit(color)}; action=removed; preserved=false).");
        }
        var family = styles.GetValueOrDefault("font-family")?.Trim();
        if (!string.IsNullOrWhiteSpace(family) && family.Length <= 160 && family.All(ch => !char.IsControl(ch) && ch is not ';' and not '<' and not '>'))
            values["fontFamily"] = family;
        else if (!string.IsNullOrWhiteSpace(family))
            warning("UNSUPPORTED_STYLE_REMOVED", $"Style font-family='{Limit(family)}' was removed (action=removed; preserved=false).");
        var fontSize = styles.GetValueOrDefault("font-size")?.Trim();
        if (!string.IsNullOrWhiteSpace(fontSize))
        {
            if (TryCssLength(fontSize, out var size, out var sizeUnit) && sizeUnit is "px" or "pt" or "em" or "rem" or "%" && size is >= 1 and <= 500)
                values["fontSize"] = NormalizeCssLength(size, sizeUnit, convertAbsolute: false);
            else warning("UNSUPPORTED_STYLE_REMOVED", $"Style font-size='{Limit(fontSize)}' on the source element was removed (action=removed; preserved=false).");
        }
        var lineHeight = styles.GetValueOrDefault("line-height")?.Trim();
        if (!string.IsNullOrWhiteSpace(lineHeight))
        {
            if (TryCssLength(lineHeight, out var height, out var heightUnit) && heightUnit is "px" or "pt" or "em" or "rem" or "%" && height is > 0 and <= 500)
                values["lineHeight"] = NormalizeCssLength(height, heightUnit, convertAbsolute: false);
            else if (double.TryParse(lineHeight, System.Globalization.NumberStyles.AllowDecimalPoint,
                         System.Globalization.CultureInfo.InvariantCulture, out var unitless) && unitless is > 0 and <= 10)
                values["lineHeight"] = unitless.ToString("0.###", System.Globalization.CultureInfo.InvariantCulture);
            else warning("UNSUPPORTED_STYLE_REMOVED", $"Style line-height='{Limit(lineHeight)}' on the source element was removed (action=removed; preserved=false).");
        }
        var legacyStyle = BuildLegacyStyle(attrs, "textStyle");
        if (legacyStyle.Length > 0) values["legacyStyle"] = legacyStyle;
        if (values.Count > 0) result.Add(new("textStyle", values));
        var background = styles.GetValueOrDefault("background-color")?.Trim();
        if (!string.IsNullOrWhiteSpace(background))
        {
            if (TryNormalizeCssColor(background, out var safeBackground)) result.Add(new("highlight", new() { ["color"] = safeBackground }));
            else warning("UNSUPPORTED_BACKGROUND_COLOR", $"Background color '{Limit(background)}' was removed (action=removed; preserved=false).");
        }
        if (styles.GetValueOrDefault("font-weight") is { } weight)
        {
            if (weight.Equals("bold", StringComparison.OrdinalIgnoreCase) || int.TryParse(weight, out var numericWeight) && numericWeight >= 600)
                result.Add(new("bold"));
            else if (!weight.Equals("normal", StringComparison.OrdinalIgnoreCase) && weight != "400")
                warning("UNSUPPORTED_STYLE_REMOVED", $"Style font-weight='{Limit(weight)}' was removed (action=removed; preserved=false).");
        }
        if (styles.GetValueOrDefault("font-style") is { } fontStyle)
        {
            if (fontStyle.Equals("italic", StringComparison.OrdinalIgnoreCase)) result.Add(new("italic"));
            else if (!fontStyle.Equals("normal", StringComparison.OrdinalIgnoreCase))
                warning("UNSUPPORTED_STYLE_REMOVED", $"Style font-style='{Limit(fontStyle)}' was removed (action=removed; preserved=false).");
        }
        if (styles.GetValueOrDefault("text-decoration") is { } decoration)
        {
            if (decoration.Contains("underline", StringComparison.OrdinalIgnoreCase)) result.Add(new("underline"));
            if (decoration.Contains("line-through", StringComparison.OrdinalIgnoreCase)) result.Add(new("strike"));
            if (!decoration.Equals("none", StringComparison.OrdinalIgnoreCase) &&
                !decoration.Contains("underline", StringComparison.OrdinalIgnoreCase) &&
                !decoration.Contains("line-through", StringComparison.OrdinalIgnoreCase))
                warning("UNSUPPORTED_STYLE_REMOVED", $"Style text-decoration='{Limit(decoration)}' was removed (action=removed; preserved=false).");
        }
        return result;
    }

    private static Dictionary<string, object?> TableAttrs(Dictionary<string, string> attrs,
        Action<string, string> warning)
    {
        var result = new Dictionary<string, object?>();
        var rawWidth = ParseStyle(attrs.GetValueOrDefault("style")).GetValueOrDefault("width") ??
                       attrs.GetValueOrDefault("width");
        if (string.IsNullOrWhiteSpace(rawWidth)) return AddLegacyAttributes(result, attrs, "table");
        if (rawWidth.Trim().Equals("auto", StringComparison.OrdinalIgnoreCase) ||
            TryCssLength(rawWidth, out var zero, out _) && zero == 0)
        {
            result["tableWidth"] = "auto";
            return AddLegacyAttributes(result, attrs, "table");
        }
        if (TryCssLength(rawWidth, out var value, out var unit))
        {
            if (unit == "%" && value is >= 1 and <= 100) result["tableWidthPct"] = value;
            else if (ToPixels(value, unit) is >= 25 and <= 4000 and var pixels)
            {
                result["tableWidthPx"] = (int)Math.Round(pixels);
                if (unit != "px") warning("TABLE_WIDTH_NORMALIZED", $"Table width '{Limit(rawWidth)}' was normalized to {(int)Math.Round(pixels)}px (action=normalized; preserved=true).");
            }
            else result["tableWidth"] = NormalizeCssLength(value, unit, convertAbsolute: false);
        }
        return AddLegacyAttributes(result, attrs, "table");
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
            if (TryCssLength(rawWidth, out var amount, out var unit))
            {
                result["_sourceWidth"] = rawWidth.Trim();
                result["cellWidth"] = NormalizeCssLength(amount, unit, convertAbsolute: unit != "%");
            }
            else warning("UNSUPPORTED_TABLE_COLUMN_WIDTH",
                $"Unsupported table cell width '{Limit(rawWidth)}' was omitted (element=table-cell; style=width; action=removed; preserved=false).");
        }
        var styles = ParseStyle(attrs.GetValueOrDefault("style"));
        var background = styles.GetValueOrDefault("background-color") ?? attrs.GetValueOrDefault("bgcolor");
        if (!string.IsNullOrWhiteSpace(background))
        {
            if (TryNormalizeCssColor(background, out var normalized)) result["backgroundColor"] = normalized;
            else warning("UNSUPPORTED_BACKGROUND_COLOR", $"Table-cell background color '{Limit(background)}' was removed (action=removed; preserved=false).");
        }
        var verticalAlign = (styles.GetValueOrDefault("vertical-align") ?? attrs.GetValueOrDefault("valign"))?.ToLowerInvariant();
        if (verticalAlign is "top" or "middle" or "bottom" or "baseline") result["verticalAlign"] = verticalAlign;
        var border = styles.GetValueOrDefault("border");
        if (!string.IsNullOrWhiteSpace(border) && border.Length <= 160 && !border.Contains("url(", StringComparison.OrdinalIgnoreCase))
            result["border"] = border;
        return AddLegacyAttributes(result, attrs, "tableCell");
    }
    private static Node WithDirection(Node node, IReadOnlyDictionary<string, string> attrs)
    {
        var styles = ParseStyle(attrs.GetValueOrDefault("style"));
        var direction = (attrs.GetValueOrDefault("dir") ?? styles.GetValueOrDefault("direction"))?.ToLowerInvariant();
        if (direction is "rtl" or "ltr") (node.Attributes ??= [])["dir"] = direction;
        var align = (attrs.GetValueOrDefault("align") ?? styles.GetValueOrDefault("text-align"))?.ToLowerInvariant();
        if (node.Type is "paragraph" or "heading" && align is "left" or "center" or "right" or "justify")
            (node.Attributes ??= [])["textAlign"] = align;
        if (node.Type == "heading" && attrs.GetValueOrDefault("id") is { Length: > 0 } id && id.Length <= 200)
            (node.Attributes ??= [])["id"] = id;
        if (node.Type is "bulletList" or "orderedList" && styles.GetValueOrDefault("list-style-type") is { Length: > 0 } listStyle)
            (node.Attributes ??= [])["listStyle"] = listStyle.ToLowerInvariant();
        node.Attributes = AddLegacyAttributes(node.Attributes ?? [], attrs, node.Type);
        return node;
    }

    private static Dictionary<string, object?> AddLegacyAttributes(Dictionary<string, object?> result,
        IReadOnlyDictionary<string, string> attrs, string nodeType)
    {
        var language = FirstAttribute(attrs, "lang", "xml:lang");
        if (!string.IsNullOrWhiteSpace(language) && Regex.IsMatch(language, @"^[A-Za-z]{1,8}(?:-[A-Za-z0-9]{1,8})*$"))
            result["lang"] = language;
        var id = SanitizeAnchorId(attrs.GetValueOrDefault("id") ?? attrs.GetValueOrDefault("name"));
        if (id is not null) result["id"] = id;
        var legacyStyle = BuildLegacyStyle(attrs, nodeType);
        var align = attrs.GetValueOrDefault("align")?.Trim().ToLowerInvariant();
        if (nodeType == "table" && align is "left" or "center" or "right")
            legacyStyle = string.Join(';', new[] { legacyStyle, align switch
            {
                "center" => "margin-left:auto;margin-right:auto",
                "right" => "margin-left:auto;margin-right:0",
                _ => "margin-left:0;margin-right:auto"
            }}.Where(value => value.Length > 0));
        else if (nodeType == "tableCell" && align is "left" or "center" or "right" or "justify")
            legacyStyle = string.Join(';', new[] { legacyStyle, $"text-align:{align}" }.Where(value => value.Length > 0));
        if (attrs.GetValueOrDefault("border") is { } borderAttribute &&
            double.TryParse(borderAttribute, System.Globalization.CultureInfo.InvariantCulture, out var borderWidth) && borderWidth is >= 0 and <= 20)
            legacyStyle = string.Join(';', new[] { legacyStyle, $"border:{borderWidth.ToString("0.###", System.Globalization.CultureInfo.InvariantCulture)}px solid currentColor" }.Where(value => value.Length > 0));
        if (legacyStyle.Length > 0) result["legacyStyle"] = legacyStyle;
        return result;
    }

    private static string? SanitizeAnchorId(string? value)
    {
        var id = WebUtility.HtmlDecode(value ?? string.Empty).Trim();
        if (id.Length is 0 or > 128) return null;
        var safe = Regex.Replace(id, @"[^A-Za-z0-9_.:-]+", "-").Trim('-');
        if (safe.Length == 0) return null;
        return char.IsLetter(safe[0]) ? safe : "anchor-" + safe;
    }
    private static int ParsePositive(string? value, int fallback) =>
        int.TryParse(value, out var number) && number > 0 ? number : fallback;

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
        if (classes.Contains("info") || classes.Contains("callout-info") || classes.Contains("alert-info")) return "info";
        if (classes.Contains("warning") || classes.Contains("alert-warning")) return "warning";
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

        ForEachCell(rows, (cell, column, colspan) =>
        {
            if (cell.Attributes?.ContainsKey("cellWidth") == true || colspan != 1 ||
                column >= table.TransientColumnWidths.Count) return;
            if (TryCssLength(table.TransientColumnWidths[column], out var amount, out var unit))
                (cell.Attributes ??= [])["cellWidth"] = NormalizeCssLength(amount, unit, convertAbsolute: unit != "%");
        });

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
        var pixels = unit == "%" ? percentageBase * amount / 100d : ToPixels(amount, unit);
        if (pixels is null) return null;
        if (pixels is < 1 or > 2000)
        {
            warning("UNSUPPORTED_TABLE_COLUMN_WIDTH",
                $"Table column width '{Limit(value)}' is outside supported migration limits.");
            return null;
        }
        if (unit is not ("px" or "%"))
            warning("TABLE_COLUMN_WIDTH_NORMALIZED", $"Table column width '{Limit(value)}' was normalized to {(int)Math.Round(pixels.Value)}px (action=normalized; preserved=true).");
        return (int)Math.Round(pixels.Value);
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

    private static string BuildLegacyStyle(IReadOnlyDictionary<string, string> attrs, string nodeType)
    {
        var styles = ParseStyle(attrs.GetValueOrDefault("style"));
        var preserved = new List<string>();
        foreach (var (rawProperty, rawValue) in styles)
        {
            var property = rawProperty.ToLowerInvariant();
            var value = Regex.Replace(rawValue.Trim(), @"\s*!important\s*$", string.Empty,
                RegexOptions.IgnoreCase).Trim();
            if (value.Length == 0 || value.Length > 240 || ContainsUnsafeCss(value)) continue;

            var safe = property switch
            {
                "margin" or "margin-top" or "margin-right" or "margin-bottom" or "margin-left" or
                "padding" or "padding-top" or "padding-right" or "padding-bottom" or "padding-left" or
                "text-indent" or "letter-spacing" or "word-spacing" or
                "min-width" or "max-width" or "min-height" or "max-height" when TrySafeLengthList(value, property.StartsWith("margin") || property == "text-indent") => value,
                "width" or "height" when nodeType is "image" or "video" or "documentEmbed" or "externalEmbed" or "table" or "tableCell" && TrySafeDimension(value, allowAuto: true) => NormalizeDimension(value),
                "vertical-align" when Regex.IsMatch(value, @"^(?:baseline|sub|super|text-top|text-bottom|middle|top|bottom|-?\d+(?:\.\d+)?(?:px|pt|em|rem|%))$", RegexOptions.IgnoreCase) => value.ToLowerInvariant(),
                "text-align" when Regex.IsMatch(value, @"^(?:left|right|center|justify|start|end)$", RegexOptions.IgnoreCase) => value.ToLowerInvariant(),
                "direction" when value is "ltr" or "rtl" => value,
                "unicode-bidi" when Regex.IsMatch(value, @"^(?:normal|embed|isolate|bidi-override|isolate-override|plaintext)$", RegexOptions.IgnoreCase) => value.ToLowerInvariant(),
                "float" when Regex.IsMatch(value, @"^(?:left|right|none|inline-start|inline-end)$", RegexOptions.IgnoreCase) => value.ToLowerInvariant(),
                "object-fit" when Regex.IsMatch(value, @"^(?:fill|contain|cover|none|scale-down)$", RegexOptions.IgnoreCase) => value.ToLowerInvariant(),
                "object-position" when Regex.IsMatch(value, @"^[A-Za-z0-9.%\s-]+$") => value,
                "text-transform" when Regex.IsMatch(value, @"^(?:none|capitalize|uppercase|lowercase|full-width)$", RegexOptions.IgnoreCase) => value.ToLowerInvariant(),
                "text-decoration-line" when Regex.IsMatch(value, @"^(?:none|underline|overline|line-through)(?:\s+(?:underline|overline|line-through))*$", RegexOptions.IgnoreCase) => value.ToLowerInvariant(),
                "text-decoration-style" when Regex.IsMatch(value, @"^(?:solid|double|dotted|dashed|wavy)$", RegexOptions.IgnoreCase) => value.ToLowerInvariant(),
                "text-decoration-color" when TryNormalizeCssColor(value, out var decorationColor) => decorationColor,
                "white-space" when Regex.IsMatch(value, @"^(?:normal|pre|pre-wrap|pre-line|break-spaces|nowrap)$", RegexOptions.IgnoreCase) => value.ToLowerInvariant(),
                "overflow-wrap" when Regex.IsMatch(value, @"^(?:normal|break-word|anywhere)$", RegexOptions.IgnoreCase) => value.ToLowerInvariant(),
                "word-break" when Regex.IsMatch(value, @"^(?:normal|break-all|keep-all|break-word)$", RegexOptions.IgnoreCase) => value.ToLowerInvariant(),
                "list-style" or "list-style-type" or "list-style-position" when Regex.IsMatch(value, @"^[A-Za-z0-9_-]+(?:\s+(?:inside|outside))?$", RegexOptions.IgnoreCase) => value,
                "border" or "border-width" or "border-style" or "border-color" or
                "border-top" or "border-right" or "border-bottom" or "border-left" or
                "border-top-width" or "border-right-width" or "border-bottom-width" or "border-left-width" or
                "border-top-style" or "border-right-style" or "border-bottom-style" or "border-left-style" or
                "border-top-color" or "border-right-color" or "border-bottom-color" or "border-left-color"
                    when IsSafeBorder(value) => value,
                "border-collapse" when value is "collapse" or "separate" => value,
                "border-spacing" when TrySafeLengthList(value, false) => value,
                "table-layout" when value is "auto" or "fixed" => value,
                "background-image" when TrySafeBackgroundImage(value, out var background) => background,
                _ => null
            };
            if (safe is not null) preserved.Add($"{property}:{safe}");
        }
        return string.Join(';', preserved);
    }

    private static bool ContainsUnsafeCss(string value) =>
        Regex.IsMatch(value, @"(?:expression\s*\(|javascript\s*:|vbscript\s*:|@import|behavior\s*:|-moz-binding)", RegexOptions.IgnoreCase);

    private static bool TrySafeLengthList(string value, bool allowNegative)
    {
        var parts = value.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (parts.Length is < 1 or > 4) return false;
        foreach (var part in parts)
        {
            if (allowNegative && part.Equals("auto", StringComparison.OrdinalIgnoreCase)) continue;
            var match = Regex.Match(part, allowNegative ? @"^(-?\d+(?:\.\d+)?)(px|pt|in|cm|mm|em|rem|%)?$" : @"^(\d+(?:\.\d+)?)(px|pt|in|cm|mm|em|rem|%)?$", RegexOptions.IgnoreCase);
            if (!match.Success || !double.TryParse(match.Groups[1].Value,
                    System.Globalization.NumberStyles.AllowLeadingSign | System.Globalization.NumberStyles.AllowDecimalPoint,
                    System.Globalization.CultureInfo.InvariantCulture, out var amount)) return false;
            var absolute = Math.Abs(amount);
            var unit = match.Groups[2].Success ? match.Groups[2].Value.ToLowerInvariant() : "px";
            if (unit == "%" ? absolute > 500 : ToPixels(absolute, unit) is not { } pixels || pixels > 4000) return false;
        }
        return true;
    }

    private static bool TrySafeDimension(string value, bool allowAuto)
    {
        if (allowAuto && value.Equals("auto", StringComparison.OrdinalIgnoreCase)) return true;
        if (!TryCssLength(value, out var amount, out var unit)) return false;
        return unit == "%" ? amount <= 1000 : ToPixels(amount, unit) is { } pixels && pixels <= 10000;
    }

    private static string NormalizeDimension(string value)
    {
        if (value.Equals("auto", StringComparison.OrdinalIgnoreCase)) return "auto";
        return TryCssLength(value, out var amount, out var unit)
            ? amount == 0 ? "auto" : NormalizeCssLength(amount, unit, convertAbsolute: false)
            : value;
    }

    private static bool IsSafeBorder(string value) => value.Length <= 160 &&
        !value.Contains("url(", StringComparison.OrdinalIgnoreCase) &&
        Regex.IsMatch(value, @"^[#(),.%\w\s-]+$");

    private static bool TrySafeBackgroundImage(string value, out string safe)
    {
        safe = string.Empty;
        var match = Regex.Match(value, "^url\\(\\s*['\"]?(.*?)['\"]?\\s*\\)$", RegexOptions.IgnoreCase);
        if (!match.Success || !TrySafeUrl(match.Groups[1].Value, true, out var url) ||
            url.StartsWith("data:", StringComparison.OrdinalIgnoreCase)) return false;
        safe = $"url('{url.Replace("'", "%27")}')";
        return true;
    }

    private static Dictionary<string, object?> MediaAttributes(IReadOnlyDictionary<string, string> attrs,
        string src, Guid? mediaId)
    {
        var result = new Dictionary<string, object?> { ["src"] = src, ["mediaId"] = mediaId?.ToString() };
        var styles = ParseStyle(attrs.GetValueOrDefault("style"));
        foreach (var property in new[] { "width", "height", "min-width", "max-width", "min-height", "max-height" })
        {
            var value = styles.GetValueOrDefault(property) ?? (property is "width" or "height" ? attrs.GetValueOrDefault(property) : null);
            if (!string.IsNullOrWhiteSpace(value) && TrySafeDimension(value, true))
                result[property.Replace("-", string.Empty, StringComparison.Ordinal)] = NormalizeDimension(value);
        }
        var align = (attrs.GetValueOrDefault("align") ?? styles.GetValueOrDefault("text-align") ?? styles.GetValueOrDefault("float"))?.ToLowerInvariant();
        if (align is "left" or "center" or "right") result["alignment"] = align;
        var legacyStyle = BuildLegacyStyle(attrs, src.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase) ? "documentEmbed" : "video");
        if (attrs.GetValueOrDefault("border") is { } border &&
            double.TryParse(border, System.Globalization.CultureInfo.InvariantCulture, out var borderWidth) && borderWidth is >= 0 and <= 20)
            legacyStyle = string.Join(';', new[] { legacyStyle, $"border:{borderWidth.ToString("0.###", System.Globalization.CultureInfo.InvariantCulture)}px solid currentColor" }.Where(value => value.Length > 0));
        result["legacyStyle"] = legacyStyle;
        result["title"] = attrs.GetValueOrDefault("title");
        return result;
    }

    private static bool IsVideoSource(string value) => Uri.TryCreate(value, UriKind.Absolute, out var uri) &&
        Regex.IsMatch(Uri.UnescapeDataString(uri.AbsolutePath), @"\.(?:mp4|webm|ogg)$", RegexOptions.IgnoreCase);
    private static bool IsPdfSource(string value) => Uri.TryCreate(value, UriKind.Absolute, out var uri) &&
        Regex.IsMatch(Uri.UnescapeDataString(uri.AbsolutePath), @"\.pdf$", RegexOptions.IgnoreCase);
    private static bool TryExternalEmbed(string? value, out string safe)
    {
        safe = string.Empty;
        if (!TrySafeUrl(value, false, out var candidate) || !Uri.TryCreate(candidate, UriKind.Absolute, out var uri) ||
            uri.Scheme != Uri.UriSchemeHttps || !uri.Host.Equals("www.wizardshot.com", StringComparison.OrdinalIgnoreCase) ||
            !Regex.IsMatch(uri.AbsolutePath, @"^/embed/tutorials/\d+/?$", RegexOptions.IgnoreCase)) return false;
        safe = candidate;
        return true;
    }

    private static void AuditSourceFormatting(string tag, IReadOnlyDictionary<string, string> attrs,
        Action<string, string> warning)
    {
        foreach (var rawDeclaration in (attrs.GetValueOrDefault("style") ?? string.Empty)
                     .Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            if (rawDeclaration.IndexOf(':') <= 0)
                warning("MALFORMED_STYLE_REMOVED",
                    $"Malformed style declaration '{Limit(rawDeclaration)}' on <{tag}> was removed (element={tag}; action=removed; preserved=false).");
        var styles = ParseStyle(attrs.GetValueOrDefault("style"));
        foreach (var declaration in styles)
        {
            var property = declaration.Key.ToLowerInvariant();
            if (IsNoisySourceStyle(property)) continue;
            var handled = property is "color" or "font-family" or "font-size" or "line-height" or
                               "background-color" or "font-weight" or "font-style" or "text-decoration" ||
                          property == "direction" && tag is "p" or "h1" or "h2" or "h3" or "h4" or "h5" or "h6" or
                              "ul" or "ol" or "li" or "blockquote" or "table" or "td" or "th" or "div" or
                              "section" or "article" ||
                          property == "text-align" && tag is "p" or "h1" or "h2" or "h3" or "h4" or "h5" or "h6" ||
                          property == "list-style-type" && tag is "ul" or "ol" ||
                          property == "width" && tag is "table" or "col" or "td" or "th" ||
                          property is "vertical-align" or "border" && tag is "td" or "th" ||
                          IsMaterialStyleProperty(property);
            if (!handled)
                warning("UNSUPPORTED_STYLE_REMOVED",
                    $"Style {property}='{Limit(declaration.Value)}' on <{tag}> is not represented by the editor schema (element={tag}; style={property}; original={Limit(declaration.Value)}; action=removed; preserved=false).");
            else if (property == "background-color" && tag is not ("span" or "font" or "td" or "th"))
                warning("STYLE_NORMALIZED",
                    $"Background color '{Limit(declaration.Value)}' on <{tag}> was normalized to an inline text highlight (element={tag}; style=background-color; action=normalized; preserved=true).");
        }

        foreach (var attribute in attrs)
        {
            var name = attribute.Key.ToLowerInvariant();
            if (name.StartsWith("on", StringComparison.OrdinalIgnoreCase) || name == "srcdoc")
            {
                warning("UNSAFE_ATTRIBUTE_REMOVED",
                    $"Unsafe attribute {name} on <{tag}> was removed (element={tag}; attribute={name}; original={Limit(attribute.Value)}; action=unsafe; preserved=false).");
                continue;
            }
            if (IsNoisySourceAttribute(name)) continue;
            if (name == "class")
            {
                foreach (var className in Classes(attrs).Where(className => !RecognizedClasses.Contains(className) &&
                             !Regex.IsMatch(className, @"^(?:Mso|SCXW|ps\d|ts\d|___|f\d|r\d|kb-)", RegexOptions.IgnoreCase)))
                    warning("MEANINGFUL_CLASS_NOT_PRESERVED",
                        $"Custom class '{Limit(className)}' on <{tag}> has no migration mapping (element={tag}; attribute=class; original={Limit(className)}; action=removed; preserved=false).");
                continue;
            }
            if (name is "style" or "role" or "contenteditable" or "spellcheck" ||
                name.StartsWith("aria-", StringComparison.OrdinalIgnoreCase) || name.StartsWith("data-mce-", StringComparison.OrdinalIgnoreCase) ||
                name.StartsWith("data-ccp-", StringComparison.OrdinalIgnoreCase)) continue;
            var handled = name is "id" or "name" or "lang" or "xml:lang" ||
                          name == "dir" && tag is "p" or "h1" or "h2" or "h3" or "h4" or "h5" or "h6" or "ul" or "ol" or "li" or "blockquote" or "table" or "td" or "th" or "div" or "section" or "article" ||
                          name == "align" && tag is "p" or "h1" or "h2" or "h3" or "h4" or "h5" or "h6" ||
                          name is "href" or "target" or "rel" && tag == "a" ||
                          name is "src" or "data-src" or "data-lazy-src" or "data-original" or "data-url" && tag is "img" or "iframe" or "video" or "audio" or "source" or "embed" ||
                          name == "data" && tag == "object" ||
                          name is "alt" or "width" or "height" or "align" or "border" && tag == "img" ||
                          name is "width" or "border" or "cellpadding" or "cellspacing" && tag == "table" ||
                          name is "width" or "span" && tag == "col" ||
                          name is "width" or "colspan" or "rowspan" or "valign" or "bgcolor" or "align" or "border" && tag is "td" or "th" ||
                          name is "start" or "type" && tag == "ol" || name == "type" && tag == "ul" ||
                          name is "data-kb-callout" or "data-kb-callout-variant" or "data-kb-callout-content" ||
                          name == "open" && tag == "details" || name is "color" or "face" or "size" && tag == "font" ||
                          name is "data-color" or "data-text-color" or "data-font-color" ||
                          name is "controls" or "preload" or "autoplay" or "loop" or "muted" or "poster" or "width" or "height" or "align" && tag is "video" or "audio" or "iframe" or "object" or "embed" ||
                          name is "data-term" or "data-definition" or "data-id" or
                              "data-kb-glossary-term" or "data-kb-glossary-definition" or "data-kb-glossary-id";
            if (!handled)
                warning("UNSUPPORTED_ATTRIBUTE_REMOVED",
                    $"Attribute {name}='{Limit(attribute.Value)}' on <{tag}> has no migration mapping (element={tag}; attribute={name}; original={Limit(attribute.Value)}; action=removed; preserved=false).");
        }
    }

    private static bool IsMaterialStyleProperty(string property) => property is
        "width" or "height" or "min-width" or "max-width" or "min-height" or "max-height" or
        "object-fit" or "object-position" or "text-align" or "vertical-align" or "text-indent" or
        "direction" or "unicode-bidi" or "float" or "margin" or "margin-top" or "margin-right" or
        "margin-bottom" or "margin-left" or "padding" or "padding-top" or "padding-right" or
        "padding-bottom" or "padding-left" or "letter-spacing" or "word-spacing" or "text-transform" or
        "text-decoration-line" or "text-decoration-style" or "text-decoration-color" or "white-space" or
        "overflow-wrap" or "word-break" or "list-style" or "list-style-type" or "list-style-position" or
        "border" or "border-width" or "border-style" or "border-color" or "border-top" or "border-right" or
        "border-bottom" or "border-left" or "border-top-width" or "border-right-width" or
        "border-bottom-width" or "border-left-width" or "border-top-style" or "border-right-style" or
        "border-bottom-style" or "border-left-style" or "border-top-color" or "border-right-color" or
        "border-bottom-color" or "border-left-color" or "border-collapse" or "border-spacing" or
        "table-layout" or "background-image";

    private static bool IsNoisySourceStyle(string property) => property.StartsWith("-webkit-") ||
        property.StartsWith("--tw-") || property.StartsWith("mso-") || property is "cursor" or "user-select" or
        "pointer-events" or "animation" or "transition" or "outline" or "font-kerning" or
        "font-optical-sizing" or "orphans" or "widows" or "page" or "position" or "top" or "right" or
        "bottom" or "left" or "z-index" or "transform";

    private static bool IsNoisySourceAttribute(string name) => name.StartsWith("data-mce-") ||
        name.StartsWith("data-ccp-") || name.StartsWith("aria-") || name is "role" or "contenteditable" or
        "spellcheck" or "data-start" or "data-end" or "data-toc" or "data-is-last-node" or
        "data-is-only-node" or "paraid" or "paraeid" or "mlp" or "uploadprocessed" or "data-teams" or
        "data-controller" or "v:shapes";

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
        return amount >= 0;
    }

    private static double? ToPixels(double amount, string unit) => unit switch
    {
        "px" => amount,
        "in" => amount * 96d,
        "cm" => amount * 96d / 2.54d,
        "mm" => amount * 96d / 25.4d,
        "pt" => amount * 96d / 72d,
        "pc" => amount * 16d,
        "em" or "rem" => amount * 16d,
        _ => null
    };

    private static string NormalizeCssLength(double amount, string unit, bool convertAbsolute)
    {
        var normalizedAmount = convertAbsolute ? ToPixels(amount, unit) ?? amount : amount;
        var normalizedUnit = convertAbsolute ? "px" : unit;
        return normalizedAmount.ToString("0.###", System.Globalization.CultureInfo.InvariantCulture) + normalizedUnit;
    }

    private static bool TryNormalizeCssColor(string value, out string safe)
    {
        safe = Regex.Replace(value.Trim(), @"\s*!important\s*$", string.Empty,
            RegexOptions.IgnoreCase).Trim();
        var variable = Regex.Match(safe, @"^var\(\s*(--[a-z0-9_-]+)\s*(?:,\s*([\s\S]+))?\)$",
            RegexOptions.IgnoreCase);
        if (variable.Success)
        {
            if (variable.Groups[2].Success)
                return TryNormalizeCssColor(variable.Groups[2].Value.Trim(), out safe);
            if (HelpJuiceColorVariables.TryGetValue(variable.Groups[1].Value, out var mapped))
            {
                safe = mapped;
                return true;
            }
            return false;
        }
        if (safe.Equals("windowtext", StringComparison.OrdinalIgnoreCase))
        {
            safe = "#000000";
            return true;
        }
        if (safe.Equals("currentcolor", StringComparison.OrdinalIgnoreCase))
        {
            safe = "currentColor";
            return true;
        }
        if (safe.Equals("inherit", StringComparison.OrdinalIgnoreCase))
        {
            safe = "inherit";
            return true;
        }
        if (HexColorRegex().IsMatch(safe)) return true;
        if (CssNamedColors.Contains(safe))
        {
            safe = safe.ToLowerInvariant();
            return true;
        }
        var match = RgbColorRegex().Match(safe);
        if (!match.Success)
        {
            var hsl = HslColorRegex().Match(safe);
            if (!hsl.Success) return false;
            var body = hsl.Groups[2].Value;
            var hslParts = body.Contains(',')
                ? body.Replace('/', ',').Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
                : Regex.Split(body.Trim(), @"\s*/\s*|\s+").Where(part => part.Length > 0).ToArray();
            var expectsAlpha = hsl.Groups[1].Success || hslParts.Length == 4;
            if (hslParts.Length != (expectsAlpha ? 4 : 3) || !TryHue(hslParts[0]) || !TryPercentage(hslParts[1]) || !TryPercentage(hslParts[2]) ||
                expectsAlpha && !TryAlpha(hslParts[3])) return false;
            safe = safe.ToLowerInvariant();
            return true;
        }
        var rgbBody = match.Groups[3].Value;
        var parts = rgbBody.Contains(',')
            ? rgbBody.Replace('/', ',').Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
            : Regex.Split(rgbBody.Trim(), @"\s*/\s*|\s+").Where(part => part.Length > 0).ToArray();
        var alpha = match.Groups[2].Success || parts.Length == 4;
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

        static bool TryHue(string value)
        {
            var normalized = Regex.Replace(value.Trim(), "(?:deg|grad|rad|turn)$", string.Empty, RegexOptions.IgnoreCase);
            return double.TryParse(normalized, System.Globalization.NumberStyles.AllowLeadingSign | System.Globalization.NumberStyles.AllowDecimalPoint,
                System.Globalization.CultureInfo.InvariantCulture, out var number) && double.IsFinite(number);
        }
        static bool TryPercentage(string value) => value.EndsWith('%') &&
            double.TryParse(value[..^1], System.Globalization.NumberStyles.AllowDecimalPoint,
                System.Globalization.CultureInfo.InvariantCulture, out var number) && number is >= 0 and <= 100;
        static bool TryAlpha(string value)
        {
            var percentage = value.EndsWith('%');
            var text = percentage ? value[..^1] : value;
            return double.TryParse(text, System.Globalization.NumberStyles.AllowDecimalPoint,
                System.Globalization.CultureInfo.InvariantCulture, out var number) && number >= 0 && number <= (percentage ? 100 : 1);
        }
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

    private static readonly Dictionary<string, string> HelpJuiceColorVariables = new(StringComparer.OrdinalIgnoreCase)
    {
        ["--link-default"] = "#0067b8",
        ["--communication-foreground"] = "#005a9e",
        ["--communication-primary"] = "#005a9e",
        ["--text-primary"] = "#242424",
        ["--foreground"] = "#242424"
    };

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
        if (node.Type == "glossary")
        {
            var term = node.Attributes?.GetValueOrDefault("term")?.ToString();
            (node.Attributes ??= [])["term"] = string.IsNullOrWhiteSpace(term) ? NodeText(node).Trim() : term;
            node.Children.Clear();
            return;
        }
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
            "paragraph" => (OpenBlock(node, "p"), "</p>"),
            "heading" => (OpenBlock(node, $"h{node.Attributes?["level"]}"), $"</h{node.Attributes?["level"]}>"),
            "bulletList" => (OpenBlock(node, "ul"), "</ul>"),
            "orderedList" => (OpenBlock(node, "ol", AttributeInt(node, "start", 1) is > 1 and var start
                ? $" start=\"{start}\"" : null), "</ol>"),
            "listItem" => (OpenBlock(node, "li"), "</li>"),
            "blockquote" => (OpenBlock(node, "blockquote"), "</blockquote>"), "codeBlock" => ("<pre><code>", "</code></pre>"),
            "table" => (RenderTableOpen(node), "</table>"), "tableRow" => ("<tr>", "</tr>"),
            "tableHeader" => (RenderCellOpen(node, "th"), "</th>"), "tableCell" => (RenderCellOpen(node, "td"), "</td>"),
            "hardBreak" => ("<br>", ""), "horizontalRule" => ("<hr>", ""),
            "image" => ($"<img src=\"{WebUtility.HtmlEncode(node.Attributes?["src"]?.ToString())}\" alt=\"{WebUtility.HtmlEncode(node.Attributes?["alt"]?.ToString())}\"{MediaHtmlAttributes(node)}>", ""),
            "youtube" => ($"<div data-youtube-video><iframe src=\"{WebUtility.HtmlEncode(node.Attributes?["src"]?.ToString())}\" allowfullscreen></iframe></div>", ""),
            "video" => ($"<video src=\"{WebUtility.HtmlEncode(node.Attributes?["src"]?.ToString())}\"{MediaHtmlAttributes(node)} controls preload=\"metadata\"></video>", ""),
            "documentEmbed" => ($"<div data-kb-document-embed><a href=\"{WebUtility.HtmlEncode(node.Attributes?["src"]?.ToString())}\" rel=\"noopener noreferrer\">Open PDF document</a></div>", ""),
            "externalEmbed" => ($"<iframe data-kb-external-embed src=\"{WebUtility.HtmlEncode(node.Attributes?["src"]?.ToString())}\" title=\"{WebUtility.HtmlEncode(node.Attributes?["title"]?.ToString() ?? "Embedded tutorial")}\" sandbox=\"allow-scripts allow-forms allow-popups\" loading=\"lazy\" referrerpolicy=\"no-referrer\"{MediaHtmlAttributes(node)}></iframe>", ""),
            "glossary" => ($"<span data-kb-glossary data-kb-glossary-term=\"{WebUtility.HtmlEncode(node.Attributes?["term"]?.ToString())}\" data-kb-glossary-definition=\"{WebUtility.HtmlEncode(node.Attributes?["definition"]?.ToString())}\">{WebUtility.HtmlEncode(node.Attributes?["term"]?.ToString())}</span>", ""),
            "attachment" => ($"<a href=\"{WebUtility.HtmlEncode(node.Attributes?["src"]?.ToString())}\" data-kb-attachment=\"true\" data-media-id=\"{WebUtility.HtmlEncode(node.Attributes?["mediaId"]?.ToString())}\" download=\"{WebUtility.HtmlEncode(node.Attributes?["fileName"]?.ToString())}\">{WebUtility.HtmlEncode(node.Attributes?["fileName"]?.ToString() ?? "Download attachment")}</a>", ""),
            "callout" => ($"<aside{(node.Attributes?.GetValueOrDefault("dir") is string calloutDirection && calloutDirection is "rtl" or "ltr" ? $" dir=\"{calloutDirection}\"" : string.Empty)} data-kb-callout data-kb-callout-variant=\"{WebUtility.HtmlEncode(node.Attributes?["variant"]?.ToString())}\"><div data-kb-callout-content>", "</div></aside>"),
            "tabs" => ("<div data-kb-tabs>", "</div>"),
            "tabItem" => ($"<section data-kb-tab-item data-kb-tab-id=\"{WebUtility.HtmlEncode(node.Attributes?["itemId"]?.ToString())}\" data-kb-tab-label=\"{WebUtility.HtmlEncode(node.Attributes?["label"]?.ToString())}\"><div data-kb-tab-panel>", "</div></section>"),
            "accordion" => ("<div data-kb-accordion>", "</div>"),
            "accordionItem" => ($"<details data-kb-accordion-item data-kb-accordion-id=\"{WebUtility.HtmlEncode(node.Attributes?["itemId"]?.ToString())}\" data-kb-accordion-title=\"{WebUtility.HtmlEncode(node.Attributes?["title"]?.ToString())}\"{(node.Attributes?["open"] is true ? " open" : "")}><summary>{WebUtility.HtmlEncode(node.Attributes?["title"]?.ToString())}</summary><div data-kb-accordion-panel>", "</div></details>"),
            _ => ("", "")
        };
        b.Append(open); foreach (var child in node.Children) RenderNode(child, b); b.Append(close);
    }

    private static string OpenBlock(Node node, string tag, string? additionalAttributes = null)
    {
        var direction = node.Attributes?.GetValueOrDefault("dir") as string;
        var language = node.Attributes?.GetValueOrDefault("lang") as string;
        var id = node.Attributes?.GetValueOrDefault("id") as string;
        var style = node.Attributes?.GetValueOrDefault("legacyStyle") as string;
        return $"<{tag}{(direction is "rtl" or "ltr" ? $" dir=\"{direction}\"" : string.Empty)}" +
               $"{(language is not null ? $" lang=\"{WebUtility.HtmlEncode(language)}\"" : string.Empty)}" +
               $"{(id is not null ? $" id=\"{WebUtility.HtmlEncode(id)}\"" : string.Empty)}" +
               $"{(style is not null ? $" style=\"{WebUtility.HtmlEncode(style)}\"" : string.Empty)}{additionalAttributes}>";
    }

    private static string MediaHtmlAttributes(Node node)
    {
        var result = new StringBuilder();
        if (node.Attributes?.GetValueOrDefault("mediaId") is string id && Guid.TryParse(id, out _))
            result.Append(" data-media-id=\"").Append(WebUtility.HtmlEncode(id)).Append('"');
        var styles = new List<string>();
        foreach (var (attribute, property) in new[] { ("width", "width"), ("height", "height"),
                     ("minwidth", "min-width"), ("maxwidth", "max-width"), ("minheight", "min-height"), ("maxheight", "max-height") })
            if (node.Attributes?.GetValueOrDefault(attribute) is string value) styles.Add($"{property}:{value}");
        if (node.Attributes?.GetValueOrDefault("legacyStyle") is string legacy && legacy.Length > 0) styles.Add(legacy);
        if (node.Attributes?.GetValueOrDefault("alignment") is string alignment)
        {
            if (alignment == "center") styles.Add("display:block;margin-left:auto;margin-right:auto");
            else if (alignment == "right") styles.Add("display:block;margin-left:auto");
            else if (alignment == "left") styles.Add("display:block;margin-right:auto");
        }
        if (styles.Count > 0) result.Append(" style=\"").Append(WebUtility.HtmlEncode(string.Join(';', styles))).Append('"');
        return result.ToString();
    }

    private static string RenderTableOpen(Node node)
    {
        var attributes = new StringBuilder("<table");
        var styles = new List<string>();
        if (node.Attributes?.GetValueOrDefault("dir") is string direction && direction is "rtl" or "ltr")
            attributes.Append(" dir=\"").Append(direction).Append('"');
        if (AttributeInt(node, "tableWidthPx", 0) is > 0 and var pixels)
        {
            attributes.Append(" data-table-width-px=\"").Append(pixels).Append('"');
            styles.Add($"width:{pixels}px"); styles.Add("max-width:100%");
        }
        else if (node.Attributes?.GetValueOrDefault("tableWidthPct") is { } percentage)
        {
            attributes.Append(" data-table-width-pct=\"").Append(EInvariant(percentage)).Append('"');
            styles.Add($"width:{EInvariant(percentage)}%");
        }
        else if (node.Attributes?.GetValueOrDefault("tableWidth") is string tableWidth)
        {
            attributes.Append(" data-table-width=\"").Append(WebUtility.HtmlEncode(tableWidth)).Append('"');
            styles.Add($"width:{tableWidth}");
        }
        if (node.Attributes?.GetValueOrDefault("legacyStyle") is string legacyStyle) styles.Add(legacyStyle);
        if (styles.Count > 0) attributes.Append(" style=\"").Append(WebUtility.HtmlEncode(string.Join(';', styles))).Append('"');
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
        if (node.Attributes?.GetValueOrDefault("dir") is string direction && direction is "rtl" or "ltr")
            result.Append(" dir=\"").Append(direction).Append('"');
        var colspan = AttributeInt(node, "colspan", 1);
        var rowspan = AttributeInt(node, "rowspan", 1);
        var widths = AttributeWidths(node);
        if (colspan > 1) result.Append(" colspan=\"").Append(colspan).Append('"');
        if (rowspan > 1) result.Append(" rowspan=\"").Append(rowspan).Append('"');
        if (widths.Length > 0) result.Append(" colwidth=\"").Append(string.Join(',', widths)).Append('"');
        var styles = new List<string>();
        if (node.Attributes?.GetValueOrDefault("cellWidth") is { } cellWidth) styles.Add($"width:{cellWidth};");
        else if (widths.Length > 0) styles.Add($"width:{widths.Sum()}px;");
        if (node.Attributes?.GetValueOrDefault("backgroundColor") is { } background) styles.Add($"background-color:{background};");
        if (node.Attributes?.GetValueOrDefault("verticalAlign") is { } vertical) styles.Add($"vertical-align:{vertical};");
        if (node.Attributes?.GetValueOrDefault("border") is { } border) styles.Add($"border:{border};");
        if (node.Attributes?.GetValueOrDefault("legacyStyle") is string legacyStyle) styles.Add(legacyStyle);
        if (styles.Count > 0) result.Append(" style=\"").Append(WebUtility.HtmlEncode(string.Join(' ', styles))).Append('"');
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
    private static string PlainText(Node root) { var b = new StringBuilder(); Visit(root); return b.ToString().Trim(); void Visit(Node n) { if (n.Type == "tabItem" && n.Attributes?["label"] is { } label) b.AppendLine(label.ToString()); if (n.Type == "accordionItem" && n.Attributes?["title"] is { } title) b.AppendLine(title.ToString()); if (n.Type == "attachment" && n.Attributes?["fileName"] is { } fileName) b.AppendLine(fileName.ToString()); if (n.Type == "glossary" && n.Attributes?["term"] is { } term) b.Append(term.ToString()); if (n.Text is not null) b.Append(n.Text); foreach (var c in n.Children) Visit(c); if (n.Type is "paragraph" or "heading" or "listItem" or "blockquote" or "codeBlock" or "tableRow") b.AppendLine(); } }

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
        public string OpenHtml() => Type switch { "bold" => "<strong>", "italic" => "<em>", "underline" => "<u>", "strike" => "<s>", "superscript" => "<sup>", "subscript" => "<sub>", "code" => "<code>", "link" => $"<a href=\"{WebUtility.HtmlEncode(Attrs?["href"]?.ToString())}\" rel=\"noopener noreferrer nofollow\">", "textStyle" => $"<span style=\"{TextStyleCss()}\">", "highlight" => $"<mark style=\"background-color:{WebUtility.HtmlEncode(Attrs?["color"]?.ToString())};\">", _ => "" };
        public string CloseHtml() => Type switch { "bold" => "</strong>", "italic" => "</em>", "underline" => "</u>", "strike" => "</s>", "superscript" => "</sup>", "subscript" => "</sub>", "code" => "</code>", "link" => "</a>", "textStyle" => "</span>", "highlight" => "</mark>", _ => "" };
        private string TextStyleCss() => string.Join(' ', new[]
        {
            Attrs?.GetValueOrDefault("fontFamily") is { } family ? $"font-family:{family};" : null,
            Attrs?.GetValueOrDefault("fontSize") is { } size ? $"font-size:{size};" : null,
            Attrs?.GetValueOrDefault("color") is { } color ? $"color:{color};" : null,
            Attrs?.GetValueOrDefault("lineHeight") is { } lineHeight ? $"line-height:{lineHeight};" : null,
            Attrs?.GetValueOrDefault("legacyStyle") is { } legacyStyle ? legacyStyle.ToString() : null
        }.Where(value => value is not null).Select(WebUtility.HtmlEncode));
    }

    [GeneratedRegex(@"<!--[\s\S]*?-->|<![^>]*>|</?[^>]+>|[^<]+", RegexOptions.Compiled)] private static partial Regex TokenRegex();
    [GeneratedRegex(@"^<\s*(/)?\s*([a-zA-Z0-9:-]+)([\s\S]*?)/?\s*>$", RegexOptions.Compiled)] private static partial Regex TagRegex();
    [GeneratedRegex("""([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))""", RegexOptions.Compiled)] private static partial Regex AttributeRegex();
    [GeneratedRegex(@"\s+", RegexOptions.Compiled)] private static partial Regex WhitespaceRegex();
    [GeneratedRegex(@"^(\d+(?:\.\d+)?)(%|px|in|cm|mm|pt|pc|em|rem)?$", RegexOptions.Compiled | RegexOptions.IgnoreCase)] private static partial Regex CssLengthRegex();
    [GeneratedRegex(@"^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$", RegexOptions.Compiled | RegexOptions.IgnoreCase)] private static partial Regex HexColorRegex();
    [GeneratedRegex(@"^(rgb)(a)?\(([^)]*)\)$", RegexOptions.Compiled | RegexOptions.IgnoreCase)] private static partial Regex RgbColorRegex();
    [GeneratedRegex(@"^hsl(a)?\(([^)]*)\)$", RegexOptions.Compiled | RegexOptions.IgnoreCase)] private static partial Regex HslColorRegex();
}
