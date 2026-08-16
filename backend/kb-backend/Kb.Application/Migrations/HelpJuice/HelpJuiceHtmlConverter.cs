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
        "ul", "ol", "li", "blockquote", "pre", "code", "table", "thead", "tbody", "tfoot", "tr", "th", "td",
        "img", "figure", "figcaption", "div", "span", "article", "section", "hr", "iframe", "video", "source",
        "s", "strike", "del", "sup", "sub", "font", "o:p", "o:lock", "v:stroke", "v:path", "v:f",
        "v:formulas", "v:imagedata", "v:shape", "v:shapetype", "w:wrap"
    };
    private static readonly HashSet<string> DropWithContent = new(StringComparer.OrdinalIgnoreCase)
        { "script", "style", "object", "embed", "form", "noscript", "template", "svg", "math" };
    private static readonly HashSet<string> VoidTags = new(StringComparer.OrdinalIgnoreCase)
        { "br", "img", "hr", "source", "meta", "link", "input", "o:lock", "v:stroke", "v:path", "v:f", "v:imagedata", "w:wrap" };
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
        var marks = new Stack<Mark>();
        var droppedDepth = 0;

        foreach (Match token in TokenRegex().Matches(sourceHtml ?? string.Empty))
        {
            if (token.Value.StartsWith("<!--", StringComparison.Ordinal) || token.Value.StartsWith("<!", StringComparison.Ordinal))
                continue;
            if (!token.Value.StartsWith('<'))
            {
                if (droppedDepth == 0) AddText(stack.Peek(), WebUtility.HtmlDecode(token.Value), marks.Reverse().ToArray());
                continue;
            }
            var parsed = ParseTag(token.Value);
            if (parsed is null) continue;
            var (name, closing, attrs, selfClosing) = parsed.Value;
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
                if (name is "strong" or "b" or "em" or "i" or "u" or "a" or "code" or "s" or "strike" or "del" or "sup" or "sub" or "font")
                {
                    if (marks.Count > 0) marks.Pop();
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
            if (name is "strong" or "b") { marks.Push(new("bold")); continue; }
            if (name is "em" or "i") { marks.Push(new("italic")); continue; }
            if (name == "u") { marks.Push(new("underline")); continue; }
            if (name is "s" or "strike" or "del") { marks.Push(new("strike")); continue; }
            if (name == "sup") { marks.Push(new("superscript")); continue; }
            if (name == "sub") { marks.Push(new("subscript")); continue; }
            if (name == "font") { marks.Push(LegacyFontMark(attrs)); continue; }
            if (name == "code" && stack.Peek().Type != "codeBlock") { marks.Push(new("code")); continue; }
            if (name == "a")
            {
                var href = attrs.GetValueOrDefault("href");
                var rewritten = href is null ? null : resolveLink?.Invoke(href);
                if (rewritten?.WarningCode is not null)
                    Warn(rewritten.WarningCode, rewritten.WarningMessage ?? "A HelpJuice link could not be rewritten safely.");
                if (TrySafeUrl(rewritten?.Url ?? href, allowRelative: true, out var safe))
                    marks.Push(new("link", new() { ["href"] = safe, ["target"] = "_blank", ["rel"] = "noopener noreferrer nofollow" }));
                else
                {
                    marks.Push(new("invalidLink"));
                    if (!string.IsNullOrWhiteSpace(href))
                        Warn("DANGEROUS_URL_REMOVED", "A link with an unsafe URL was converted to text.");
                }
                continue;
            }
            if (name == "br") { stack.Peek().Children.Add(new("hardBreak")); continue; }
            if (name == "hr") { stack.Peek().Children.Add(new("horizontalRule")); continue; }
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
                var src = attrs.GetValueOrDefault("src");
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

            var node = CreateNode(name, attrs, Warn);
            if (node is null) continue;
            stack.Peek().Children.Add(node);
            if (!selfClosing && !VoidTags.Contains(name)) stack.Push(node);
        }
        while (stack.Count > 1) stack.Pop();
        Normalize(root);
        var json = root.ToJson().ToJsonString(new JsonSerializerOptions { Encoder = JavaScriptEncoder.Default });
        return new(json, Render(root), PlainText(root), warnings.Distinct().ToArray(), mediaSources.Distinct().ToArray());

        void Warn(string code, string message) => warnings.Add((code, message));
    }

    private static Node? CreateNode(string tag, Dictionary<string, string> attrs, Action<string, string> warning)
    {
        return tag.ToLowerInvariant() switch
        {
            "p" => WithDirection(new("paragraph", tag), attrs),
            "h1" or "h2" or "h3" or "h4" or "h5" or "h6" => WithDirection(new("heading", tag) { Attributes = new() { ["level"] = int.Parse(tag[1..]) } }, attrs),
            "ul" => WithDirection(new("bulletList", tag), attrs),
            "ol" => WithDirection(new("orderedList", tag) { Attributes = new() { ["start"] = ParsePositive(attrs.GetValueOrDefault("start"), 1) } }, attrs),
            "li" => WithDirection(new("listItem", tag), attrs),
            "blockquote" => WithDirection(new("blockquote", tag), attrs),
            "pre" => new("codeBlock", tag),
            "table" => WithDirection(new("table", tag), attrs),
            "tr" => new("tableRow", tag),
            "th" => WithDirection(new("tableHeader", tag) { Attributes = CellAttrs(attrs) }, attrs),
            "td" => WithDirection(new("tableCell", tag) { Attributes = CellAttrs(attrs) }, attrs),
            "div" or "span" or "figure" or "figcaption" or "thead" or "tbody" or "tfoot" or "article" or "section" or
                "o:p" or "o:lock" or "v:stroke" or "v:path" or "v:f" or "v:formulas" or "v:shape" or "v:shapetype" or "w:wrap" => new("fragment", tag),
            _ => null
        };
    }

    private static Mark LegacyFontMark(IReadOnlyDictionary<string, string> attrs)
    {
        var values = new Dictionary<string, object?>();
        var face = attrs.GetValueOrDefault("face")?.Trim();
        if (!string.IsNullOrWhiteSpace(face) && face.Length <= 160 && face.All(ch => !char.IsControl(ch) && ch is not ';' and not '<' and not '>'))
            values["fontFamily"] = face;
        var color = attrs.GetValueOrDefault("color")?.Trim();
        if (!string.IsNullOrWhiteSpace(color) && SafeCssColorRegex().IsMatch(color)) values["color"] = color;
        if (int.TryParse(attrs.GetValueOrDefault("size"), out var size) && size is >= 1 and <= 7)
            values["fontSize"] = new[] { "10px", "13px", "16px", "18px", "24px", "32px", "48px" }[size - 1];
        return values.Count == 0 ? new("passthrough") : new("textStyle", values);
    }
    private static Dictionary<string, object?> CellAttrs(Dictionary<string, string> attrs) => new()
        { ["colspan"] = ParsePositive(attrs.GetValueOrDefault("colspan"), 1), ["rowspan"] = ParsePositive(attrs.GetValueOrDefault("rowspan"), 1) };
    private static Node WithDirection(Node node, IReadOnlyDictionary<string, string> attrs)
    {
        var direction = attrs.GetValueOrDefault("dir")?.ToLowerInvariant();
        if (direction is "rtl" or "ltr") (node.Attributes ??= [])["dir"] = direction;
        return node;
    }
    private static int ParsePositive(string? value, int fallback) => int.TryParse(value, out var number) && number > 0 ? Math.Min(number, 100) : fallback;

    private static void AddText(Node parent, string value, IReadOnlyList<Mark> marks)
    {
        if (string.IsNullOrEmpty(value)) return;
        var normalized = parent.Type is "codeBlock" ? value : WhitespaceRegex().Replace(value, " ");
        if (normalized.Length == 0) return;
        parent.Children.Add(new("text") { Text = normalized, Marks = marks.Where(mark => mark.Type is not ("invalidLink" or "passthrough")).ToList() });
    }

    private static void Normalize(Node node)
    {
        foreach (var child in node.Children.ToArray()) Normalize(child);
        for (var i = node.Children.Count - 1; i >= 0; i--)
        {
            var child = node.Children[i];
            if (child.Type == "fragment") { node.Children.RemoveAt(i); node.Children.InsertRange(i, child.Children); }
        }
        if (node.Type == "doc" && node.Children.Count == 0) node.Children.Add(new("paragraph"));
        if (node.Type == "doc") WrapInlineRuns(node);
        if (node.Type is "listItem" or "tableCell" or "tableHeader" && node.Children.Count == 0) node.Children.Add(new("paragraph"));
        if (node.Type == "listItem" && node.Children.FirstOrDefault()?.Type is not ("paragraph" or "heading"))
        { var paragraph = new Node("paragraph"); while (node.Children.Count > 0 && node.Children[0].Type is not ("bulletList" or "orderedList")) { paragraph.Children.Add(node.Children[0]); node.Children.RemoveAt(0); } node.Children.Insert(0, paragraph); }
        if (node.Type is "tableCell" or "tableHeader") WrapInlineRuns(node);
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
            "table" => ("<table>", "</table>"), "tableRow" => ("<tr>", "</tr>"), "tableHeader" => ("<th>", "</th>"), "tableCell" => ("<td>", "</td>"),
            "hardBreak" => ("<br>", ""), "horizontalRule" => ("<hr>", ""),
            "image" => ($"<img src=\"{WebUtility.HtmlEncode(node.Attributes?["src"]?.ToString())}\" alt=\"{WebUtility.HtmlEncode(node.Attributes?["alt"]?.ToString())}\"{(node.Attributes?["mediaId"] is string id ? $" data-media-id=\"{id}\"" : "")}>", ""),
            "youtube" => ($"<div data-youtube-video><iframe src=\"{WebUtility.HtmlEncode(node.Attributes?["src"]?.ToString())}\" allowfullscreen></iframe></div>", ""),
            "video" => ($"<video src=\"{WebUtility.HtmlEncode(node.Attributes?["src"]?.ToString())}\" data-media-id=\"{WebUtility.HtmlEncode(node.Attributes?["mediaId"]?.ToString())}\" controls preload=\"metadata\"></video>", ""),
            _ => ("", "")
        };
        b.Append(open); foreach (var child in node.Children) RenderNode(child, b); b.Append(close);
    }
    private static string PlainText(Node root) { var b = new StringBuilder(); Visit(root); return b.ToString().Trim(); void Visit(Node n) { if (n.Text is not null) b.Append(n.Text); foreach (var c in n.Children) Visit(c); if (n.Type is "paragraph" or "heading" or "listItem" or "blockquote" or "codeBlock" or "tableRow") b.AppendLine(); } }

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
            if (key.StartsWith("on", StringComparison.OrdinalIgnoreCase) || key is "style" or "srcdoc") continue;
            attrs[key] = WebUtility.HtmlDecode(attr.Groups[2].Success ? attr.Groups[2].Value : attr.Groups[3].Success ? attr.Groups[3].Value : attr.Groups[4].Value);
        }
        return (match.Groups[2].Value.ToLowerInvariant(), match.Groups[1].Success, attrs, token.EndsWith("/>", StringComparison.Ordinal));
    }

    private sealed class Node(string type, string? sourceTag = null)
    {
        public string Type { get; } = type; public string SourceTag { get; } = sourceTag ?? type;
        public string? Text { get; set; } public List<Node> Children { get; } = [];
        public List<Mark> Marks { get; set; } = []; public Dictionary<string, object?>? Attributes { get; set; }
        public JsonObject ToJson() { var o = new JsonObject { ["type"] = Type }; if (Text is not null) o["text"] = Text; if (Attributes?.Count > 0) o["attrs"] = JsonSerializer.SerializeToNode(Attributes); if (Marks.Count > 0) o["marks"] = new JsonArray(Marks.Select(m => m.ToJson()).ToArray()); if (Children.Count > 0) o["content"] = new JsonArray(Children.Select(c => c.ToJson()).ToArray()); return o; }
    }
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
    [GeneratedRegex(@"^(?:#[0-9a-fA-F]{3,8}|[a-zA-Z]{1,32}|rgba?\(\s*[0-9.%\s,]+\)|hsla?\(\s*[0-9.%\s,]+\))$", RegexOptions.Compiled)] private static partial Regex SafeCssColorRegex();
}
