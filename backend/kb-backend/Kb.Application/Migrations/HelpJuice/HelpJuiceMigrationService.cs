using System.IO.Compression;
using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Kb.Application.Abstractions;
using Kb.Application.Abstractions.Storage;
using Kb.Application.Drafts;
using Kb.Application.Exceptions;
using Kb.Application.Media;
using Microsoft.Extensions.Options;

namespace Kb.Application.Migrations.HelpJuice;

public sealed partial class HelpJuiceMigrationService(
    IHelpJuiceImportWriter writer,
    IObjectStorage storage,
    IHttpClientFactory httpClientFactory,
    ICurrentUser currentUser,
    TimeProvider timeProvider,
    IOptions<HelpJuiceMigrationLimits> limitsAccessor,
    IOptions<MediaOptions> mediaOptionsAccessor,
    IOptions<DraftContentOptions> draftOptionsAccessor)
{
    private readonly HelpJuiceMigrationLimits limits = ValidateLimits(limitsAccessor.Value);
    private readonly MediaOptions mediaOptions = mediaOptionsAccessor.Value;
    private readonly DraftContentOptions draftOptions = draftOptionsAccessor.Value;

    public async Task<HelpJuiceMigrationPreview> PreviewAsync(
        IReadOnlyList<MigrationUploadFile> files, int articleLimit, CancellationToken ct)
    {
        if (!currentUser.IsAuthenticated) throw new UnauthorizedAccessException();
        if (files.Count == 0) throw new BusinessRuleException("Select a HelpJuice ZIP or migration files.");

        var operationId = Guid.NewGuid();
        var temporaryPackage = Path.Combine(Path.GetTempPath(), $"helpjuice-preview-{operationId:N}.zip");
        try
        {
            await BuildTemporaryPackageAsync(files, temporaryPackage, ct);

            await using var packageStream = new FileStream(temporaryPackage, FileMode.Open, FileAccess.Read,
                FileShare.Read, 64 * 1024, FileOptions.Asynchronous | FileOptions.SequentialScan);
            using var package = await HelpJuicePackageReader.ExtractAsync(packageStream, limits, ct);
            var destinationSlugs = await writer.GetActiveArticleSlugsAsync(ct);
            var mappedArticleSlugs = await writer.GetMappedArticleSlugsAsync(ct);
            var source = await ParseSourceAsync(
                package, limits, timeProvider, destinationSlugs, mappedArticleSlugs, ct);
            return HelpJuicePreviewBuilder.Build(source, articleLimit);
        }
        finally
        {
            if (File.Exists(temporaryPackage)) File.Delete(temporaryPackage);
        }
    }

    public async Task<HelpJuiceMigrationExecutionResult> ExecuteAsync(
        IReadOnlyList<MigrationUploadFile> files, HelpJuiceMigrationOptions options, CancellationToken ct)
    {
        if (!currentUser.IsAuthenticated) throw new UnauthorizedAccessException();
        if (files.Count == 0) throw new BusinessRuleException("Select a HelpJuice ZIP or migration files.");
        ValidateOptions(options);
        if (!await writer.HasCompletedUserMigrationAsync(ct))
            throw new BusinessRuleException("Complete Users Migration before HelpJuice Content Migration.");

        var startedAt = timeProvider.GetUtcNow().UtcDateTime;
        var operationId = Guid.NewGuid();
        var stagingAttemptId = Guid.NewGuid();
        var originalName = files.Count == 1 ? SafeLeaf(files[0].FileName) : $"helpjuice-manual-{operationId:N}.zip";
        var temporaryPackage = Path.Combine(Path.GetTempPath(), $"helpjuice-{operationId:N}.zip");
        var migrationStarted = false;
        var jobStarted = false;
        try
        {
            await BuildTemporaryPackageAsync(files, temporaryPackage, ct);
            var packageHash = await HashFileAsync(temporaryPackage, ct);

            await using var packageStream = new FileStream(temporaryPackage, FileMode.Open, FileAccess.Read,
                FileShare.Read, 64 * 1024, FileOptions.Asynchronous | FileOptions.SequentialScan);
            using var package = await HelpJuicePackageReader.ExtractAsync(packageStream, limits, ct);
            var destinationSlugs = await writer.GetActiveArticleSlugsAsync(ct);
            var mappedArticleSlugs = await writer.GetMappedArticleSlugsAsync(ct);
            var source = await ParseSourceAsync(
                package, limits, timeProvider, destinationSlugs, mappedArticleSlugs, ct);
            var issues = source.Issues.ToList();
            var validation = source.Summary with
            {
                BlockingErrorCount = issues.Count(x => x.Severity == "Error"),
                WarningCount = issues.Count(x => x.Severity == "Warning")
            };
            var phases = new List<PhaseCounter>
            {
                new("Validation", validation.TotalArticles + validation.Categories + source.MediaFiles.Count)
                {
                    Status = validation.BlockingErrorCount > 0 ? "Failed" : "Completed"
                }
            };
            phases[0].Processed = phases[0].Total;

            operationId = await writer.StartOrResumeJobAsync(operationId, packageHash, options.ToJson(),
                currentUser.UserId, startedAt, ct);
            jobStarted = true;

            if (validation.BlockingErrorCount > 0)
            {
                var failed = Build(HelpJuiceMigrationStatuses.ValidationFailed, validation, null, phases, issues);
                await writer.PersistJobResultAsync(operationId, failed.Status, JsonSerializer.Serialize(failed),
                    issues, failed.CompletedAt, ct);
                return failed;
            }

            writer.ResetState();
            await writer.WriteOperationAuditAsync(operationId, "MigrationStarted", "Running", currentUser.UserId, ct);
            migrationStarted = true;
            var categoriesToImport = options.ImportCategories
                ? source.Categories
                : source.Categories.Where(category => category.Id == HelpJuiceSourceParser.FallbackCategoryExternalId).ToArray();
            var categoryPhase = new PhaseCounter("Categories", categoriesToImport.Count);
            var inlineMedia = BuildInlineMedia(source);
            var externalMedia = BuildExternalMedia(source);
            var uploadCount = source.Uploads?.Count ?? 0;
            var mediaPhase = new PhaseCounter("Media", options.ImportMedia ? uploadCount + inlineMedia.Count + source.MediaFiles.Count + externalMedia.Count : 0);
            var articlePhase = new PhaseCounter("Articles", source.Questions.Count);
            phases.AddRange([categoryPhase, mediaPhase, articlePhase]);

            var categoryMap = new Dictionary<string, Guid>(StringComparer.OrdinalIgnoreCase);
            var categoryImported = 0; var categoryUpdated = 0; var categorySkipped = 0;
            if (categoriesToImport.Count > 0)
            {
                foreach (var category in HelpJuiceSourceParser.OrderCategories(categoriesToImport, out _))
                {
                    ct.ThrowIfCancellationRequested();
                    try
                    {
                        if (category.ParentId is not null && !categoryMap.ContainsKey(category.ParentId))
                            throw new InvalidDataException($"Parent category '{category.ParentId}' was not imported successfully; this category is deferred for retry.");
                        Guid? parent = category.ParentId is null ? null : categoryMap.GetValueOrDefault(category.ParentId);
                        var result = await writer.WriteCategoryAsync(operationId,
                            new(category.Id, category.Name, category.Slug,
                                parent, category.Depth, category.SortOrder, category.Visibility), options.ConflictBehavior,
                            currentUser.UserId, ct);
                        categoryMap[category.Id] = result.InternalId;
                        categoryPhase.Record(result.Disposition);
                        if (result.Disposition == MigrationWriteDisposition.Imported) categoryImported++;
                        else if (result.Disposition == MigrationWriteDisposition.Updated) categoryUpdated++;
                        else categorySkipped++;
                    }
                    catch (Exception ex) when (ex is not OperationCanceledException)
                    {
                        writer.ResetState(); categoryPhase.Fail();
                        issues.Add(NewIssue("Error", "categories.csv", category.RowNumber, "Category", category.Id,
                            "CATEGORY_IMPORT_FAILED", SafeMessage(ex)));
                    }
                }
            }
            categoryPhase.Complete();

            var mediaMap = new Dictionary<string, (Guid Id, string Url)>(StringComparer.OrdinalIgnoreCase);
            var storageByHash = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            var mediaImported = 0; var mediaReused = 0;
            if (options.ImportMedia)
            {
                var packagedByRelativePath = source.MediaFiles
                    .Select(file => (File: file, Relative: source.PackageRootPath is null ? Path.GetFileName(file) :
                        Path.GetRelativePath(source.PackageRootPath, file).Replace('\\', '/')))
                    .ToDictionary(item => item.Relative.TrimStart('/'), item => item.File,
                        StringComparer.OrdinalIgnoreCase);
                var packagedByName = source.MediaFiles.Select(file => (File: file, Name: Path.GetFileName(file)))
                    .Where(x => !string.IsNullOrWhiteSpace(x.Name)).GroupBy(x => x.Name!, StringComparer.OrdinalIgnoreCase)
                    .Where(group => group.Count() == 1)
                    .ToDictionary(g => g.Key, g => g.Single().File, StringComparer.OrdinalIgnoreCase);
                var packagedByNormalizedName = source.MediaFiles
                    .GroupBy(HelpJuiceSourceParser.MediaFileMatchKey, StringComparer.OrdinalIgnoreCase)
                    .Where(group => group.Key.Length > 0 && group.Count() == 1)
                    .ToDictionary(group => group.Key, group => group.First(), StringComparer.OrdinalIgnoreCase);
                var legacyUrlByName = source.ConvertedAnswersById.Values.SelectMany(x => x.MediaSources)
                    .Where(url => Uri.TryCreate(url, UriKind.Absolute, out var uri) && uri.Scheme == Uri.UriSchemeHttps &&
                        (uri.Host.Equals("helpjuice.com", StringComparison.OrdinalIgnoreCase) || uri.Host.EndsWith(".helpjuice.com", StringComparison.OrdinalIgnoreCase)))
                    .GroupBy(url => Path.GetFileName(new Uri(url).LocalPath), StringComparer.OrdinalIgnoreCase)
                    .Where(group => !string.IsNullOrWhiteSpace(group.Key))
                    .ToDictionary(group => group.Key, group => group.First(), StringComparer.OrdinalIgnoreCase);
                var consumedPackageFiles = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

                foreach (var upload in source.Uploads ?? [])
                {
                    ct.ThrowIfCancellationRequested();
                    try
                    {
                        byte[] bytes;
                        var uploadPath = upload.FileName.Replace('\\', '/').TrimStart('/');
                        if (packagedByRelativePath.TryGetValue(uploadPath, out var packaged) ||
                            packagedByName.TryGetValue(Path.GetFileName(upload.FileName), out packaged) ||
                            packagedByNormalizedName.TryGetValue(HelpJuiceSourceParser.MediaFileMatchKey(upload.FileName), out packaged))
                        {
                            consumedPackageFiles.Add(packaged);
                            bytes = await File.ReadAllBytesAsync(packaged, ct);
                        }
                        else if (upload.PreviewUrl is not null || legacyUrlByName.TryGetValue(Path.GetFileName(upload.FileName), out _))
                        {
                            var downloadUrl = upload.PreviewUrl ?? legacyUrlByName[Path.GetFileName(upload.FileName)];
                            bytes = (await DownloadExternalMediaAsync(downloadUrl, ct)).Bytes;
                        }
                        else
                        {
                            mediaPhase.Skip();
                            issues.Add(NewIssue("Warning", "uploads.csv", upload.RowNumber, "Media", upload.Id,
                                "MEDIA_DOWNLOAD_FAILED", "No packaged file or safe preview_url was available; metadata was retained for retry."));
                            continue;
                        }
                        var pair = await ImportMediaBytesAsync(operationId, upload.Id, upload.FileName,
                            upload.MimeType ?? MimeFromExtension(upload.FileName), bytes,
                            HelpJuiceSourceParser.StableGuid($"helpjuice:media:{upload.Id}"), storageByHash, ct);
                        mediaPhase.Record(pair.Disposition);
                        if (pair.Disposition == MigrationWriteDisposition.Imported) mediaImported++; else mediaReused++;
                        foreach (var key in new[] { upload.Id, upload.FileName, upload.PreviewUrl }.Where(x => !string.IsNullOrWhiteSpace(x)))
                            foreach (var normalized in MediaKeys(key!)) mediaMap.TryAdd(normalized, pair.Media);
                    }
                    catch (Exception ex) when (ex is not OperationCanceledException)
                    {
                        writer.ResetState(); mediaPhase.Skip();
                        issues.Add(NewIssue("Warning", "uploads.csv", upload.RowNumber, "Media", upload.Id,
                            "MEDIA_DOWNLOAD_FAILED", SafeMessage(ex)));
                    }
                }

                foreach (var inline in inlineMedia)
                {
                    ct.ThrowIfCancellationRequested();
                    try
                    {
                        var pair = await ImportMediaBytesAsync(operationId, inline.ExternalId, inline.FileName,
                            inline.MimeType, inline.Bytes, inline.MediaId, storageByHash, ct);
                        mediaMap[inline.Source] = pair.Media;
                        mediaPhase.Record(pair.Disposition);
                        if (pair.Disposition == MigrationWriteDisposition.Imported) mediaImported++; else mediaReused++;
                    }
                    catch (Exception ex) when (ex is not OperationCanceledException)
                    {
                        writer.ResetState(); mediaPhase.Skip();
                        issues.Add(NewIssue("Warning", "answers.csv", inline.AnswerRowNumber, "Question", inline.QuestionId,
                            "INVALID_INLINE_MEDIA", SafeMessage(ex)));
                    }
                }

                foreach (var file in source.MediaFiles.Where(file => !consumedPackageFiles.Contains(file)))
                {
                    ct.ThrowIfCancellationRequested();
                    try
                    {
                        var bytes = await File.ReadAllBytesAsync(file, ct);
                        var externalId = $"package:{Path.GetFileName(file)}";
                        var pair = await ImportMediaBytesAsync(operationId, externalId, Path.GetFileName(file),
                            MimeFromExtension(file), bytes, HelpJuiceSourceParser.StableGuid($"helpjuice:media:{externalId}"), storageByHash, ct);
                        MapMediaKeys(file, pair.Media, mediaMap, source.MediaBySource);
                        mediaPhase.Record(pair.Disposition);
                        if (pair.Disposition == MigrationWriteDisposition.Imported) mediaImported++; else mediaReused++;
                    }
                    catch (Exception ex) when (ex is not OperationCanceledException)
                    {
                        writer.ResetState(); mediaPhase.Skip();
                        issues.Add(NewIssue("Warning", Path.GetFileName(file), null, "Media", Path.GetFileName(file),
                            "MEDIA_IMPORT_FAILED", SafeMessage(ex)));
                    }
                }

                foreach (var external in externalMedia)
                {
                    ct.ThrowIfCancellationRequested();
                    if (MediaKeys(external.Source).Any(mediaMap.ContainsKey))
                    {
                        mediaPhase.Skip();
                        continue;
                    }
                    try
                    {
                        var downloaded = await DownloadExternalMediaAsync(external.Source, ct);
                        var fileName = SelectDownloadedFileName(external.FileName, downloaded);
                        var pair = await ImportMediaBytesAsync(operationId, external.ExternalId, fileName,
                            downloaded.ContentType ?? MimeFromExtension(fileName), downloaded.Bytes, external.MediaId, storageByHash, ct);
                        foreach (var key in MediaKeys(external.Source)) mediaMap[key] = pair.Media;
                        mediaPhase.Record(pair.Disposition);
                        if (pair.Disposition == MigrationWriteDisposition.Imported) mediaImported++; else mediaReused++;
                    }
                    catch (Exception ex) when (ex is not OperationCanceledException)
                    {
                        writer.ResetState(); mediaPhase.Skip();
                        issues.Add(NewIssue("Warning", "answers.csv", external.AnswerRowNumber, "Question", external.QuestionId,
                            "EXTERNAL_MEDIA_IMPORT_FAILED", $"External media '{external.Source}' could not be internalized: {SafeMessage(ex)}"));
                    }
                }
            }
            mediaPhase.Complete();

            var answers = source.Answers.GroupBy(x => x.QuestionId, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(g => g.Key, g => g.FirstOrDefault(answer => !string.IsNullOrWhiteSpace(answer.Body)) ?? g.First(),
                    StringComparer.OrdinalIgnoreCase);
            var linkResolvers = new Dictionary<int, Func<string, HelpJuiceLinkResolution?>>();
            var published = 0; var drafts = 0; var archived = 0;
            foreach (var question in source.Questions)
            {
                ct.ThrowIfCancellationRequested();
                if ((question.IsPublished && !options.ImportPublished) ||
                    (!question.IsPublished && !options.ImportUnpublishedAsDrafts))
                { articlePhase.Skip(); continue; }

                var stagedPaths = new List<string>();
                try
                {
                    answers.TryGetValue(question.Id, out var answer);
                    (Guid MediaId, string Url)? Resolve(string sourceUrl)
                    {
                        foreach (var key in MediaKeys(sourceUrl))
                            if (mediaMap.TryGetValue(key, out var mapped)) return mapped;
                        return null;
                    }
                    var languageKey = question.LanguageId ?? int.MinValue;
                    if (!linkResolvers.TryGetValue(languageKey, out var linkResolver))
                        linkResolvers[languageKey] = linkResolver = HelpJuiceSourceParser.CreateLinkResolver(
                            source.Questions, question, mappedArticleSlugs);
                    var publishedConversion = HelpJuiceHtmlConverter.Convert(answer?.Body, Resolve, linkResolver);
                    var converted = question.ReconstructedNewerDraftBody is { } recoveredDraft
                        ? HelpJuiceHtmlConverter.Convert(recoveredDraft, Resolve, linkResolver)
                        : publishedConversion;
                    foreach (var warning in publishedConversion.Warnings.Concat(converted.Warnings).Distinct())
                        issues.Add(NewIssue("Warning", "answers.csv", answer?.RowNumber, "Answer", answer?.Id,
                            warning.Code, warning.Message));
                    var content = await StageContentAsync(stagingAttemptId, question.Id, converted,
                        question.IsPublished ? publishedConversion : null, stagedPaths, ct);
                    var declaredMedia = (question.UploadIds ?? []).Select(id => mediaMap.GetValueOrDefault(id).Id)
                        .Where(id => id != Guid.Empty);
                    var declaredMediaIds = declaredMedia.Distinct().ToArray();
                    content = content with
                    {
                        MediaIds = content.MediaIds.Concat(declaredMediaIds).Distinct().ToArray(),
                        VersionMediaIds = (content.VersionMediaIds ?? []).Concat(declaredMediaIds).Distinct().ToArray()
                    };
                    var externalCategories = question.CategoryIds ?? (question.CategoryId is null ? [] : [question.CategoryId]);
                    var categoryIds = externalCategories.Where(categoryMap.ContainsKey)
                        .Select(category => categoryMap[category]).Where(id => id != Guid.Empty).Distinct().ToArray();
                    var externalCategory = externalCategories.FirstOrDefault();
                    Guid? categoryId = categoryIds.FirstOrDefault() is { } first && first != Guid.Empty ? first : null;
                    if (options.ImportCategories && externalCategory is not null && categoryId is null)
                        issues.Add(NewIssue("Warning", "questions.csv", question.RowNumber, "Question", question.Id,
                            "CATEGORY_NOT_IMPORTED", $"Category '{externalCategory}' failed earlier; the article was preserved uncategorized and can be reassigned on retry."));
                    var now = timeProvider.GetUtcNow().UtcDateTime;
                    var created = options.PreserveTimestamps ? question.CreatedAt ?? startedAt : now;
                    var updated = options.PreserveTimestamps ? question.UpdatedAt ?? created : now;
                    var authorId = question.AuthorUserId ?? currentUser.UserId;
                    var result = await writer.WriteArticleAsync(operationId,
                        new(question.Id, question.Name, question.Slug, question.Description, categoryId, authorId,
                            currentUser.UserId, question.AuthorUserId.HasValue,
                            question.IsArchived ? Kb.Domain.Constants.ArticleStatuses.Archived : question.IsPublished
                                ? Kb.Domain.Constants.ArticleStatuses.Published : Kb.Domain.Constants.ArticleStatuses.Draft,
                            question.IsPublished, created, updated, null, content, question.Source, question.Position,
                            question.Visibility, categoryIds), options.ConflictBehavior, ct);
                    articlePhase.Record(result.Disposition);
                    if (!result.StagedContentConsumed)
                        await DeletePaths(stagedPaths);
                    if (result.Disposition != MigrationWriteDisposition.Skipped)
                    { if (question.IsArchived) archived++; else if (question.IsPublished) published++; else drafts++; }
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    writer.ResetState(); await DeletePaths(stagedPaths); articlePhase.Fail();
                    issues.Add(NewIssue("Error", "questions.csv", question.RowNumber, "Question", question.Id,
                        "ARTICLE_IMPORT_FAILED", SafeMessage(ex)));
                }
            }
            articlePhase.Complete();

            var resultSummary = new HelpJuiceMigrationResult(
                phases.Sum(x => x.Imported), phases.Sum(x => x.Updated), phases.Sum(x => x.Skipped),
                phases.Sum(x => x.Failed), categoryImported, categoryUpdated, categorySkipped, published, drafts,
                archived, mediaImported, mediaReused,
                issues.Count(x => x.ErrorCode.Contains("MEDIA", StringComparison.OrdinalIgnoreCase)),
                issues.Count(x => x.ErrorCode.StartsWith("UNSUPPORTED", StringComparison.Ordinal)),
                issues.Count(x => x.Severity == "Warning"));
            var status = resultSummary.FailedItems > 0
                ? HelpJuiceMigrationStatuses.CompletedWithErrors : HelpJuiceMigrationStatuses.Completed;
            await writer.WriteOperationAuditAsync(operationId, "MigrationCompleted", status, currentUser.UserId, ct);
            var completed = Build(status, validation, resultSummary, phases, issues);
            await writer.PersistJobResultAsync(operationId, completed.Status, JsonSerializer.Serialize(completed),
                issues, completed.CompletedAt, ct);
            return completed;
        }
        catch (OperationCanceledException)
        {
            if (migrationStarted)
                try { writer.ResetState(); await writer.WriteOperationAuditAsync(operationId, "MigrationCancelled", "Cancelled", currentUser.UserId, CancellationToken.None); } catch { }
            if (jobStarted)
                try { writer.ResetState(); await writer.PersistJobResultAsync(operationId, "Cancelled", "{}", [], timeProvider.GetUtcNow().UtcDateTime, CancellationToken.None); } catch { }
            throw;
        }
        catch
        {
            if (migrationStarted)
                try { writer.ResetState(); await writer.WriteOperationAuditAsync(operationId, "MigrationFailed", "Failed", currentUser.UserId, CancellationToken.None); } catch { }
            if (jobStarted)
                try { writer.ResetState(); await writer.PersistJobResultAsync(operationId, "Failed", "{}", [], timeProvider.GetUtcNow().UtcDateTime, CancellationToken.None); } catch { }
            throw;
        }
        finally
        {
            if (File.Exists(temporaryPackage)) File.Delete(temporaryPackage);
        }

        HelpJuiceMigrationExecutionResult Build(string status, HelpJuiceValidationSummary validation,
            HelpJuiceMigrationResult? result, IEnumerable<PhaseCounter> phases,
            IReadOnlyList<MigrationIssueData> issues) =>
            new(operationId, status, originalName, startedAt, timeProvider.GetUtcNow().UtcDateTime, options, validation, result,
                phases.Select(x => x.ToResult()).ToArray(), issues);
    }

    private async Task<StagedArticleContent> StageContentAsync(Guid operationId, string externalId,
        HelpJuiceHtmlConversion converted, HelpJuiceHtmlConversion? published, List<string> paths,
        CancellationToken ct)
    {
        var json = Encoding.UTF8.GetBytes(converted.TiptapJson);
        var html = Encoding.UTF8.GetBytes(converted.RenderedHtml);
        var text = Encoding.UTF8.GetBytes(converted.PlainText);
        if (json.Length > limits.MaxArticleContentSizeBytes)
            throw new InvalidDataException("Converted article content exceeds the configured limit.");
        var articleKey = HelpJuiceSourceParser.NormalizeSlug(externalId);
        var hash = Convert.ToHexString(SHA256.HashData(json)).ToLowerInvariant();
        var prefix = $"migration-imports/helpjuice/articles/{articleKey}/{hash}/{operationId:N}";
        var jsonPath = await Upload($"{prefix}/draft/content.json", json, "application/json");
        var htmlPath = await Upload($"{prefix}/draft/content.html", html, "text/html; charset=utf-8");
        var textPath = await Upload($"{prefix}/draft/content.txt", text, "text/plain; charset=utf-8");
        string? versionJson = null; string? versionHtml = null; string? versionText = null;
        string? versionHash = null;
        long? versionSize = null;
        IReadOnlyCollection<Guid>? versionMediaIds = null;
        if (published is not null)
        {
            var publishedJson = Encoding.UTF8.GetBytes(published.TiptapJson);
            var publishedHtml = Encoding.UTF8.GetBytes(published.RenderedHtml);
            var publishedText = Encoding.UTF8.GetBytes(published.PlainText);
            versionHash = Convert.ToHexString(SHA256.HashData(publishedJson)).ToLowerInvariant();
            versionSize = publishedJson.LongLength;
            versionJson = await Upload($"{prefix}/version/content.json", publishedJson, "application/json");
            versionHtml = await Upload($"{prefix}/version/content.html", publishedHtml, "text/html; charset=utf-8");
            versionText = await Upload($"{prefix}/version/content.txt", publishedText, "text/plain; charset=utf-8");
            versionMediaIds = MediaIdRegex().Matches(published.TiptapJson)
                .Select(match => Guid.Parse(match.Groups[1].Value)).ToHashSet();
        }
        var mediaIds = MediaIdRegex().Matches(converted.TiptapJson)
            .Select(match => Guid.Parse(match.Groups[1].Value)).ToHashSet();
        return new(jsonPath, htmlPath, textPath,
            hash, json.LongLength, mediaIds,
            versionJson, versionHtml, versionText, versionHash, versionSize, versionMediaIds);

        async Task<string> Upload(string name, byte[] bytes, string type)
        {
            paths.Add(name);
            await using var stream = new MemoryStream(bytes, writable: false);
            return await storage.UploadAsync(draftOptions.ContainerName, name, stream, type, ct);
        }
    }

    private async Task<HelpJuiceSource> ParseSourceAsync(PackageContents package,
        HelpJuiceMigrationLimits migrationLimits, TimeProvider clock, IReadOnlySet<string> destinationSlugs,
        IReadOnlyDictionary<string, string> mappedSlugs, CancellationToken ct)
    {
        var source = await HelpJuiceSourceParser.ParseAndValidateAsync(
            package, migrationLimits, clock, destinationSlugs, mappedSlugs, ct);
        source = await EnrichAuthorsAsync(source, ct);
        var mediaIssues = await ValidateMediaFilesAsync(package.MediaFiles, ct);
        if (mediaIssues.Count == 0) return source;
        var issues = source.Issues.Concat(mediaIssues).ToArray();
        return source with
        {
            Issues = issues,
            Summary = source.Summary with
            {
                BlockingErrorCount = issues.Count(issue => issue.Severity == "Error"),
                WarningCount = issues.Count(issue => issue.Severity == "Warning")
            }
        };
    }

    private async Task<HelpJuiceSource> EnrichAuthorsAsync(HelpJuiceSource source, CancellationToken ct)
    {
        var authorIds = source.Questions.Select(question => question.HelpJuiceAuthorId)
            .Where(id => !string.IsNullOrWhiteSpace(id)).Select(id => id!.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        var mappings = await writer.ResolveHelpJuiceAuthorsAsync(authorIds, ct);
        var issues = source.Issues.ToList();
        var questions = new HelpJuiceQuestion[source.Questions.Count];

        for (var index = 0; index < source.Questions.Count; index++)
        {
            var question = source.Questions[index];
            if (question.HelpJuiceAuthorId is null)
            {
                issues.Add(NewIssue("Warning", "questions.csv", question.RowNumber, "Question", question.Id,
                    "HELPJUICE_AUTHOR_ID_MISSING",
                    $"Article '{question.Id}' has no created_by_id; the authenticated migration actor will be used as its owner.",
                    $"articleId={question.Id};helpJuiceUserId=missing"));
                questions[index] = question;
                continue;
            }

            if (!mappings.TryGetValue(question.HelpJuiceAuthorId, out var author))
            {
                issues.Add(NewIssue("Warning", "questions.csv", question.RowNumber, "Question", question.Id,
                    "HELPJUICE_AUTHOR_MAPPING_MISSING",
                    $"Article '{question.Id}' references unresolved HelpJuice user ID '{question.HelpJuiceAuthorId}'; the authenticated migration actor will be used as its owner.",
                    $"articleId={question.Id};helpJuiceUserId={question.HelpJuiceAuthorId}"));
                questions[index] = question;
                continue;
            }

            questions[index] = question with { AuthorUserId = author.UserId, AuthorName = author.Name };
        }

        return source with
        {
            Questions = questions,
            Issues = issues,
            Summary = source.Summary with
            {
                BlockingErrorCount = issues.Count(issue => issue.Severity == "Error"),
                WarningCount = issues.Count(issue => issue.Severity == "Warning")
            }
        };
    }

    private async Task<ImportedMediaOutcome> ImportMediaBytesAsync(Guid operationId, string externalId,
        string fileName, string mimeType, byte[] bytes, Guid mediaId, IDictionary<string, string> storageByHash,
        CancellationToken ct)
    {
        if (bytes.LongLength > mediaOptions.MaxFileSizeBytes)
            throw new InvalidDataException($"Media exceeds the configured {mediaOptions.MaxFileSizeBytes}-byte limit.");
        var safeName = Path.GetFileName(fileName);
        await using var input = new MemoryStream(bytes, writable: false);
        var inspected = await MediaFileInspector.InspectAsync(
            new(safeName, mimeType, bytes.LongLength, input), mediaOptions.MaxFileSizeBytes, ct);
        var hash = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
        if (!storageByHash.TryGetValue(hash, out var stored))
        {
            var objectName = $"migration-imports/helpjuice/media/{hash}{inspected.Extension}";
            stored = await storage.UploadAsync(mediaOptions.ContainerName, objectName,
                inspected.UploadStream, inspected.ContentType, ct);
            storageByHash[hash] = stored;
        }
        var storedName = $"{mediaId:N}{inspected.Extension}";
        var result = await writer.WriteMediaAsync(operationId,
            new(externalId, mediaId, safeName, storedName, inspected.ContentType, inspected.Extension,
                bytes.LongLength, stored, hash, currentUser.UserId, timeProvider.GetUtcNow().UtcDateTime), ct);
        return new((result.InternalId, $"/api/media/{result.InternalId}/content"), result.Disposition);
    }

    private async Task<DownloadedMediaData> DownloadExternalMediaAsync(string sourceUrl, CancellationToken ct)
    {
        if (sourceUrl.StartsWith("//", StringComparison.Ordinal)) sourceUrl = "https:" + sourceUrl;
        if (!Uri.TryCreate(sourceUrl, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps ||
            string.IsNullOrWhiteSpace(uri.Host) || !string.IsNullOrEmpty(uri.UserInfo))
            throw new InvalidDataException("External media must use an absolute HTTPS URL without embedded credentials.");
        var client = httpClientFactory.CreateClient("HelpJuiceMigration");
        var current = uri;
        for (var redirects = 0; redirects <= 5; redirects++)
        {
            await EnsurePublicMediaHostAsync(current, ct);
            using var request = new HttpRequestMessage(HttpMethod.Get, current);
            using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
            if ((int)response.StatusCode is >= 300 and < 400)
            {
                if (redirects == 5 || response.Headers.Location is null)
                    throw new InvalidDataException("External media exceeded the safe redirect limit.");
                current = response.Headers.Location.IsAbsoluteUri
                    ? response.Headers.Location
                    : new Uri(current, response.Headers.Location);
                if (current.Scheme != Uri.UriSchemeHttps || !string.IsNullOrEmpty(current.UserInfo))
                    throw new InvalidDataException("External media redirected to an unsafe URL.");
                continue;
            }
            response.EnsureSuccessStatusCode();
            var finalUri = response.RequestMessage?.RequestUri ?? current;
            await EnsurePublicMediaHostAsync(finalUri, ct);
            if (response.Content.Headers.ContentLength is > 0 && response.Content.Headers.ContentLength > mediaOptions.MaxFileSizeBytes)
                throw new InvalidDataException("External media exceeds the configured file-size limit.");
            await using var source = await response.Content.ReadAsStreamAsync(ct);
            await using var target = new MemoryStream();
            await CopyLimited(source, target, mediaOptions.MaxFileSizeBytes, ct);
            var dispositionName = response.Content.Headers.ContentDisposition?.FileNameStar ??
                                  response.Content.Headers.ContentDisposition?.FileName;
            var suggested = string.IsNullOrWhiteSpace(dispositionName)
                ? null
                : Path.GetFileName(dispositionName.Trim().Trim('"'));
            return new(target.ToArray(), response.Content.Headers.ContentType?.MediaType, suggested);
        }
        throw new InvalidDataException("External media download failed.");
    }

    private static async Task EnsurePublicMediaHostAsync(Uri uri, CancellationToken ct)
    {
        if (uri.Scheme != Uri.UriSchemeHttps || string.IsNullOrWhiteSpace(uri.DnsSafeHost))
            throw new InvalidDataException("External media URL is not HTTPS.");
        IPAddress[] addresses;
        if (IPAddress.TryParse(uri.DnsSafeHost, out var literal)) addresses = [literal];
        else
        {
            try { addresses = await Dns.GetHostAddressesAsync(uri.DnsSafeHost, ct); }
            catch (SocketException ex) { throw new InvalidDataException("External media host could not be resolved safely.", ex); }
        }
        if (addresses.Length == 0 || addresses.Any(address => !IsPublicAddress(address)))
            throw new InvalidDataException("External media host resolves to a private, local, reserved, or otherwise unsafe address.");
    }

    private static bool IsPublicAddress(IPAddress address)
    {
        if (IPAddress.IsLoopback(address)) return false;
        if (address.IsIPv4MappedToIPv6) return IsPublicAddress(address.MapToIPv4());
        var bytes = address.GetAddressBytes();
        if (address.AddressFamily == AddressFamily.InterNetwork)
            return bytes[0] is not (0 or 10 or 127) && bytes[0] < 224 &&
                   !(bytes[0] == 100 && bytes[1] is >= 64 and <= 127) &&
                   !(bytes[0] == 169 && bytes[1] == 254) &&
                   !(bytes[0] == 172 && bytes[1] is >= 16 and <= 31) &&
                   !(bytes[0] == 192 && bytes[1] == 168) &&
                   !(bytes[0] == 198 && bytes[1] is 18 or 19);
        return address.AddressFamily == AddressFamily.InterNetworkV6 &&
               !address.IsIPv6LinkLocal && !address.IsIPv6Multicast && !address.IsIPv6SiteLocal && (bytes[0] & 0xfe) != 0xfc;
    }

    private static List<InlineMediaData> BuildInlineMedia(HelpJuiceSource source)
    {
        var result = new List<InlineMediaData>();
        var answers = source.Answers.ToDictionary(x => x.Id, StringComparer.OrdinalIgnoreCase);
        foreach (var item in source.ConvertedAnswersById)
        {
            if (!answers.TryGetValue(item.Key, out var answer)) continue;
            var ordinal = 0;
            foreach (var dataUrl in item.Value.MediaSources.Where(x => x.StartsWith("data:image/", StringComparison.OrdinalIgnoreCase)))
            {
                ordinal++;
                var semicolon = dataUrl.IndexOf(';'); var comma = dataUrl.IndexOf(',');
                if (semicolon < 11 || comma <= semicolon ||
                    !dataUrl[semicolon..comma].Equals(";base64", StringComparison.OrdinalIgnoreCase)) continue;
                var subtype = dataUrl[11..semicolon].ToLowerInvariant();
                var extension = subtype switch { "jpeg" => ".jpg", "svg+xml" => ".svg", _ => $".{subtype}" };
                var mime = $"image/{subtype}";
                var encoded = dataUrl[(comma + 1)..];
                byte[] bytes;
                try { bytes = Convert.FromBase64String(encoded); } catch (FormatException) { continue; }
                var identityHash = Convert.ToHexString(SHA256.HashData(Encoding.ASCII.GetBytes(encoded))).ToLowerInvariant();
                var externalId = $"inline:{answer.QuestionId}:{identityHash}";
                var id = HelpJuiceSourceParser.StableGuid($"helpjuice:{externalId}");
                result.Add(new(externalId, answer.QuestionId, answer.RowNumber, dataUrl,
                    $"inline-{answer.QuestionId}-{ordinal}{extension}", mime, bytes, id));
            }
        }
        return result.DistinctBy(x => x.ExternalId).ToList();
    }

    private static List<ExternalMediaData> BuildExternalMedia(HelpJuiceSource source)
    {
        var answers = source.Answers.ToDictionary(answer => answer.Id, StringComparer.OrdinalIgnoreCase);
        var result = new List<ExternalMediaData>();
        foreach (var conversion in source.ConvertedAnswersById)
        {
            if (!answers.TryGetValue(conversion.Key, out var answer)) continue;
            foreach (var raw in conversion.Value.MediaSources.Distinct(StringComparer.OrdinalIgnoreCase))
            {
                var normalized = raw.StartsWith("//", StringComparison.Ordinal) ? "https:" + raw : raw;
                if (!Uri.TryCreate(normalized, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps ||
                    raw.StartsWith("data:", StringComparison.OrdinalIgnoreCase)) continue;
                var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(uri.AbsoluteUri))).ToLowerInvariant();
                var fileName = Path.GetFileName(uri.LocalPath);
                if (string.IsNullOrWhiteSpace(fileName)) fileName = $"external-media-{hash[..12]}";
                var externalId = $"external:{hash}";
                result.Add(new(externalId, answer.QuestionId, answer.RowNumber, uri.AbsoluteUri, fileName,
                    HelpJuiceSourceParser.StableGuid($"helpjuice:media:{externalId}")));
            }
        }
        return result.DistinctBy(item => item.Source, StringComparer.OrdinalIgnoreCase).ToList();
    }

    private static string SelectDownloadedFileName(string sourceName, DownloadedMediaData downloaded)
    {
        static bool HasExtension(string value) => !string.IsNullOrWhiteSpace(Path.GetExtension(value));
        if (HasExtension(sourceName)) return Path.GetFileName(sourceName);
        if (!string.IsNullOrWhiteSpace(downloaded.SuggestedFileName) && HasExtension(downloaded.SuggestedFileName))
            return Path.GetFileName(downloaded.SuggestedFileName);
        var extension = downloaded.ContentType?.ToLowerInvariant() switch
        {
            "image/jpeg" => ".jpg", "image/png" => ".png", "image/gif" => ".gif", "image/webp" => ".webp",
            "image/bmp" => ".bmp", "image/tiff" => ".tiff", "image/svg+xml" => ".svg",
            "video/mp4" => ".mp4", "video/quicktime" => ".mov", "video/webm" => ".webm",
            "video/x-msvideo" => ".avi", "video/mpeg" => ".mpeg", "application/pdf" => ".pdf",
            "text/plain" => ".txt", "text/markdown" => ".md", "application/json" => ".json",
            "application/xml" or "text/xml" => ".xml", _ => null
        };
        if (extension is null)
            throw new InvalidDataException("External media has no usable filename extension and its HTTP MIME type is unsupported.");
        return Path.GetFileName(sourceName) + extension;
    }

    private async Task BuildTemporaryPackageAsync(IReadOnlyList<MigrationUploadFile> files,
        string destination, CancellationToken ct)
    {
        if (files.Count == 1 && Path.GetExtension(files[0].FileName).Equals(".zip", StringComparison.OrdinalIgnoreCase))
            await CopyUploadedZipAsync(files[0], destination, ct);
        else
            await BuildManualPackageAsync(files, destination, ct);
    }

    private async Task CopyUploadedZipAsync(MigrationUploadFile file, string target, CancellationToken ct)
    {
        if (file.Length <= 0 || file.Length > limits.MaxPackageSizeBytes)
            throw new BusinessRuleException("The migration package size is invalid.");
        if (file.ContentType is not null && file.ContentType.Split(';')[0] is not
            ("application/zip" or "application/x-zip-compressed" or "application/octet-stream"))
            throw new BusinessRuleException("The ZIP MIME type is not supported.");
        await using var output = new FileStream(target, FileMode.CreateNew, FileAccess.Write, FileShare.None,
            64 * 1024, FileOptions.Asynchronous);
        await CopyLimited(file.Content, output, limits.MaxPackageSizeBytes, ct);
    }

    private async Task BuildManualPackageAsync(IReadOnlyList<MigrationUploadFile> files, string target, CancellationToken ct)
    {
        if (files.Count > limits.MaxEntries) throw new BusinessRuleException("Too many migration files were selected.");
        await using var output = new FileStream(target, FileMode.CreateNew, FileAccess.ReadWrite, FileShare.None);
        using var archive = new ZipArchive(output, ZipArchiveMode.Create, leaveOpen: true);
        long total = 0; var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var file in files)
        {
            var name = HelpJuicePackageReader.ValidateEntryName(file.FileName);
            if (!HelpJuicePackageReader.IsSupportedManualFile(name))
                throw new BusinessRuleException($"File '{SafeLeaf(name)}' is not supported.");
            if (!names.Add(name)) throw new BusinessRuleException($"File '{name}' was selected more than once.");
            total = checked(total + file.Length);
            if (total > limits.MaxPackageSizeBytes)
                throw new BusinessRuleException("The selected files exceed the package limit.");
            var entry = archive.CreateEntry(name, CompressionLevel.Fastest);
            await using var destination = entry.Open();
            await CopyLimited(file.Content, destination, limits.MaxEntrySizeBytes, ct);
        }
    }

    private async Task<IReadOnlyList<MigrationIssueData>> ValidateMediaFilesAsync(
        IEnumerable<string> files, CancellationToken ct)
    {
        var issues = new List<MigrationIssueData>();
        foreach (var file in files)
        {
            try
            {
                await using var input = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.Read,
                    64 * 1024, FileOptions.Asynchronous | FileOptions.SequentialScan);
                _ = await MediaFileInspector.InspectAsync(
                    new(Path.GetFileName(file), MimeFromExtension(file), input.Length, input),
                    mediaOptions.MaxFileSizeBytes, ct);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                issues.Add(NewIssue("Error", Path.GetFileName(file), null, "Media", Path.GetFileName(file),
                    "MEDIA_VALIDATION_FAILED", SafeMessage(ex)));
            }
        }
        return issues;
    }

    private async Task DeletePaths(IEnumerable<string> paths)
    { foreach (var path in paths) try { await storage.DeleteAsync(draftOptions.ContainerName, path, CancellationToken.None); } catch { } }
    private static async Task<string> HashFileAsync(string path, CancellationToken ct)
    { await using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 64 * 1024, FileOptions.Asynchronous); return Convert.ToHexString(await SHA256.HashDataAsync(stream, ct)).ToLowerInvariant(); }
    private static IEnumerable<string> MediaKeys(string source)
    { yield return source; var value = Uri.TryCreate(source, UriKind.Absolute, out var uri) ? uri.LocalPath : source; yield return value.Replace('\\', '/').TrimStart('/'); yield return Path.GetFileName(value); }
    private static void MapMediaKeys(string file, (Guid Id, string Url) pair,
        Dictionary<string, (Guid, string)> map, IReadOnlyDictionary<string, string> uploads)
    { foreach (var key in MediaKeys(file)) map.TryAdd(key, pair); foreach (var item in uploads.Where(x => Path.GetFileName(x.Value).Equals(Path.GetFileName(file), StringComparison.OrdinalIgnoreCase))) foreach (var key in MediaKeys(item.Key)) map.TryAdd(key, pair); }
    private MigrationIssueData NewIssue(string severity, string? file, int? row, string? type,
        string? id, string code, string message, string? summary = null) => new(Guid.NewGuid(), severity, file, row, type, id, code,
            message, summary, timeProvider.GetUtcNow().UtcDateTime);
    private static string MimeFromExtension(string path) => Path.GetExtension(path).ToLowerInvariant() switch
    { ".png" => "image/png", ".jpg" or ".jpeg" => "image/jpeg", ".gif" => "image/gif", ".webp" => "image/webp", ".svg" => "image/svg+xml", ".pdf" => "application/pdf", ".docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".mp4" => "video/mp4", ".webm" => "video/webm", _ => "application/octet-stream" };
    private static async Task CopyLimited(Stream input, Stream output, long max, CancellationToken ct)
    { var buffer = new byte[64 * 1024]; long count = 0; while (true) { var read = await input.ReadAsync(buffer, ct); if (read == 0) break; count += read; if (count > max) throw new BusinessRuleException("Uploaded content exceeds the configured limit."); await output.WriteAsync(buffer.AsMemory(0, read), ct); } }
    private static void ValidateOptions(HelpJuiceMigrationOptions options)
    { if (!MigrationConflictBehaviors.All.Contains(options.ConflictBehavior)) throw new BusinessRuleException("Conflict behavior must be Skip, UpdateExisting, or CreateCopy."); if (!options.ImportPublished && !options.ImportUnpublishedAsDrafts) throw new BusinessRuleException("Select at least one article publication state to import."); }
    private static HelpJuiceMigrationLimits ValidateLimits(HelpJuiceMigrationLimits value)
    { if (value.MaxPackageSizeBytes <= 0 || value.MaxExtractedSizeBytes < value.MaxPackageSizeBytes || value.MaxEntries <= 0 || value.BatchSize <= 0) throw new InvalidOperationException("HelpJuice migration limits are invalid."); return value; }
    private static string SafeLeaf(string value) => Path.GetFileName(value.Replace('\\', '/'));
    private static string SafeMessage(Exception exception) => exception.Message.Length <= 4000 ? exception.Message : exception.Message[..4000];

    private sealed class PhaseCounter(string name, int total)
    {
        public string Name { get; } = name; public int Total { get; } = total;
        public string Status { get; set; } = "Pending"; public int Processed { get; set; }
        public int Imported { get; private set; } public int Updated { get; private set; }
        public int Skipped { get; private set; } public int Failed { get; private set; }
        public void Record(MigrationWriteDisposition disposition) { Processed++; if (disposition == MigrationWriteDisposition.Imported) Imported++; else if (disposition == MigrationWriteDisposition.Updated) Updated++; else Skipped++; }
        public void Skip() { Processed++; Skipped++; }
        public void Fail() { Processed++; Failed++; }
        public void Complete() => Status = Failed > 0 ? "CompletedWithErrors" : "Completed";
        public HelpJuiceMigrationPhase ToResult() => new(Name, Status, Total, Processed, Imported, Updated, Skipped, Failed);
    }

    private sealed record ImportedMediaOutcome((Guid Id, string Url) Media, MigrationWriteDisposition Disposition);
    private sealed record InlineMediaData(string ExternalId, string QuestionId, int AnswerRowNumber,
        string Source, string FileName, string MimeType, byte[] Bytes, Guid MediaId);
    private sealed record ExternalMediaData(string ExternalId, string QuestionId, int AnswerRowNumber,
        string Source, string FileName, Guid MediaId);
    private sealed record DownloadedMediaData(byte[] Bytes, string? ContentType, string? SuggestedFileName);

    [System.Text.RegularExpressions.GeneratedRegex("\\\"mediaId\\\":\\\"([0-9a-fA-F-]{36})\\\"")]
    private static partial System.Text.RegularExpressions.Regex MediaIdRegex();
}
