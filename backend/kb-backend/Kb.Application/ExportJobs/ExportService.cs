using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Kb.Application.Abstractions;
using Kb.Application.Abstractions.Storage;
using Kb.Application.Exceptions;
using Kb.Domain.Constants;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Kb.Application.ExportJobs;

public sealed class ExportService(
    IExportJobRepository repository,
    IObjectStorage storage,
    ICurrentUser currentUser,
    IAdminChecker adminChecker,
    IOptions<ExportOptions> options,
    TimeProvider timeProvider,
    IExportJobSignal jobSignal,
    ILogger<ExportService> logger)
{
    public async Task<ExportJobData> RequestArticleAsync(Guid articleId, ExportArticleSource source,
        string exportType,
        CancellationToken cancellationToken)
    {
        EnsureRequest(articleId, exportType);
        var job = await repository.CreateArticleAsync(articleId, source, NormalizeType(exportType), UserId(),
            timeProvider.GetUtcNow().UtcDateTime, cancellationToken);
        jobSignal.Notify();
        logger.LogInformation("Requested {ExportType} article export job {ExportJobId} for article {ArticleId}",
            job.ExportType, job.Id, articleId);
        return job;
    }

    public async Task<ExportJobData> RequestCategoryAsync(Guid categoryId, string exportType,
        CancellationToken cancellationToken, string? localeCode = null)
    {
        EnsureRequest(categoryId, exportType);
        var job = await repository.CreateCategoryAsync(categoryId, NormalizeType(exportType), UserId(),
            timeProvider.GetUtcNow().UtcDateTime, cancellationToken, localeCode);
        jobSignal.Notify();
        logger.LogInformation("Requested {ExportType} category export job {ExportJobId} for category {CategoryId}",
            job.ExportType, job.Id, categoryId);
        return job;
    }

    public async Task<ExportJobData> GetAsync(Guid jobId, CancellationToken cancellationToken)
    {
        if (jobId == Guid.Empty) throw new BusinessRuleException("Export job ID must not be empty.");
        var job = await repository.GetAsync(jobId, cancellationToken)
            ?? throw new NotFoundException("The export job was not found.");
        await EnsureCanAccessAsync(job, cancellationToken);
        return job;
    }

    public async Task<ExportDownloadData> DownloadAsync(Guid jobId, CancellationToken cancellationToken)
    {
        var job = await GetAsync(jobId, cancellationToken);
        if (job.Status != JobStatuses.Completed || string.IsNullOrWhiteSpace(job.ResultPath))
            throw new ConflictException("The export is not ready for download.");
        try
        {
            var content = await storage.DownloadAsync(options.Value.ContainerName, job.ResultPath,
                cancellationToken);
            return new(content, job.ExportType == ExportTypes.Pdf ? "application/pdf" :
                "text/html; charset=utf-8", job.FileName);
        }
        catch (Exception exception) when (exception is not ApplicationExceptionBase)
        {
            throw new ExternalServiceException("The completed export could not be read from storage.", exception);
        }
    }

    private async Task EnsureCanAccessAsync(ExportJobData job, CancellationToken cancellationToken)
    {
        var userId = UserId();
        if (!await repository.IsActiveUserAsync(userId, cancellationToken))
            throw new ForbiddenException("The authenticated user is not active.");
        if (job.RequestedById != userId && !await adminChecker.IsAdminAsync(userId, cancellationToken))
            throw new ForbiddenException("You cannot access another user's export.");
    }

    private Guid UserId()
    {
        if (!currentUser.IsAuthenticated) throw new UnauthorizedAccessException();
        return currentUser.UserId;
    }

    private static void EnsureRequest(Guid id, string exportType)
    {
        if (id == Guid.Empty) throw new BusinessRuleException("Export target ID must not be empty.");
        if (string.IsNullOrWhiteSpace(exportType) || !ExportTypes.All.Contains(exportType))
            throw new BusinessRuleException("Export type must be PDF or HTML.");
    }

    private static string NormalizeType(string value) =>
        value.Equals(ExportTypes.Pdf, StringComparison.OrdinalIgnoreCase) ? ExportTypes.Pdf : ExportTypes.Html;
}

public sealed class ExportJobProcessor(
    IExportJobRepository repository,
    ExportDocumentBuilder documentBuilder,
    IPdfRenderer pdfRenderer,
    IObjectStorage storage,
    IOptions<ExportOptions> options,
    TimeProvider timeProvider,
    ILogger<ExportJobProcessor> logger)
{
    public async Task<bool> ProcessNextAsync(CancellationToken cancellationToken)
    {
        var job = await repository.ClaimNextAsync(timeProvider.GetUtcNow().UtcDateTime,
            options.Value.JobTimeout, cancellationToken);
        if (job is null) return false;
        logger.LogInformation("Processing {ExportType} export job {ExportJobId} for {EntityType}",
            job.ExportType, job.Id, job.EntityType);
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(options.Value.JobTimeout);
        var processingToken = timeout.Token;
        try
        {
            var snapshot = JsonSerializer.Deserialize<ExportSnapshot>(job.SnapshotJson,
                new JsonSerializerOptions(JsonSerializerDefaults.Web))
                ?? throw new InvalidOperationException("The export snapshot is invalid.");
            var html = await documentBuilder.BuildAsync(snapshot, processingToken);
            await using var content = job.ExportType == ExportTypes.Pdf
                ? await pdfRenderer.RenderAsync(html, processingToken)
                : new MemoryStream(Encoding.UTF8.GetBytes(html), writable: false);
            var objectName = $"{job.RequestedAt:yyyy/MM/dd}/{job.Id:D}/{job.FileName}";
            var path = await storage.UploadAsync(options.Value.ContainerName, objectName, content,
                job.ExportType == ExportTypes.Pdf ? "application/pdf" : "text/html; charset=utf-8",
                processingToken);
            await repository.CompleteAsync(job.Id, path, timeProvider.GetUtcNow().UtcDateTime,
                processingToken);
            logger.LogInformation("Completed export job {ExportJobId}", job.Id);
            return true;
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "Export job {ExportJobId} failed", job.Id);
            try
            {
                await repository.FailAsync(job.Id, SafeError(exception, options.Value.JobTimeout),
                    timeProvider.GetUtcNow().UtcDateTime, CancellationToken.None);
            }
            catch (Exception stateException)
            {
                logger.LogCritical(stateException, "Export job {ExportJobId} could not be marked failed", job.Id);
            }
            return true;
        }
    }

    private static string SafeError(Exception exception, TimeSpan timeout) => exception switch
    {
        OperationCanceledException =>
            $"Export generation was cancelled or exceeded the {Math.Ceiling(timeout.TotalSeconds)} second limit.",
        FileNotFoundException => "Stored article content or media is missing.",
        InvalidDataException => "Stored article content is invalid.",
        InvalidOperationException => SafeMessage(exception.Message),
        _ => $"The export renderer or storage provider could not complete the export: {SafeMessage(exception.Message)}"
    };

    private static string SafeMessage(string message)
    {
        var value = Regex.Replace(message, @"\s+", " ").Trim();
        return string.IsNullOrWhiteSpace(value) ? "No diagnostic was returned." : value[..Math.Min(value.Length, 1000)];
    }
}

public sealed partial class ExportDocumentBuilder(
    IObjectStorage storage,
    IExportMediaResolver mediaResolver,
    IOptions<ExportOptions> options,
    ILogger<ExportDocumentBuilder> logger)
{
    public async Task<string> BuildAsync(ExportSnapshot snapshot, CancellationToken cancellationToken)
    {
        var bodies = new Dictionary<Guid, string>();
        foreach (var article in snapshot.Articles)
        {
            try
            {
                bodies[article.ArticleId] = await ReadArticleHtmlAsync(article, cancellationToken);
            }
            catch (Exception exception) when (snapshot.EntityType == ExportEntityTypes.Category)
            {
                logger.LogWarning(exception,
                    "Article {ArticleId} could not be rendered in category export {CategorySlug}",
                    article.ArticleId, snapshot.Slug);
                bodies[article.ArticleId] =
                    "<p class=\"media-missing\">This article could not be included because its stored content is unavailable.</p>";
            }
        }

        var body = new StringBuilder();
        body.Append("<header class=\"export-title\"><h1>").Append(E(snapshot.Title)).Append("</h1>")
            .Append("<p>Knowledge base export</p></header>");
        if (snapshot.EntityType == ExportEntityTypes.Category)
        {
            body.Append(BuildTableOfContents(snapshot));
            var root = snapshot.Categories.Single(category => category.Id ==
                snapshot.Categories.MinBy(category => category.Depth)!.Id);
            AppendCategory(body, root, snapshot, bodies, 1);
        }
        else
        {
            var article = snapshot.Articles.Single();
            AppendArticle(body, article, bodies[article.ArticleId], 1);
        }

        var locale = string.IsNullOrWhiteSpace(snapshot.LocaleCode) ? "en" : snapshot.LocaleCode;
        var direction = snapshot.IsRtl ? "rtl" : "ltr";
        return $"<!doctype html><html lang=\"{E(locale)}\" dir=\"{direction}\"><head><meta charset=\"utf-8\">" +
               "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">" +
               $"<title>{E(snapshot.Title)}</title><style>{Styles}</style></head><body>" + body +
               "</body></html>";
    }

    private async Task<string> ReadArticleHtmlAsync(ExportSnapshotArticle article,
        CancellationToken cancellationToken)
    {
        string html;
        if (!string.IsNullOrWhiteSpace(article.RenderedHtmlPath))
        {
            try { html = await ReadTextAsync(article.RenderedHtmlPath, cancellationToken); }
            catch (Exception) when (!cancellationToken.IsCancellationRequested)
            {
                html = await FallbackTextAsync(article, cancellationToken);
            }
        }
        else html = await FallbackTextAsync(article, cancellationToken);

        // Older rendered-HTML objects were produced before callouts had a static
        // renderer and silently omitted the node. The Tiptap JSON is canonical, so
        // repair those exports from JSON while leaving unaffected historical HTML
        // (and its richer custom-node rendering) untouched.
        if (!html.Contains("kb-callout", StringComparison.OrdinalIgnoreCase))
        {
            var canonical = await TryRenderCalloutDocumentAsync(article.ContentJsonPath, cancellationToken);
            if (canonical is not null) html = canonical;
        }

        html = ScriptRegex().Replace(html, string.Empty);
        html = EventAttributeRegex().Replace(html, string.Empty);
        html = DetailsRegex().Replace(html, match => match.Value.Contains(" open", StringComparison.OrdinalIgnoreCase)
            ? match.Value : match.Value.Insert(match.Value.Length - 1, " open"));
        html = await InlineMediaAsync(html, cancellationToken);
        html = UrlAttributeRegex().Replace(html, match => SafeUrlAttribute(match));
        html = DataAttributeRegex().Replace(html, string.Empty);
        return html;
    }

    private async Task<string> InlineMediaAsync(string html, CancellationToken cancellationToken)
    {
        foreach (Match match in MediaTagRegex().Matches(html))
        {
            if (!Guid.TryParse(match.Groups["id"].Value, out var mediaId)) continue;
            ExportMediaData? media = null;
            try { media = await mediaResolver.ResolveAsync(mediaId, options.Value.MaxEmbeddedMediaBytes,
                cancellationToken); }
            catch (Exception exception) { logger.LogWarning(exception, "Media {MediaId} could not be embedded", mediaId); }
            var replacement = match.Value;
            if (media is null)
            {
                replacement = SourceAttributeRegex().Replace(replacement, string.Empty) +
                              "<span class=\"media-missing\">Media unavailable</span>";
            }
            else
            {
                var uri = $"data:{media.MimeType};base64,{Convert.ToBase64String(media.Content)}";
                replacement = SourceAttributeRegex().IsMatch(replacement)
                    ? SourceAttributeRegex().Replace(replacement, m => $" {m.Groups["name"].Value}=\"{uri}\"")
                    : replacement.Insert(replacement.Length - 1,
                        $" {(match.Groups["tag"].Value.Equals("a", StringComparison.OrdinalIgnoreCase) ? "href" : "src")}=\"{uri}\"");
            }
            html = html.Replace(match.Value, replacement, StringComparison.Ordinal);
        }
        return html;
    }

    private async Task<string> FallbackTextAsync(ExportSnapshotArticle article, CancellationToken token)
    {
        try
        {
            var json = await ReadTextAsync(article.ContentJsonPath, token);
            using var document = JsonDocument.Parse(json);
            return RenderJsonNode(document.RootElement);
        }
        catch when (!string.IsNullOrWhiteSpace(article.PlainTextPath))
        {
            return $"<p>{E(await ReadTextAsync(article.PlainTextPath!, token)).Replace("\n", "<br>")}</p>";
        }
    }

    private async Task<string?> TryRenderCalloutDocumentAsync(string path, CancellationToken token)
    {
        try
        {
            var json = await ReadTextAsync(path, token);
            using var document = JsonDocument.Parse(json);
            return ContainsNodeType(document.RootElement, "callout")
                ? RenderJsonNode(document.RootElement)
                : null;
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            logger.LogWarning(exception, "Canonical article JSON could not be checked for export callouts");
            return null;
        }
    }

    private static bool ContainsNodeType(JsonElement element, string nodeType)
    {
        if (element.ValueKind == JsonValueKind.Object)
        {
            if (StringProperty(element, "type") == nodeType) return true;
            foreach (var property in element.EnumerateObject())
                if (ContainsNodeType(property.Value, nodeType)) return true;
        }
        else if (element.ValueKind == JsonValueKind.Array)
            foreach (var child in element.EnumerateArray())
                if (ContainsNodeType(child, nodeType)) return true;
        return false;
    }

    private async Task<string> ReadTextAsync(string path, CancellationToken token)
    {
        await using var stream = await storage.DownloadAsync(options.Value.ArticleContentContainerName, path, token);
        using var reader = new StreamReader(stream, Encoding.UTF8, true);
        return await reader.ReadToEndAsync(token);
    }

    private static string RenderJsonNode(JsonElement node)
    {
        if (node.ValueKind != JsonValueKind.Object) return string.Empty;
        var type = StringProperty(node, "type") ?? string.Empty;
        var content = node.TryGetProperty("content", out var children) && children.ValueKind == JsonValueKind.Array
            ? string.Concat(children.EnumerateArray().Select(RenderJsonNode)) : string.Empty;
        if (type == "text")
        {
            var value = E(StringProperty(node, "text") ?? string.Empty);
            if (!node.TryGetProperty("marks", out var marks) || marks.ValueKind != JsonValueKind.Array) return value;
            foreach (var mark in marks.EnumerateArray())
            {
                var markType = StringProperty(mark, "type");
                value = markType switch
                {
                    "bold" => $"<strong>{value}</strong>",
                    "italic" => $"<em>{value}</em>",
                    "underline" => $"<u>{value}</u>",
                    "strike" => $"<s>{value}</s>",
                    "code" => $"<code>{value}</code>",
                    "subscript" => $"<sub>{value}</sub>",
                    "superscript" => $"<sup>{value}</sup>",
                    "highlight" => $"<mark>{value}</mark>",
                    "link" when Attributes(mark) is { } link && StringProperty(link, "href") is { } href =>
                        $"<a href=\"{E(href)}\">{value}</a>",
                    "textStyle" when Attributes(mark) is { } textStyle &&
                        SafeCssColor(StringProperty(textStyle, "color")) is { } color =>
                        $"<span style=\"color:{E(color)};\">{value}</span>",
                    _ => value
                };
            }
            return value;
        }

        var attrs = Attributes(node);
        return type switch
        {
            "doc" => content,
            "paragraph" => $"<p{RenderLegacyAttributes(attrs)}>{content}</p>",
            "heading" => $"<h{Math.Clamp(IntProperty(attrs, "level") ?? 2, 1, 6)}{RenderLegacyAttributes(attrs)}>{content}</h{Math.Clamp(IntProperty(attrs, "level") ?? 2, 1, 6)}>",
            "hardBreak" => "<br>",
            "horizontalRule" => "<hr>",
            "blockquote" => $"<blockquote>{content}</blockquote>",
            "codeBlock" => $"<pre><code>{content}</code></pre>",
            "bulletList" => $"<ul>{content}</ul>",
            "orderedList" => $"<ol{(IntProperty(attrs, "start") is { } start && start != 1 ? $" start=\"{start}\"" : string.Empty)}>{content}</ol>",
            "listItem" or "taskItem" => $"<li>{content}</li>",
            "taskList" => $"<ul class=\"task-list\">{content}</ul>",
            "table" => $"<table{RenderTableWidth(attrs)}><tbody>{content}</tbody></table>",
            "tableRow" => $"<tr>{content}</tr>",
            "tableHeader" => $"<th{RenderCellAttributes(attrs)}>{content}</th>",
            "tableCell" => $"<td{RenderCellAttributes(attrs)}>{content}</td>",
            "callout" => RenderJsonCallout(attrs, content),
            "tabs" => $"<div class=\"kb-tabs\">{content}</div>",
            "tabItem" => $"<section class=\"kb-tabs__static-item\"><h3>{E(StringProperty(attrs, "label") ?? "Tab")}</h3>{content}</section>",
            "accordion" => $"<div class=\"kb-accordion\">{content}</div>",
            "accordionItem" => $"<details open><summary>{E(StringProperty(attrs, "title") ?? "Section")}</summary>{content}</details>",
            "image" or "blockImage" or "inlineImage" => RenderJsonImage(attrs),
            "video" => RenderJsonVideo(attrs),
            "documentEmbed" => RenderJsonDocumentEmbed(attrs),
            "externalEmbed" => RenderJsonExternalEmbed(attrs),
            "glossary" => $"<span class=\"kb-glossary\" title=\"{E(StringProperty(attrs, "definition") ?? string.Empty)}\">{E(StringProperty(attrs, "term") ?? string.Empty)}</span>",
            "attachment" => RenderJsonAttachment(attrs),
            "youtube" => RenderJsonYoutube(attrs),
            _ => content
        };
    }

    private static string RenderTableWidth(JsonElement? attrs)
    {
        if (IntProperty(attrs, "tableWidthPx") is { } pixels and >= 25 and <= 4000)
            return $" style=\"width:{pixels}px;max-width:100%;\"";
        if (NumberProperty(attrs, "tableWidthPct") is { } percentage and >= 10 and <= 100)
            return $" style=\"width:{percentage.ToString(System.Globalization.CultureInfo.InvariantCulture)}%;\"";
        if (SafeCssDimension(StringProperty(attrs, "tableWidth")) is { } width)
            return $" style=\"width:{E(width)};\"";
        return string.Empty;
    }

    private static string RenderCellAttributes(JsonElement? attrs)
    {
        var result = new StringBuilder();
        if (IntProperty(attrs, "colspan") is { } colspan and > 1 and <= 50)
            result.Append(" colspan=\"").Append(colspan).Append('"');
        if (IntProperty(attrs, "rowspan") is { } rowspan and > 1 and <= 50)
            result.Append(" rowspan=\"").Append(rowspan).Append('"');
        if (attrs is { ValueKind: JsonValueKind.Object } value &&
            value.TryGetProperty("colwidth", out var widths) && widths.ValueKind == JsonValueKind.Array)
        {
            var safeWidths = widths.EnumerateArray().Select(width => width.TryGetInt32(out var number) ? number : 0)
                .Where(width => width is >= 25 and <= 2000).ToArray();
            if (safeWidths.Length > 0)
                result.Append(" colwidth=\"").Append(string.Join(',', safeWidths))
                    .Append("\" style=\"width:").Append(safeWidths.Sum()).Append("px;\"");
        }
        return result.ToString();
    }

    private static string? SafeCssColor(string? value)
    {
        var color = value?.Trim() ?? string.Empty;
        return color.Length is > 0 and <= 120 &&
               Regex.IsMatch(color, @"^(?:#[0-9a-f]{3,8}|[a-z]+|rgba?\([0-9.%\s,/]+\)|hsla?\([-0-9.%\s,/]+\))$",
                   RegexOptions.IgnoreCase)
            ? color
            : null;
    }

    private static string RenderJsonCallout(JsonElement? attrs, string content)
    {
        var variant = NormalizeCalloutVariant(StringProperty(attrs, "variant"));
        var label = char.ToUpperInvariant(variant[0]) + variant[1..];
        return $"<aside class=\"kb-callout kb-callout--{variant}\" role=\"note\">" +
               $"<div class=\"kb-callout__header\"><span class=\"kb-callout__icon\" aria-hidden=\"true\"></span>" +
               $"<strong>{label}</strong></div><div class=\"kb-callout__content\">{content}</div></aside>";
    }

    private static string NormalizeCalloutVariant(string? value) => value?.ToLowerInvariant() switch
    {
        "warning" => "warning",
        "success" => "success",
        "danger" or "error" => "danger",
        "tip" => "tip",
        _ => "info"
    };

    private static string RenderJsonImage(JsonElement? attrs)
    {
        var src = E(StringProperty(attrs, "src") ?? string.Empty);
        var alt = E(StringProperty(attrs, "alt") ?? string.Empty);
        var mediaId = StringProperty(attrs, "mediaId");
        var media = Guid.TryParse(mediaId, out var id) ? $" data-media-id=\"{id:D}\"" : string.Empty;
        return $"<img src=\"{src}\" alt=\"{alt}\"{media}{RenderMediaDimensions(attrs)}>";
    }

    private static string RenderJsonVideo(JsonElement? attrs)
    {
        var src = E(StringProperty(attrs, "src") ?? string.Empty);
        var mediaId = StringProperty(attrs, "mediaId");
        var media = Guid.TryParse(mediaId, out var id) ? $" data-media-id=\"{id:D}\"" : string.Empty;
        return $"<video controls preload=\"metadata\" src=\"{src}\"{media}{RenderMediaDimensions(attrs)}></video>";
    }

    private static string RenderJsonDocumentEmbed(JsonElement? attrs)
    {
        var src = E(StringProperty(attrs, "src") ?? string.Empty);
        return $"<div class=\"kb-document-embed\"{RenderMediaDimensions(attrs)}><a href=\"{src}\">Open PDF document</a></div>";
    }

    private static string RenderJsonExternalEmbed(JsonElement? attrs)
    {
        var src = StringProperty(attrs, "src") ?? string.Empty;
        if (!Uri.TryCreate(src, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps ||
            !uri.Host.Equals("www.wizardshot.com", StringComparison.OrdinalIgnoreCase)) return string.Empty;
        return $"<div class=\"kb-external-embed\"{RenderMediaDimensions(attrs)}><a href=\"{E(src)}\">Open embedded tutorial</a></div>";
    }

    private static string RenderMediaDimensions(JsonElement? attrs)
    {
        var styles = new List<string>();
        foreach (var (attribute, property) in new[] { ("cssWidth", "width"), ("cssHeight", "height"),
                     ("width", "width"), ("height", "height"), ("minwidth", "min-width"),
                     ("maxwidth", "max-width"), ("minheight", "min-height"), ("maxheight", "max-height") })
            if (SafeCssDimension(StringProperty(attrs, attribute)) is { } value) styles.Add($"{property}:{value}");
        return styles.Count == 0 ? string.Empty : $" style=\"{E(string.Join(';', styles))}\"";
    }

    private static string? SafeCssDimension(string? value)
    {
        var dimension = value?.Trim().ToLowerInvariant() ?? string.Empty;
        return Regex.IsMatch(dimension, @"^(?:auto|0|\d+(?:\.\d+)?(?:%|px|pt|in|cm|mm|em|rem))$") ? dimension : null;
    }

    private static string RenderLegacyAttributes(JsonElement? attrs)
    {
        var result = new StringBuilder();
        if (StringProperty(attrs, "lang") is { } language && Regex.IsMatch(language, @"^[A-Za-z]{1,8}(?:-[A-Za-z0-9]{1,8})*$"))
            result.Append(" lang=\"").Append(E(language)).Append('"');
        if (StringProperty(attrs, "id") is { } id && Regex.IsMatch(id, @"^[A-Za-z][A-Za-z0-9_.:-]{0,127}$"))
            result.Append(" id=\"").Append(E(id)).Append('"');
        if (StringProperty(attrs, "legacyStyle") is { } style && style.Length <= 2000 &&
            !Regex.IsMatch(style, @"(?:expression|javascript:|vbscript:|@import|behavior|-moz-binding)", RegexOptions.IgnoreCase))
            result.Append(" style=\"").Append(E(style)).Append('"');
        return result.ToString();
    }

    private static string RenderJsonAttachment(JsonElement? attrs)
    {
        var src = E(StringProperty(attrs, "src") ?? string.Empty);
        var name = E(StringProperty(attrs, "fileName") ?? "Download attachment");
        var mediaId = StringProperty(attrs, "mediaId");
        var media = Guid.TryParse(mediaId, out var id) ? $" data-media-id=\"{id:D}\"" : string.Empty;
        return $"<a class=\"kb-attachment\" href=\"{src}\"{media}>{name}</a>";
    }

    private static string RenderJsonYoutube(JsonElement? attrs)
    {
        var src = E(StringProperty(attrs, "src") ?? string.Empty);
        return $"<iframe class=\"kb-youtube\" src=\"{src}\" title=\"Embedded video\"></iframe>";
    }

    private static JsonElement? Attributes(JsonElement node) =>
        node.ValueKind == JsonValueKind.Object && node.TryGetProperty("attrs", out var attrs) &&
        attrs.ValueKind == JsonValueKind.Object ? attrs : null;

    private static string? StringProperty(JsonElement? node, string name) =>
        node is { ValueKind: JsonValueKind.Object } value && value.TryGetProperty(name, out var property) &&
        property.ValueKind == JsonValueKind.String ? property.GetString() : null;

    private static int? IntProperty(JsonElement? node, string name) =>
        node is { ValueKind: JsonValueKind.Object } value && value.TryGetProperty(name, out var property) &&
        property.TryGetInt32(out var number) ? number : null;

    private static double? NumberProperty(JsonElement? node, string name) =>
        node is { ValueKind: JsonValueKind.Object } value && value.TryGetProperty(name, out var property) &&
        property.TryGetDouble(out var number) ? number : null;

    private static string BuildTableOfContents(ExportSnapshot snapshot)
    {
        var output = new StringBuilder("<nav class=\"toc\"><h2>Contents</h2>");
        var root = snapshot.Categories.MinBy(category => category.Depth)!;
        Append(root);
        output.Append("</nav>");
        return output.ToString();
        void Append(ExportSnapshotCategory category)
        {
            output.Append("<div class=\"toc-category\" style=\"margin-left:")
                .Append(Math.Max(0, category.Depth - root.Depth) * 18).Append("px\"><a href=\"#category-")
                .Append(Anchor(category.Slug)).Append("\">").Append(E(category.Name)).Append("</a></div>");
            foreach (var article in snapshot.Articles.Where(item => item.CategoryId == category.Id)
                         .OrderBy(item => item.Position).ThenBy(item => item.Title).ThenBy(item => item.ArticleId))
                output.Append("<div class=\"toc-article\" style=\"margin-left:")
                    .Append((category.Depth - root.Depth + 1) * 18).Append("px\"><a href=\"#article-")
                    .Append(Anchor(article.Slug)).Append("\">").Append(E(article.Title)).Append("</a></div>");
            foreach (var child in snapshot.Categories.Where(item => item.ParentId == category.Id)
                         .OrderBy(item => item.SortOrder).ThenBy(item => item.Name).ThenBy(item => item.Id)) Append(child);
        }
    }

    private static void AppendCategory(StringBuilder output, ExportSnapshotCategory category,
        ExportSnapshot snapshot, IReadOnlyDictionary<Guid, string> bodies, int level)
    {
        var heading = Math.Min(level + 1, 6);
        output.Append("<section class=\"category\" id=\"category-").Append(Anchor(category.Slug)).Append("\"><h")
            .Append(heading).Append('>').Append(E(category.Name)).Append("</h").Append(heading).Append('>');
        foreach (var article in snapshot.Articles.Where(item => item.CategoryId == category.Id)
                     .OrderBy(item => item.Position).ThenBy(item => item.Title).ThenBy(item => item.ArticleId))
            AppendArticle(output, article, bodies[article.ArticleId], heading);
        foreach (var child in snapshot.Categories.Where(item => item.ParentId == category.Id)
                     .OrderBy(item => item.SortOrder).ThenBy(item => item.Name).ThenBy(item => item.Id))
            AppendCategory(output, child, snapshot, bodies, level + 1);
        output.Append("</section>");
    }

    private static void AppendArticle(StringBuilder output, ExportSnapshotArticle article, string html, int level)
    {
        var heading = Math.Min(level + 1, 6);
        output.Append("<article id=\"article-").Append(Anchor(article.Slug)).Append("\" class=\"article\"><h")
            .Append(heading).Append('>').Append(E(article.Title)).Append("</h").Append(heading).Append('>')
            .Append("<div class=\"article-content\">").Append(html).Append("</div></article>");
    }

    private static string SafeUrlAttribute(Match match)
    {
        var name = match.Groups["name"].Value;
        var value = WebUtility.HtmlDecode(match.Groups["url"].Value).Trim();
        if (value.StartsWith("data:", StringComparison.OrdinalIgnoreCase) || value.StartsWith('#') ||
            value.StartsWith("mailto:", StringComparison.OrdinalIgnoreCase) ||
            (Uri.TryCreate(value, UriKind.Absolute, out var uri) && uri.Scheme is "http" or "https" &&
             !uri.AbsolutePath.StartsWith("/api/", StringComparison.OrdinalIgnoreCase) &&
             !uri.Query.Contains("token", StringComparison.OrdinalIgnoreCase)))
            return $" {name}=\"{WebUtility.HtmlEncode(value)}\"";
        return string.Empty;
    }

    private static string E(string value) => WebUtility.HtmlEncode(value);

    private static string Anchor(string value)
    {
        var safe = new string(value.ToLowerInvariant().Select(character =>
            char.IsLetterOrDigit(character) || character is '-' or '_' ? character : '-').ToArray()).Trim('-');
        return string.IsNullOrWhiteSpace(safe) ? "section" : safe;
    }

    private const string Styles = """
        @page { size: A4; margin: 18mm 16mm 20mm; }
        * { box-sizing: border-box; }
        body { max-width: 900px; margin: 0 auto; color: #20242a; font: 11pt/1.55 Arial, sans-serif; }
        .export-title { min-height: 55vh; display:flex; flex-direction:column; justify-content:center; text-align:center; page-break-after:always; }
        h1,h2,h3,h4,h5,h6 { color:#111827; line-height:1.25; break-after:avoid; }
        .toc { page-break-after:always; } .toc a { color:#1d4ed8; text-decoration:none; }
        .category { margin-top:2rem; } .article { margin-top:1.5rem; } .article + .article { page-break-before:always; }
        p,li,blockquote,pre,table,img,video { break-inside:avoid; }
        img,video { max-width:100%; height:auto; } table { border-collapse:collapse; width:100%; }
        th,td { border:1px solid #cbd5e1; padding:6px 8px; vertical-align:top; }
        pre,code { font-family:Consolas,monospace; } pre { white-space:pre-wrap; background:#f3f4f6; padding:12px; border-radius:5px; }
        blockquote { border-left:4px solid #94a3b8; margin-left:0; padding-left:14px; color:#475569; }
        details { border:1px solid #dbe2ea; border-radius:5px; padding:8px 12px; margin:8px 0; }
        details > summary { font-weight:700; } .kb-tabs__static-item { display:block!important; border:1px solid #dbe2ea; padding:10px; margin:8px 0; }
        .kb-tabs__static-item > h3 { display:block!important; } .media-missing { display:inline-block; padding:8px; color:#7f1d1d; background:#fef2f2; }
        .kb-callout { --callout-accent:#2563eb; --callout-bg:#eff6ff; break-inside:avoid; border:1px solid color-mix(in srgb,var(--callout-accent) 32%,white); border-left:5px solid var(--callout-accent); border-radius:7px; background:var(--callout-bg); margin:14px 0; padding:12px 14px; }
        .kb-callout--warning { --callout-accent:#d97706; --callout-bg:#fffbeb; } .kb-callout--success { --callout-accent:#15803d; --callout-bg:#f0fdf4; }
        .kb-callout--danger { --callout-accent:#b91c1c; --callout-bg:#fef2f2; } .kb-callout--tip { --callout-accent:#7e22ce; --callout-bg:#faf5ff; }
        .kb-callout__header { display:flex; align-items:center; gap:7px; color:var(--callout-accent); margin-bottom:6px; }
        .kb-callout__icon { display:inline-block; width:9px; height:9px; border-radius:50%; background:currentColor; flex:none; }
        .kb-callout__content > :first-child { margin-top:0; } .kb-callout__content > :last-child { margin-bottom:0; }
        a { color:#1d4ed8; overflow-wrap:anywhere; } @media print { body { max-width:none; } }
        """;

    [GeneratedRegex(@"<script\b[^>]*>[\s\S]*?</script\s*>", RegexOptions.IgnoreCase)] private static partial Regex ScriptRegex();
    [GeneratedRegex("""\s+on[a-z]+\s*=\s*["'][^"']*["']""", RegexOptions.IgnoreCase)] private static partial Regex EventAttributeRegex();
    [GeneratedRegex(@"<details\b[^>]*>", RegexOptions.IgnoreCase)] private static partial Regex DetailsRegex();
    [GeneratedRegex("""<(?<tag>img|video|a)\b(?=[^>]*\bdata-media-id\s*=\s*["'](?<id>[0-9a-f-]{36})["'])[^>]*>""", RegexOptions.IgnoreCase)] private static partial Regex MediaTagRegex();
    [GeneratedRegex("""\s+(?<name>src|href)\s*=\s*["'][^"']*["']""", RegexOptions.IgnoreCase)] private static partial Regex SourceAttributeRegex();
    [GeneratedRegex("""\s+(?<name>src|href)\s*=\s*["'](?<url>[^"']*)["']""", RegexOptions.IgnoreCase)] private static partial Regex UrlAttributeRegex();
    [GeneratedRegex("""\s+data-[a-z0-9_-]+(?:\s*=\s*["'][^"']*["'])?""", RegexOptions.IgnoreCase)] private static partial Regex DataAttributeRegex();
}
