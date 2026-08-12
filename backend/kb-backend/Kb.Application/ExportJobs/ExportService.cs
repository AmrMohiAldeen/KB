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
    ILogger<ExportService> logger)
{
    public async Task<ExportJobData> RequestArticleAsync(Guid articleId, string exportType,
        CancellationToken cancellationToken)
    {
        EnsureRequest(articleId, exportType);
        var job = await repository.CreateArticleAsync(articleId, NormalizeType(exportType), UserId(),
            timeProvider.GetUtcNow().UtcDateTime, cancellationToken);
        logger.LogInformation("Requested {ExportType} article export job {ExportJobId} for article {ArticleId}",
            job.ExportType, job.Id, articleId);
        return job;
    }

    public async Task<ExportJobData> RequestCategoryAsync(Guid categoryId, string exportType,
        CancellationToken cancellationToken)
    {
        EnsureRequest(categoryId, exportType);
        var job = await repository.CreateCategoryAsync(categoryId, NormalizeType(exportType), UserId(),
            timeProvider.GetUtcNow().UtcDateTime, cancellationToken);
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
        var job = await repository.ClaimNextAsync(timeProvider.GetUtcNow().UtcDateTime, cancellationToken);
        if (job is null) return false;
        logger.LogInformation("Processing {ExportType} export job {ExportJobId} for {EntityType}",
            job.ExportType, job.Id, job.EntityType);
        try
        {
            var snapshot = JsonSerializer.Deserialize<ExportSnapshot>(job.SnapshotJson,
                new JsonSerializerOptions(JsonSerializerDefaults.Web))
                ?? throw new InvalidOperationException("The export snapshot is invalid.");
            var html = await documentBuilder.BuildAsync(snapshot, cancellationToken);
            await using var content = job.ExportType == ExportTypes.Pdf
                ? await pdfRenderer.RenderAsync(html, cancellationToken)
                : new MemoryStream(Encoding.UTF8.GetBytes(html), writable: false);
            var objectName = $"{job.RequestedAt:yyyy/MM/dd}/{job.Id:D}/{job.FileName}";
            var path = await storage.UploadAsync(options.Value.ContainerName, objectName, content,
                job.ExportType == ExportTypes.Pdf ? "application/pdf" : "text/html; charset=utf-8",
                cancellationToken);
            await repository.CompleteAsync(job.Id, path, timeProvider.GetUtcNow().UtcDateTime,
                cancellationToken);
            logger.LogInformation("Completed export job {ExportJobId}", job.Id);
            return true;
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "Export job {ExportJobId} failed", job.Id);
            try
            {
                await repository.FailAsync(job.Id, SafeError(exception),
                    timeProvider.GetUtcNow().UtcDateTime, CancellationToken.None);
            }
            catch (Exception stateException)
            {
                logger.LogCritical(stateException, "Export job {ExportJobId} could not be marked failed", job.Id);
            }
            return true;
        }
    }

    private static string SafeError(Exception exception) => exception switch
    {
        FileNotFoundException => "Stored article content or media is missing.",
        InvalidDataException => "Stored article content is invalid.",
        _ => "The export renderer or storage provider could not complete the export."
    };
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

        return "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">" +
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
            catch { html = await FallbackTextAsync(article, cancellationToken); }
        }
        else html = await FallbackTextAsync(article, cancellationToken);

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
        if (!string.IsNullOrWhiteSpace(article.PlainTextPath))
            try { return $"<p>{E(await ReadTextAsync(article.PlainTextPath, token)).Replace("\n", "<br>")}</p>"; }
            catch { /* fall through to the immutable JSON object */ }
        var json = await ReadTextAsync(article.ContentJsonPath, token);
        using var document = JsonDocument.Parse(json);
        return $"<p>{E(ReadJsonText(document.RootElement)).Replace("\n", "<br>")}</p>";
    }

    private async Task<string> ReadTextAsync(string path, CancellationToken token)
    {
        await using var stream = await storage.DownloadAsync(options.Value.ArticleContentContainerName, path, token);
        using var reader = new StreamReader(stream, Encoding.UTF8, true);
        return await reader.ReadToEndAsync(token);
    }

    private static string ReadJsonText(JsonElement root)
    {
        var values = new List<string>();
        Visit(root);
        return string.Join(" ", values);
        void Visit(JsonElement item)
        {
            if (item.ValueKind == JsonValueKind.Object && item.TryGetProperty("text", out var text) &&
                text.ValueKind == JsonValueKind.String) values.Add(text.GetString()!);
            if (item.ValueKind == JsonValueKind.Object && item.TryGetProperty("content", out var content) &&
                content.ValueKind == JsonValueKind.Array)
                foreach (var child in content.EnumerateArray()) Visit(child);
        }
    }

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
