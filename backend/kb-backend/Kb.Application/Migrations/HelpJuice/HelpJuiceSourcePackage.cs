using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Kb.Domain.Constants;

namespace Kb.Application.Migrations.HelpJuice;

public sealed record HelpJuiceQuestion(
    int RowNumber, string Id, string Slug, string Name, string? Description, bool IsPublished,
    DateTime? CreatedAt, DateTime? UpdatedAt, string? CategoryId, IReadOnlyDictionary<string, string> Source,
    bool IsArchived = false, bool HasUnrecoverableNewerDraft = false, int? LanguageId = null,
    string? TranslationId = null, string? CreatedById = null, string? UpdatedById = null, int Position = 0,
    IReadOnlyList<string>? RelatedQuestionIds = null, IReadOnlyList<string>? UploadIds = null,
    string Visibility = "Public", bool VisibilityWasExplicit = false,
    string? LegacyAuthorName = null, string? LegacyAuthorEmail = null, string? LegacyAuthorExternalId = null);
public sealed record HelpJuiceAnswer(int RowNumber, string Id, string QuestionId, string Body,
    IReadOnlyDictionary<string, string> Source);
public sealed record HelpJuiceCategory(int RowNumber, string Id, string? ParentId, string Name, int Depth = 0,
    string Slug = "", int SortOrder = 0, bool IsArchived = false, int? LanguageId = null,
    string Visibility = "Public", bool VisibilityWasExplicit = false, string? TranslationId = null,
    IReadOnlyDictionary<string, string>? Source = null, IReadOnlyList<string>? RelatedQuestionIds = null);
public sealed record HelpJuiceUpload(int RowNumber, string Id, string FileName, string? PreviewUrl,
    string? Checksum, string? MimeType, string Extension, long? Size, DateTime? CreatedAt,
    IReadOnlyDictionary<string, string> Source);

public sealed record HelpJuiceSource(
    IReadOnlyList<HelpJuiceQuestion> Questions,
    IReadOnlyList<HelpJuiceAnswer> Answers,
    IReadOnlyList<HelpJuiceCategory> Categories,
    IReadOnlyDictionary<string, string> CategorizationByQuestionId,
    IReadOnlyList<string> MediaFiles,
    IReadOnlyDictionary<string, string> MediaBySource,
    IReadOnlyDictionary<string, HelpJuiceHtmlConversion> ConvertedAnswersById,
    IReadOnlyList<MigrationIssueData> Issues,
    HelpJuiceValidationSummary Summary,
    IReadOnlyList<HelpJuiceUpload>? Uploads = null);

public static class HelpJuiceSourceParser
{
    public static async Task<HelpJuiceSource> ParseAndValidateAsync(PackageContents package,
        HelpJuiceMigrationLimits limits, TimeProvider timeProvider,
        IReadOnlySet<string>? destinationArticleSlugs = null,
        IReadOnlyDictionary<string, string>? mappedArticleSlugs = null,
        CancellationToken cancellationToken = default,
        IHelpJuiceAuthorLookup? authorLookup = null)
    {
        var now = timeProvider.GetUtcNow().UtcDateTime;
        var issues = new List<MigrationIssueData>();
        MigrationIssueData Issue(string severity, string code, string message, string? file = null,
            int? row = null, string? type = null, string? id = null, string? summary = null) =>
            new(Guid.NewGuid(), severity, file, row, type, id, code, message, summary, now);

        var missing = new[] { "questions.csv", "answers.csv" }
            .Where(name => !package.KnownCsvFiles.ContainsKey(name)).ToArray();
        foreach (var file in missing) issues.Add(Issue("Error", "REQUIRED_FILE_MISSING", $"Required file {file} is missing.", file));
        foreach (var file in package.UnsupportedFiles)
            issues.Add(Issue("Warning", "UNSUPPORTED_FILE", $"Unsupported file '{file}' will not be imported.", file));
        if (missing.Length > 0) return EmptySummary(package, issues, missing);

        ParsedCsv questionsCsv;
        ParsedCsv answersCsv;
        try
        {
            questionsCsv = await HelpJuiceCsvReader.ReadAsync(package.KnownCsvFiles["questions.csv"], limits.MaxCsvRows, cancellationToken);
            answersCsv = await HelpJuiceCsvReader.ReadAsync(package.KnownCsvFiles["answers.csv"], limits.MaxCsvRows, cancellationToken);
        }
        catch (Exception ex) when (ex is InvalidDataException or DecoderFallbackException)
        {
            issues.Add(Issue("Error", "MALFORMED_CSV", ex.Message));
            return EmptySummary(package, issues, missing);
        }
        RequireColumns(questionsCsv, ["id", "name"], issues, Issue);
        RequireColumns(answersCsv, ["id", "question_id", "body"], issues, Issue);
        var legacyUsers = await ParseLegacyUsersAsync(package, limits, issues, Issue, cancellationToken);
        var authorResolver = new HelpJuiceAuthorResolver(legacyUsers, authorLookup);

        var questions = new List<HelpJuiceQuestion>();
        foreach (var row in questionsCsv.Rows)
        {
            var id = row["id"].Trim();
            if (id.Length == 0)
            {
                issues.Add(Issue("Error", "INVALID_QUESTION_ID", "Question ID is required.", "questions.csv", row.RowNumber));
                continue;
            }
            var name = row["name"].Trim();
            if (name.Length == 0)
            {
                name = $"Untitled HelpJuice article {id}";
                issues.Add(Issue("Warning", "TITLE_DERIVED", $"A missing title was replaced with '{name}'.",
                    "questions.csv", row.RowNumber, "Question", id, "automaticallyRepaired=true;field=name"));
            }
            var codename = row["codename"].Trim();
            var slug = NormalizeSlug(codename.Length == 0 ? name : codename);
            if (codename.Length == 0)
                issues.Add(Issue("Warning", "BLANK_CODENAME_DERIVED", $"The slug '{slug}' was derived from the title.",
                    "questions.csv", row.RowNumber, "Question", id, "automaticallyRepaired=true;field=codename"));
            if (slug.Length == 0) slug = $"article-{NormalizeSlug(id)}";

            var published = ParseBoolean(row["is_published"], out var validPublished);
            var archived = ParseBoolean(row["archived"], out var validArchived);
            var newerDraft = ParseBoolean(row["has_draft_revision_after_current_revision"], out _);
            if (!validPublished && row["is_published"].Length > 0)
                issues.Add(Issue("Warning", "INVALID_PUBLICATION_FLAG", "Invalid is_published value was treated as false.",
                    "questions.csv", row.RowNumber, "Question", id, "automaticallyRepaired=true;field=is_published"));
            if (!validArchived && row["archived"].Length > 0)
                issues.Add(Issue("Warning", "INVALID_ARCHIVED_FLAG", "Invalid archived value was treated as false.",
                    "questions.csv", row.RowNumber, "Question", id, "automaticallyRepaired=true;field=archived"));
            var created = ParseDate(row["created_at"], out var validCreated);
            var updated = ParseDate(row["updated_at"], out var validUpdated);
            if (!validCreated) issues.Add(Issue("Warning", "INVALID_DATE", "Invalid created_at will use the migration time.", "questions.csv", row.RowNumber, "Question", id, "automaticallyRepaired=true;field=created_at"));
            if (!validUpdated) issues.Add(Issue("Warning", "INVALID_DATE", "Invalid updated_at will use created_at or the migration time.", "questions.csv", row.RowNumber, "Question", id, "automaticallyRepaired=true;field=updated_at"));
            if (newerDraft)
                issues.Add(Issue("Warning", "UNRECONSTRUCTABLE_NEWER_DRAFT", "HelpJuice reports a newer draft, but this export contains only one body. The exported body will be imported without inventing a second version.",
                    "questions.csv", row.RowNumber, "Question", id, "automaticallyRepaired=false;field=has_draft_revision_after_current_revision"));
            if (row.Values.ContainsKey("joined_tag_names") && row["joined_tag_names"].Length > 0)
                issues.Add(Issue("Warning", "TAGS_IGNORED", "HelpJuice tags are not imported because the KB has no article-tag model.", "questions.csv", row.RowNumber, "Question", id));

            var visibility = ParseVisibility(row);
            var externalAuthorId = NullIfEmpty(row["created_by_id"]);
            HelpJuiceLegacyAuthor? legacyUser = null;
            if (externalAuthorId is null)
            {
                issues.Add(Issue("Warning", "HELPJUICE_AUTHOR_ID_MISSING",
                    "The article has no created_by_id, so its Helpjuice author cannot be resolved.",
                    "questions.csv", row.RowNumber, "Question", id,
                    "authorStatus=missing-created-by-id"));
            }
            else
            {
                legacyUser = await authorResolver.ResolveAsync(externalAuthorId, cancellationToken);
                if (legacyUser is null)
                    issues.Add(Issue("Warning", "HELPJUICE_AUTHOR_MAPPING_MISSING",
                        $"Helpjuice author ID '{externalAuthorId}' has no user mapping. The external ID was retained for review.",
                        "questions.csv", row.RowNumber, "Question", id,
                        $"authorStatus=unresolved;created_by_id={externalAuthorId};usersCsvAvailable={package.KnownCsvFiles.ContainsKey("users.csv").ToString().ToLowerInvariant()}"));
                else
                    issues.Add(Issue("Info", "HELPJUICE_AUTHOR_RESOLVED",
                        $"Helpjuice author ID '{externalAuthorId}' was resolved to legacy author metadata.",
                        "questions.csv", row.RowNumber, "Question", id,
                        $"authorStatus=resolved;created_by_id={externalAuthorId}"));
            }

            questions.Add(new(row.RowNumber, id, slug, name, NullIfEmpty(row["description"]), published,
                created, updated, NullIfEmpty(row["category_id"]), row.Values, archived, newerDraft, ParseInt(row["language_id"]),
                NullIfEmpty(row["translation_id"]), NullIfEmpty(row["created_by_id"]), NullIfEmpty(row["updated_by_id"]),
                ParseInt(row["position"]) ?? 0, SplitIds(row["related_question_ids"]), SplitIds(row["upload_ids"]),
                visibility.Value, visibility.WasExplicit, legacyUser?.Name, legacyUser?.Email, externalAuthorId));
        }

        var answers = answersCsv.Rows.Select(row => new HelpJuiceAnswer(row.RowNumber,
            row["id"].Trim(), row["question_id"].Trim(), row["body"], row.Values)).ToArray();
        AddDuplicateIssues(questions.Select(x => (x.Id, x.RowNumber)), "QUESTION_ID_DUPLICATE", "questions.csv", "Question", issues, Issue);
        AddDuplicateIssues(answers.Select(x => (x.Id, x.RowNumber)), "ANSWER_ID_DUPLICATE", "answers.csv", "Answer", issues, Issue);

        // HelpJuice translations commonly share codenames. Preserve every row and allocate stable source slugs.
        foreach (var group in questions.GroupBy(x => x.Slug, StringComparer.OrdinalIgnoreCase).Where(g => g.Count() > 1))
        {
            var ordered = group.OrderBy(x => x.RowNumber).ToArray();
            for (var index = 1; index < ordered.Length; index++)
            {
                var question = ordered[index];
                var repaired = AppendExternalId(question.Slug, question.Id, 350);
                questions[questions.FindIndex(x => ReferenceEquals(x, question))] = question with { Slug = repaired };
                issues.Add(Issue("Warning", "DUPLICATE_SLUG_RESOLVED", $"Duplicate source codename was resolved as '{repaired}'.",
                    "questions.csv", question.RowNumber, "Question", question.Id, "automaticallyRepaired=true;field=codename"));
            }
        }
        if (destinationArticleSlugs is not null)
            foreach (var question in questions.Where(q => destinationArticleSlugs.Contains(q.Slug)))
                issues.Add(Issue("Warning", "DESTINATION_SLUG_CONFLICT", $"Destination slug '{question.Slug}' exists. Import will use its external mapping or append the HelpJuice ID.",
                    "questions.csv", question.RowNumber, "Question", question.Id, "automaticallyRepaired=true;field=slug"));

        var questionIds = questions.Select(x => x.Id).ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach (var answer in answers.Where(a => a.Id.Length == 0 || a.QuestionId.Length == 0))
            issues.Add(Issue("Error", "INVALID_ANSWER_ID", "Answer ID and question_id are required.", "answers.csv", answer.RowNumber, "Answer", answer.Id));
        foreach (var answer in answers.Where(a => a.QuestionId.Length > 0 && !questionIds.Contains(a.QuestionId)))
            issues.Add(Issue("Warning", "ANSWER_QUESTION_MISSING", $"Orphan answer references missing question '{answer.QuestionId}' and will be skipped.", "answers.csv", answer.RowNumber, "Answer", answer.Id));
        foreach (var group in answers.Where(a => questionIds.Contains(a.QuestionId)).GroupBy(a => a.QuestionId, StringComparer.OrdinalIgnoreCase).Where(g => g.Count() > 1))
            issues.Add(Issue("Error", "MULTIPLE_ANSWERS", $"Question '{group.Key}' has multiple answer bodies and cannot be selected safely.", "answers.csv", group.First().RowNumber, "Question", group.Key));

        var categories = await ParseCategoriesAsync(package, limits, issues, Issue, cancellationToken);
        var categorizations = await ParseCategorizationsAsync(package, limits, issues, Issue, cancellationToken);
        var categoryIds = categories.Select(x => x.Id).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var permissionVisibility = await ParsePermissionVisibilityAsync(package, limits, questionIds, categoryIds, cancellationToken);
        if (permissionVisibility.UnresolvedRows.Count > 0)
            issues.Add(Issue("Warning", "LEGACY_PERMISSIONS_NOT_IMPORTED",
                $"{permissionVisibility.UnresolvedRows.Count} row(s) in passes.csv could not be associated with an exported question or category. No KB users or groups were created.",
                "passes.csv", permissionVisibility.UnresolvedRows[0]));
        categories = categories.Select(category => permissionVisibility.CategoryIds.Contains(category.Id)
            ? category with { Visibility = "Internal", VisibilityWasExplicit = true }
            : category).ToList();
        for (var index = 0; index < questions.Count; index++)
            if (permissionVisibility.QuestionIds.Contains(questions[index].Id))
                questions[index] = questions[index] with { Visibility = "Internal", VisibilityWasExplicit = true };
        foreach (var category in categories.Where(x => x.ParentId is not null && !categoryIds.Contains(x.ParentId)))
            issues.Add(Issue("Error", "CATEGORY_PARENT_MISSING", $"Category parent '{category.ParentId}' does not exist.", "categories.csv", category.RowNumber, "Category", category.Id));
        var orderedCategories = OrderCategories(categories, out var cycleIds);
        foreach (var id in cycleIds) issues.Add(Issue("Error", "CATEGORY_CYCLE", $"Category '{id}' participates in a hierarchy cycle.", "categories.csv", type: "Category", id: id));
        var orderedById = orderedCategories.ToDictionary(x => x.Id, StringComparer.OrdinalIgnoreCase);
        var effectiveCategoryVisibility = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var category in orderedCategories)
        {
            var visibility = category.Visibility;
            if (!category.VisibilityWasExplicit && category.ParentId is not null &&
                effectiveCategoryVisibility.GetValueOrDefault(category.ParentId) == "Internal")
                visibility = "Internal";
            effectiveCategoryVisibility[category.Id] = visibility;
        }
        categories = categories.Select(c => c with
        {
            Depth = orderedById.GetValueOrDefault(c.Id)?.Depth ?? 0,
            Visibility = effectiveCategoryVisibility.GetValueOrDefault(c.Id, c.Visibility)
        }).ToList();

        var reverseCategoryIdsByQuestion = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
        foreach (var category in categories)
            foreach (var questionId in category.RelatedQuestionIds ?? [])
            {
                if (!reverseCategoryIdsByQuestion.TryGetValue(questionId, out var values))
                    reverseCategoryIdsByQuestion[questionId] = values = [];
                values.Add(category.Id);
            }
        var recoveredCategoryIdsByQuestion = questions.GroupBy(question => question.Id, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.SelectMany(question =>
                    ExtractQuestionCategoryIds(question.Source, question, categories)
                    .Concat(reverseCategoryIdsByQuestion.GetValueOrDefault(question.Id) ?? []))
                .Distinct(StringComparer.OrdinalIgnoreCase).ToArray(), StringComparer.OrdinalIgnoreCase);
        var rawCategoryIdsByQuestion = questions.GroupBy(question => question.Id, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.SelectMany(question =>
                    (categorizations.GetValueOrDefault(question.Id) ?? [])
                    .Concat(question.CategoryId is null ? [] : [question.CategoryId])
                    .Concat(recoveredCategoryIdsByQuestion.GetValueOrDefault(question.Id) ?? []))
                .Distinct(StringComparer.OrdinalIgnoreCase).ToArray(), StringComparer.OrdinalIgnoreCase);
        var questionsByTranslation = questions
            .GroupBy(question => question.TranslationId ?? question.Id, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.ToArray(), StringComparer.OrdinalIgnoreCase);
        var categoriesById = categories.GroupBy(category => category.Id, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.First(), StringComparer.OrdinalIgnoreCase);
        var categoriesByTranslation = categories
            .GroupBy(category => category.TranslationId ?? category.Id, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.ToArray(), StringComparer.OrdinalIgnoreCase);

        for (var index = 0; index < questions.Count; index++)
        {
            var question = questions[index];
            var related = rawCategoryIdsByQuestion[question.Id];
            var declaredCount = ParseInt(question.Source.GetValueOrDefault("categories_count") ?? "");
            var directCategoryIds = (categorizations.GetValueOrDefault(question.Id) ?? [])
                .Concat(question.CategoryId is null ? [] : [question.CategoryId])
                .ToHashSet(StringComparer.OrdinalIgnoreCase);
            var metadataRecovered = (recoveredCategoryIdsByQuestion.GetValueOrDefault(question.Id) ?? [])
                .Where(id => !directCategoryIds.Contains(id)).ToArray();
            if (metadataRecovered.Length > 0)
                issues.Add(Issue("Warning", "CATEGORY_RELATIONSHIP_RECONSTRUCTED",
                    "Missing HelpJuice categorization rows were reconstructed from unambiguous article/category export metadata.",
                    "questions.csv", question.RowNumber, "Question", question.Id,
                    "automaticallyRepaired=true;field=category metadata"));
            var reconstructed = TryReconstructTranslatedCategories(question, related, declaredCount,
                rawCategoryIdsByQuestion, questionsByTranslation, categoriesById, categoriesByTranslation);
            if (reconstructed is not null)
            {
                related = reconstructed;
                issues.Add(Issue("Warning", "CATEGORY_RELATIONSHIP_RECONSTRUCTED",
                    "Missing HelpJuice categorization rows were reconstructed from an unambiguous translated article/category relationship.",
                    "questions.csv", question.RowNumber, "Question", question.Id,
                    "automaticallyRepaired=true;field=translation_id,category_id"));
            }
            if (declaredCount is not null && declaredCount != related.Length)
                issues.Add(Issue("Warning", "CATEGORY_COUNT_MISMATCH", $"HelpJuice reports {declaredCount} categories but its category fields contain {related.Length} distinct relationships.",
                    "questions.csv", question.RowNumber, "Question", question.Id, "automaticallyRepaired=true;field=categories_count"));
            foreach (var missingCategory in related.Where(id => !categoryIds.Contains(id)))
                issues.Add(Issue("Warning", "ARTICLE_CATEGORY_MISSING", $"Categorization references missing category '{missingCategory}'; the article will remain uncategorized.",
                    "categorizations.csv", null, "Question", question.Id, "automaticallyRepaired=false;field=category_id"));
            var valid = related.Where(categoryIds.Contains).ToArray();
            if (valid.Length == 0 && declaredCount != 0)
                issues.Add(Issue("Warning", "UNCATEGORIZED_ARTICLE", "No valid row in categorizations.csv exists; the article will remain uncategorized.",
                    "questions.csv", question.RowNumber, "Question", question.Id, $"automaticallyRepaired=false;language_id={question.LanguageId?.ToString() ?? ""}"));
            if (valid.Length > 1)
                issues.Add(Issue("Warning", "MULTIPLE_CATEGORIES", $"The target schema supports one category; the first of {valid.Length} ordered HelpJuice relationships will be used.",
                    "categorizations.csv", null, "Question", question.Id, "automaticallyRepaired=true;field=category_id"));
            var sourceMetadata = new Dictionary<string, string>(question.Source, StringComparer.OrdinalIgnoreCase);
            if (related.Length > 0) sourceMetadata["categorizations.category_ids"] = string.Join(',', related);
            if (metadataRecovered.Length > 0) sourceMetadata["migration.category_reconstruction"] = "export_metadata";
            if (reconstructed is not null) sourceMetadata["migration.category_reconstruction"] = "translation_id";
            var visibility = question.Visibility;
            if (!question.VisibilityWasExplicit && valid.Any(id => categories.Any(category =>
                    category.Id.Equals(id, StringComparison.OrdinalIgnoreCase) && category.Visibility == "Internal")))
                visibility = "Internal";
            sourceMetadata["migration.visibility"] = visibility;
            questions[index] = question with { CategoryId = valid.FirstOrDefault(), Source = sourceMetadata, Visibility = visibility };
        }

        var questionById = questions.GroupBy(x => x.Id, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(x => x.Key, x => x.First(), StringComparer.OrdinalIgnoreCase);
        foreach (var question in questions)
            foreach (var related in question.RelatedQuestionIds ?? [])
                if (!questionIds.Contains(related))
                    issues.Add(Issue("Warning", "STALE_RELATED_QUESTION", $"Related question '{related}' is not present in this export and will be ignored.",
                        "questions.csv", question.RowNumber, "Question", question.Id, $"automaticallyRepaired=false;affectedRelatedQuestion={related}"));

        var uploads = await ParseUploadsAsync(package, limits, issues, Issue, cancellationToken);
        var mediaBySource = BuildMediaSourceMap(uploads);
        var localMediaNames = package.MediaFiles.Select(Path.GetFileName).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var answersByQuestion = answers.GroupBy(x => x.QuestionId, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);
        var emptyBodies = questions.Count(q => !answersByQuestion.TryGetValue(q.Id, out var answer) || string.IsNullOrWhiteSpace(answer.Body));
        foreach (var question in questions.Where(q => !answersByQuestion.TryGetValue(q.Id, out var answer) || string.IsNullOrWhiteSpace(answer.Body)))
            issues.Add(Issue("Warning", "EMPTY_SOURCE_BODY", "The exported answer body is empty; a valid empty editor document will be imported.",
                "questions.csv", question.RowNumber, "Question", question.Id, "automaticallyRepaired=true;field=body"));

        var convertedAnswers = new Dictionary<string, HelpJuiceHtmlConversion>(StringComparer.OrdinalIgnoreCase);
        var missingMedia = 0;
        var linkResolvers = new Dictionary<int, Func<string, HelpJuiceLinkResolution?>>();
        foreach (var answer in answers.Where(a => questionIds.Contains(a.QuestionId)))
        {
            var question = questionById[answer.QuestionId];
            var languageKey = question.LanguageId ?? int.MinValue;
            if (!linkResolvers.TryGetValue(languageKey, out var linkResolver))
                linkResolvers[languageKey] = linkResolver = CreateLinkResolver(questions, question, mappedArticleSlugs);
            (Guid MediaId, string Url)? InlineResolver(string source)
            {
                if (!source.StartsWith("data:image/", StringComparison.OrdinalIgnoreCase)) return null;
                var comma = source.IndexOf(',');
                if (comma < 0) return null;
                var hash = Convert.ToHexString(SHA256.HashData(Encoding.ASCII.GetBytes(source[(comma + 1)..]))).ToLowerInvariant();
                var id = StableGuid($"helpjuice:inline:{question.Id}:{hash}");
                return (id, $"/api/media/{id}/content");
            }
            var conversion = HelpJuiceHtmlConverter.Convert(answer.Body, InlineResolver, linkResolver);
            if (answer.Id.Length > 0) convertedAnswers.TryAdd(answer.Id, conversion);
            if (Encoding.UTF8.GetByteCount(answer.Body) > limits.MaxArticleContentSizeBytes &&
                Encoding.UTF8.GetByteCount(conversion.TiptapJson) <= limits.MaxArticleContentSizeBytes)
                issues.Add(Issue("Warning", "LARGE_SOURCE_NORMALIZED", "Large legacy HTML was accepted after embedded media and markup normalization.",
                    "answers.csv", answer.RowNumber, "Answer", answer.Id, "automaticallyRepaired=true;field=body"));
            if (Encoding.UTF8.GetByteCount(conversion.TiptapJson) > limits.MaxArticleContentSizeBytes)
                issues.Add(Issue("Error", "NORMALIZED_CONTENT_TOO_LARGE", "Normalized editable content exceeds the configured storage limit without embedded media.",
                    "answers.csv", answer.RowNumber, "Answer", answer.Id));
            foreach (var source in conversion.MediaSources.Where(s => !s.StartsWith("data:", StringComparison.OrdinalIgnoreCase)))
            {
                if (source.StartsWith("blob:", StringComparison.OrdinalIgnoreCase))
                {
                    missingMedia++;
                    issues.Add(Issue("Warning", "UNRESOLVED_TEMPORARY_MEDIA", $"Temporary browser media '{Limit(source)}' cannot be recovered; source metadata was preserved.", "answers.csv", answer.RowNumber, "Answer", answer.Id));
                    continue;
                }
                if (source.StartsWith('/') && !source.StartsWith("//"))
                {
                    missingMedia++;
                    issues.Add(Issue("Warning", "UNRESOLVED_RELATIVE_MEDIA", $"Relative media '{Limit(source)}' could not be matched safely and was preserved.", "answers.csv", answer.RowNumber, "Answer", answer.Id));
                    continue;
                }
                var name = Path.GetFileName(Uri.TryCreate(source, UriKind.Absolute, out var uri) ? uri.LocalPath : source);
                if (name.Length > 0 && (localMediaNames.Contains(name) || mediaBySource.ContainsKey(source) || uploads.Any(u => u.FileName.Equals(name, StringComparison.OrdinalIgnoreCase)))) continue;
                missingMedia++;
                issues.Add(Issue("Warning", "EXTERNAL_MEDIA_LEFT_EXTERNAL", $"External media '{Limit(source)}' is not in uploads.csv and will remain external.", "answers.csv", answer.RowNumber, "Answer", answer.Id));
            }
            foreach (var warning in conversion.Warnings.Where(w => w.Code is not "UNRESOLVED_MEDIA" and not "UNRESOLVED_TEMPORARY_MEDIA"))
                issues.Add(Issue("Warning", warning.Code, warning.Message, "answers.csv", answer.RowNumber, "Answer", answer.Id));
        }

        var categorizationFirst = categorizations.ToDictionary(x => x.Key, x => x.Value.FirstOrDefault() ?? "", StringComparer.OrdinalIgnoreCase);
        var summary = new HelpJuiceValidationSummary(questions.Count, questions.Count(q => q.IsPublished), questions.Count(q => !q.IsPublished),
            categories.Count, categories.Count == 0 ? 0 : categories.Max(c => c.Depth) + 1, emptyBodies,
            issues.Count(i => i.ErrorCode.EndsWith("_DUPLICATE", StringComparison.Ordinal)),
            issues.Count(i => i.ErrorCode == "DUPLICATE_SLUG_RESOLVED"),
            issues.Count(i => i.ErrorCode is "ARTICLE_CATEGORY_MISSING" or "CATEGORY_PARENT_MISSING"), missingMedia,
            package.AvailableFiles, missing, package.UnsupportedFiles, issues.Count(i => i.Severity == "Error"), issues.Count(i => i.Severity == "Warning"));
        return new(questions, answers, categories, categorizationFirst, package.MediaFiles, mediaBySource,
            convertedAnswers, issues, summary, uploads);
    }

    public static IReadOnlyList<HelpJuiceCategory> OrderCategories(IReadOnlyList<HelpJuiceCategory> categories, out IReadOnlyList<string> cycleIds)
    {
        var byId = categories.GroupBy(c => c.Id, StringComparer.OrdinalIgnoreCase).ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);
        var state = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase); var depths = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase); var result = new List<HelpJuiceCategory>(); var cycles = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        void Visit(HelpJuiceCategory c)
        {
            if (state.GetValueOrDefault(c.Id) == 2) return;
            if (state.GetValueOrDefault(c.Id) == 1) { cycles.Add(c.Id); return; }
            state[c.Id] = 1; var depth = 0;
            if (c.ParentId is not null && byId.TryGetValue(c.ParentId, out var parent)) { Visit(parent); if (cycles.Contains(parent.Id)) cycles.Add(c.Id); depth = depths.GetValueOrDefault(parent.Id) + 1; }
            state[c.Id] = 2; depths[c.Id] = depth; result.Add(c with { Depth = depth });
        }
        foreach (var c in categories.OrderBy(x => x.SortOrder).ThenBy(x => x.RowNumber)) Visit(c);
        cycleIds = cycles.ToArray(); return result;
    }

    public static string NormalizeSlug(string value)
    {
        var decoded = value.Trim().ToLowerInvariant().Normalize(NormalizationForm.FormKC); var b = new StringBuilder(); var dash = false;
        foreach (var ch in decoded)
        {
            if (char.IsLetterOrDigit(ch)) { b.Append(ch); dash = false; }
            else if (!dash && b.Length > 0) { b.Append('-'); dash = true; }
        }
        var result = b.ToString().Trim('-');
        return result[..Math.Min(result.Length, 350)];
    }

    public static Guid StableGuid(string value)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(value));
        var guid = bytes[..16];
        guid[7] = (byte)((guid[7] & 0x0f) | 0x50);
        guid[8] = (byte)((guid[8] & 0x3f) | 0x80);
        return new Guid(guid);
    }

    public static string AppendExternalId(string stem, string externalId, int maxLength)
    {
        var suffix = $"-{NormalizeSlug(externalId)}";
        var prefix = stem[..Math.Min(stem.Length, Math.Max(1, maxLength - suffix.Length))].TrimEnd('-');
        return prefix + suffix;
    }

    public static Func<string, HelpJuiceLinkResolution?> CreateLinkResolver(IReadOnlyList<HelpJuiceQuestion> questions,
        HelpJuiceQuestion? sourceQuestion = null,
        IReadOnlyDictionary<string, string>? targetSlugsByExternalId = null)
    {
        var byLegacySlug = questions.SelectMany(question => QuestionLinkAliases(question)
                .Select(alias => (Alias: alias, Question: question)))
            .GroupBy(item => item.Alias, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key,
                group => group.Select(item => item.Question).DistinctBy(question => question.Id,
                    StringComparer.OrdinalIgnoreCase).ToArray(), StringComparer.OrdinalIgnoreCase);
        var byId = questions.GroupBy(q => q.Id, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);
        return href => ResolveHelpJuiceLink(href, byLegacySlug, byId, sourceQuestion?.LanguageId,
            targetSlugsByExternalId);
    }

    private static HelpJuiceLinkResolution? ResolveHelpJuiceLink(string href,
        IReadOnlyDictionary<string, HelpJuiceQuestion[]> byLegacySlug,
        IReadOnlyDictionary<string, HelpJuiceQuestion> byId, int? sourceLanguageId,
        IReadOnlyDictionary<string, string>? targetSlugsByExternalId)
    {
        string Target(HelpJuiceQuestion question) => $"/kb/{targetSlugsByExternalId?.GetValueOrDefault(question.Id) ?? question.Slug}";
        if (!Uri.TryCreate(href, UriKind.Absolute, out var uri) ||
            !(uri.Host.Equals("helpjuice.com", StringComparison.OrdinalIgnoreCase) ||
              uri.Host.EndsWith(".helpjuice.com", StringComparison.OrdinalIgnoreCase))) return null;
        var rawParts = uri.AbsolutePath.Split('/', StringSplitOptions.RemoveEmptyEntries);
        var parts = rawParts.Where((part, index) => !part.Equals("version", StringComparison.OrdinalIgnoreCase) &&
                (index == 0 || !rawParts[index - 1].Equals("version", StringComparison.OrdinalIgnoreCase)))
            .Select(Uri.UnescapeDataString).ToArray();
        foreach (var part in parts.Reverse())
        {
            if (byId.TryGetValue(part, out var exact)) return new(Target(exact));
            foreach (Match match in Regex.Matches(part, @"\d+"))
                if (byId.TryGetValue(match.Value, out var identified)) return new(Target(identified));
        }
        var query = System.Web.HttpUtility.ParseQueryString(uri.Query);
        foreach (var name in new[] { "id", "question_id", "article_id", "questionId", "articleId", "content_id", "contentId", "qid" })
            if (byId.TryGetValue(query[name] ?? string.Empty, out var identified)) return new(Target(identified));
        var queryCandidates = new[] { "slug", "codename", "path", "url" }
            .Select(name => query[name]).Where(value => !string.IsNullOrWhiteSpace(value)).Select(value => value!);
        var key = parts.Concat(queryCandidates).Reverse().SelectMany(LinkSlugCandidates)
            .FirstOrDefault(byLegacySlug.ContainsKey);
        if (key is null) return new(href, "UNRESOLVED_INTERNAL_LINK",
            $"HelpJuice link '{Limit(href)}' could not be matched by article ID, codename, slug, or migration target and was preserved.");
        var matches = byLegacySlug[key];
        if (matches.Length == 1) return new(Target(matches[0]));
        var sameLanguage = matches.Where(question => question.LanguageId == sourceLanguageId).ToArray();
        return sameLanguage.Length == 1
            ? new(Target(sameLanguage[0]))
            : new(href, "AMBIGUOUS_INTERNAL_LINK", "A HelpJuice link matches multiple translated articles and was preserved.");
    }

    private static IEnumerable<string> LinkSlugCandidates(string value)
    {
        var decoded = Uri.UnescapeDataString(value).Trim('/');
        var normalized = NormalizeSlug(decoded);
        if (normalized.Length == 0) yield break;
        yield return normalized;
        var withoutHtml = Regex.Replace(normalized, @"-(?:html?|aspx?)$", "", RegexOptions.IgnoreCase);
        if (!withoutHtml.Equals(normalized, StringComparison.OrdinalIgnoreCase)) yield return withoutHtml;
        var withoutLeadingId = Regex.Replace(withoutHtml, @"^\d+-", "");
        if (!withoutLeadingId.Equals(withoutHtml, StringComparison.OrdinalIgnoreCase)) yield return withoutLeadingId;
    }

    private static IEnumerable<string> QuestionLinkAliases(HelpJuiceQuestion question)
    {
        foreach (var value in new[] { question.Slug, question.Name }.Concat(
                     new[] { "codename", "slug", "url", "path", "permalink" }
                         .Select(field => question.Source.GetValueOrDefault(field) ?? ""))
                 .Where(value => !string.IsNullOrWhiteSpace(value)))
        {
            if (Uri.TryCreate(value, UriKind.Absolute, out var uri))
                foreach (var part in uri.AbsolutePath.Split('/', StringSplitOptions.RemoveEmptyEntries).Reverse())
                    foreach (var candidate in LinkSlugCandidates(part)) yield return candidate;
            foreach (var candidate in LinkSlugCandidates(value)) yield return candidate;
        }
    }

    private static async Task<List<HelpJuiceCategory>> ParseCategoriesAsync(PackageContents package, HelpJuiceMigrationLimits limits,
        List<MigrationIssueData> issues, Func<string,string,string,string?,int?,string?,string?,string?,MigrationIssueData> issue, CancellationToken ct)
    {
        if (!package.KnownCsvFiles.TryGetValue("categories.csv", out var path)) return [];
        var csv = await HelpJuiceCsvReader.ReadAsync(path, limits.MaxCsvRows, ct); RequireColumns(csv, ["id", "name"], issues, issue);
        var result = csv.Rows.Select(r =>
        {
            var visibility = ParseVisibility(r);
            return new HelpJuiceCategory(r.RowNumber, r["id"].Trim(), NullIfEmpty(r["parent_id"]), r["name"].Trim(), 0,
                NormalizeSlug(First(r, "codename", "name")), ParseInt(r["position"]) ?? r.RowNumber,
                ParseBoolean(r["archived"], out _), ParseInt(r["language_id"]), visibility.Value, visibility.WasExplicit,
                NullIfEmpty(r["translation_id"]), r.Values,
                ExtractReferenceIds(r, ["question_ids", "questions_ids", "published_question_ids",
                    "draft_question_ids", "article_ids"], ["questions", "published_questions", "draft_questions", "articles"],
                    new HashSet<string>(["id", "question_id", "article_id"], StringComparer.OrdinalIgnoreCase)));
        }).ToList();
        AddDuplicateIssues(result.Select(x => (x.Id, x.RowNumber)), "CATEGORY_ID_DUPLICATE", "categories.csv", "Category", issues, issue);
        return result;
    }

    private sealed record PermissionVisibility(HashSet<string> QuestionIds, HashSet<string> CategoryIds,
        List<int> UnresolvedRows);

    private static async Task<Dictionary<string, HelpJuiceLegacyAuthor>> ParseLegacyUsersAsync(PackageContents package,
        HelpJuiceMigrationLimits limits, List<MigrationIssueData> issues,
        Func<string,string,string,string?,int?,string?,string?,string?,MigrationIssueData> issue,
        CancellationToken ct)
    {
        var identityHeaders = new[] { "name", "full_name", "display_name", "first_name", "last_name", "email",
            "email_address", "firstName", "lastName", "fullName", "displayName" };
        var result = new Dictionary<string, HelpJuiceLegacyAuthor>(StringComparer.OrdinalIgnoreCase);
        const string sourceName = "users.csv";
        if (package.KnownCsvFiles.TryGetValue(sourceName, out var path))
        {
            var csv = await HelpJuiceCsvReader.ReadAsync(path, limits.MaxCsvRows, ct);
            var hasAccountKey = csv.Headers.Contains("id", StringComparer.OrdinalIgnoreCase);
            var hasIdentity = csv.Headers.Any(header => identityHeaders.Contains(header, StringComparer.OrdinalIgnoreCase));
            if (!hasAccountKey || !hasIdentity)
            {
                issues.Add(issue("Warning", "UNSUPPORTED_FILE",
                    $"Unsupported file '{sourceName}' does not contain recognizable HelpJuice account identity columns and will not be imported.",
                    sourceName, null, "Package", null, null));
                return result;
            }
            foreach (var row in csv.Rows)
            {
                var id = row["id"].Trim();
                if (id.Length == 0) continue;
                var name = NullIfEmpty(First(row, "name", "full_name", "display_name", "fullName", "displayName"))
                    ?? CombineName(row, "first_name", "last_name")
                    ?? CombineName(row, "firstName", "lastName");
                var author = new HelpJuiceLegacyAuthor(id, name,
                    NullIfEmpty(First(row, "email", "email_address")));
                if (!result.TryAdd(id, author))
                    issues.Add(issue("Warning", "HELPJUICE_USER_ID_DUPLICATE",
                        $"Duplicate Helpjuice user ID '{id}' was ignored after the first mapping.",
                        sourceName, row.RowNumber, "User", id, "authorStatus=duplicate-user-mapping"));
            }
        }
        return result;
    }

    private static async Task<PermissionVisibility> ParsePermissionVisibilityAsync(PackageContents package,
        HelpJuiceMigrationLimits limits, IReadOnlySet<string> questionIds, IReadOnlySet<string> categoryIds,
        CancellationToken ct)
    {
        var result = new PermissionVisibility(new(StringComparer.OrdinalIgnoreCase),
            new(StringComparer.OrdinalIgnoreCase), []);
        if (!package.KnownCsvFiles.TryGetValue("passes.csv", out var path)) return result;
        var csv = await HelpJuiceCsvReader.ReadAsync(path, limits.MaxCsvRows, ct);
        foreach (var row in csv.Rows)
        {
            var questionId = First(row, "question_id");
            var categoryId = First(row, "category_id");
            if (questionIds.Contains(questionId)) { result.QuestionIds.Add(questionId); continue; }
            if (categoryIds.Contains(categoryId)) { result.CategoryIds.Add(categoryId); continue; }

            var targetId = First(row, "passable_id", "resource_id", "accessible_id", "item_id", "content_id");
            var targetType = First(row, "passable_type", "resource_type", "accessible_type", "item_type", "content_type");
            if (targetType.Contains("question", StringComparison.OrdinalIgnoreCase) && questionIds.Contains(targetId))
                result.QuestionIds.Add(targetId);
            else if (targetType.Contains("categor", StringComparison.OrdinalIgnoreCase) && categoryIds.Contains(targetId))
                result.CategoryIds.Add(targetId);
            else if (questionIds.Contains(targetId) && !categoryIds.Contains(targetId)) result.QuestionIds.Add(targetId);
            else if (categoryIds.Contains(targetId) && !questionIds.Contains(targetId)) result.CategoryIds.Add(targetId);
            else
            {
                var questionMatches = ExtractMatchingPermissionTargets(row, questionIds);
                var categoryMatches = ExtractMatchingPermissionTargets(row, categoryIds);
                if (questionMatches.Count > 0 && categoryMatches.Count == 0)
                    result.QuestionIds.UnionWith(questionMatches);
                else if (categoryMatches.Count > 0 && questionMatches.Count == 0)
                    result.CategoryIds.UnionWith(categoryMatches);
                else result.UnresolvedRows.Add(row.RowNumber);
            }
        }
        return result;
    }

    private static (string Value, bool WasExplicit) ParseVisibility(CsvRow row)
    {
        foreach (var field in new[] { "visibility_id", "accessibility", "accessibility_id", "visibility" })
        {
            var raw = row[field].Trim();
            if (raw.Length == 0) continue;
            if (raw.Contains("public", StringComparison.OrdinalIgnoreCase) || raw == "1") return ("Public", true);
            if (raw.Contains("internal", StringComparison.OrdinalIgnoreCase) ||
                raw.Contains("private", StringComparison.OrdinalIgnoreCase) ||
                raw.Contains("url", StringComparison.OrdinalIgnoreCase) || raw is "0" or "2" or "4")
                return ("Internal", true);
        }
        foreach (var field in new[] { "is_internal", "internal" })
        {
            if (row[field].Length == 0) continue;
            var parsed = ParseBoolean(row[field], out var valid);
            if (valid) return (parsed ? "Internal" : "Public", true);
        }
        if (row["is_private"].Length > 0 && ParseBoolean(row["is_private"], out var privateValid) && privateValid)
            return ("Internal", true);
        if (row["is_public"].Length > 0 && ParseBoolean(row["is_public"], out var publicValid) && publicValid)
            return ("Public", true);
        return ("Public", false);
    }

    private static string? CombineName(CsvRow row, string firstNameField, string lastNameField)
    {
        var combined = $"{row[firstNameField].Trim()} {row[lastNameField].Trim()}".Trim();
        return NullIfEmpty(combined);
    }

    private static HashSet<string> ExtractMatchingPermissionTargets(CsvRow row, IReadOnlySet<string> knownIds)
    {
        var targetFields = new HashSet<string>(["article_id", "article_ids", "document_id", "document_ids",
            "question_ids", "category_ids", "target_id", "target_ids", "permissionable_id", "permissionable_ids",
            "restrictable_id", "restrictable_ids"],
            StringComparer.OrdinalIgnoreCase);
        return row.Values.Where(pair => targetFields.Contains(pair.Key))
            .SelectMany(pair => SplitReferenceList(pair.Value)).Where(knownIds.Contains)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
    }

    private static IReadOnlyList<string> ExtractQuestionCategoryIds(IReadOnlyDictionary<string, string> source,
        HelpJuiceQuestion question, IReadOnlyList<HelpJuiceCategory> categories)
    {
        var row = new CsvRow(question.RowNumber, source);
        var explicitIds = ExtractReferenceIds(row,
            ["category_ids", "categories_ids", "joined_category_ids", "categorized_category_ids"],
            ["categories"], new HashSet<string>(["id", "category_id"], StringComparer.OrdinalIgnoreCase));
        if (explicitIds.Count > 0) return explicitIds;
        if (ParseInt(source.GetValueOrDefault("categories_count") ?? "") is not 1) return [];
        var labels = new[] { "first_category", "category", "category_name", "first_category_name",
                "category_codename", "category_slug" }
            .Select(field => source.GetValueOrDefault(field)?.Trim()).Where(value => !string.IsNullOrWhiteSpace(value))
            .Select(value => NormalizeSlug(value!)).Where(value => value.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase);
        foreach (var label in labels)
        {
            var matches = categories.Where(category =>
                    (category.LanguageId is null || question.LanguageId is null || category.LanguageId == question.LanguageId) &&
                    (category.Slug.Equals(label, StringComparison.OrdinalIgnoreCase) ||
                     NormalizeSlug(category.Name).Equals(label, StringComparison.OrdinalIgnoreCase)))
                .Select(category => category.Id).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
            if (matches.Length == 1) return matches;
        }
        return [];
    }

    private static IReadOnlyList<string> ExtractReferenceIds(CsvRow row, IReadOnlyList<string> listFields,
        IReadOnlyList<string> structuredFields, IReadOnlySet<string> objectIdNames)
    {
        var result = listFields.SelectMany(field => SplitReferenceList(row[field])).ToList();
        foreach (var field in structuredFields)
        {
            var value = row[field].Trim();
            if (value.Length == 0) continue;
            try
            {
                using var document = JsonDocument.Parse(value);
                CollectObjectIds(document.RootElement, objectIdNames, result);
            }
            catch (JsonException)
            {
                // Structured relationships are used only when valid JSON proves the target IDs.
            }
        }
        return result.Where(value => value.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
    }

    private static void CollectObjectIds(JsonElement element, IReadOnlySet<string> objectIdNames, List<string> result)
    {
        if (element.ValueKind is JsonValueKind.String or JsonValueKind.Number)
        {
            result.Add(element.ToString().Trim());
            return;
        }
        if (element.ValueKind == JsonValueKind.Array)
        {
            foreach (var child in element.EnumerateArray()) CollectObjectIds(child, objectIdNames, result);
            return;
        }
        if (element.ValueKind != JsonValueKind.Object) return;
        foreach (var property in element.EnumerateObject())
        {
            if (objectIdNames.Contains(property.Name) && property.Value.ValueKind is JsonValueKind.String or JsonValueKind.Number)
                result.Add(property.Value.ToString().Trim());
            else if (property.Value.ValueKind is JsonValueKind.Array or JsonValueKind.Object)
                CollectObjectIds(property.Value, objectIdNames, result);
        }
    }

    private static IEnumerable<string> SplitReferenceList(string value) => value
        .Trim().Trim('[', ']', '(', ')', '{', '}')
        .Split([',', ';', '|', ' ', '\t', '\r', '\n'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
        .Select(item => item.Trim('"', '\''))
        .Where(item => item.Length > 0);

    private static string[]? TryReconstructTranslatedCategories(HelpJuiceQuestion question,
        IReadOnlyList<string> directCategoryIds, int? declaredCount,
        IReadOnlyDictionary<string, string[]> categoryIdsByQuestion,
        IReadOnlyDictionary<string, HelpJuiceQuestion[]> questionsByTranslation,
        IReadOnlyDictionary<string, HelpJuiceCategory> categoriesById,
        IReadOnlyDictionary<string, HelpJuiceCategory[]> categoriesByTranslation)
    {
        var translationKey = question.TranslationId ?? question.Id;
        if (!questionsByTranslation.TryGetValue(translationKey, out var siblings) || siblings.Length < 2) return null;
        if (declaredCount is not null && directCategoryIds.Count >= declaredCount) return null;

        var inherited = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var sibling in siblings.Where(sibling => !sibling.Id.Equals(question.Id, StringComparison.OrdinalIgnoreCase)))
        {
            foreach (var sourceId in categoryIdsByQuestion.GetValueOrDefault(sibling.Id) ?? [])
            {
                if (!categoriesById.TryGetValue(sourceId, out var sourceCategory)) continue;
                if (sourceCategory.LanguageId is null || question.LanguageId is null ||
                    sourceCategory.LanguageId == question.LanguageId)
                {
                    inherited.Add(sourceCategory.Id);
                    continue;
                }
                var categoryTranslationKey = sourceCategory.TranslationId ?? sourceCategory.Id;
                if (!categoriesByTranslation.TryGetValue(categoryTranslationKey, out var translated)) continue;
                var matches = translated.Where(category => category.LanguageId == question.LanguageId).ToArray();
                if (matches.Length == 1) inherited.Add(matches[0].Id);
            }
        }

        var combined = directCategoryIds.Where(categoriesById.ContainsKey).Concat(inherited)
            .Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        if (combined.Length == directCategoryIds.Count || combined.Length == 0) return null;
        return declaredCount is null || combined.Length == declaredCount ? combined : null;
    }

    private static async Task<Dictionary<string, List<string>>> ParseCategorizationsAsync(PackageContents p, HelpJuiceMigrationLimits l,
        List<MigrationIssueData> issues, Func<string,string,string,string?,int?,string?,string?,string?,MigrationIssueData> issue, CancellationToken ct)
    {
        var result = new Dictionary<string, List<(int Position, int Row, string Category)>>(StringComparer.OrdinalIgnoreCase);
        if (!p.KnownCsvFiles.TryGetValue("categorizations.csv", out var path)) return new(StringComparer.OrdinalIgnoreCase);
        var csv = await HelpJuiceCsvReader.ReadAsync(path,l.MaxCsvRows,ct);
        RequireColumns(csv, ["question_id", "category_id"], issues, issue);
        foreach (var r in csv.Rows)
        {
            var q = First(r,"question_id","categorizable_id"); var c = First(r,"category_id");
            if (q.Length == 0 || c.Length == 0) { issues.Add(issue("Warning", "INVALID_CATEGORIZATION", "A categorization with a missing question/category ID was skipped.", "categorizations.csv", r.RowNumber, "Categorization", r["id"], null)); continue; }
            if (!result.TryGetValue(q, out var list)) result[q] = list = [];
            list.Add((ParseInt(r["position"]) ?? int.MaxValue, r.RowNumber, c));
        }
        return result.ToDictionary(x => x.Key, x => x.Value.OrderBy(v => v.Position).ThenBy(v => v.Row).Select(v => v.Category).Distinct(StringComparer.OrdinalIgnoreCase).ToList(), StringComparer.OrdinalIgnoreCase);
    }

    private static async Task<List<HelpJuiceUpload>> ParseUploadsAsync(PackageContents p, HelpJuiceMigrationLimits l,
        List<MigrationIssueData> issues, Func<string,string,string,string?,int?,string?,string?,string?,MigrationIssueData> issue, CancellationToken ct)
    {
        if (!p.KnownCsvFiles.TryGetValue("uploads.csv", out var path)) return [];
        var csv = await HelpJuiceCsvReader.ReadAsync(path,l.MaxCsvRows,ct);
        RequireColumns(csv, ["id", "image"], issues, issue);
        var result = new List<HelpJuiceUpload>();
        var packagedNames = p.MediaFiles.Select(Path.GetFileName).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var normalizedPackagedNames = p.MediaFiles.GroupBy(MediaFileMatchKey, StringComparer.OrdinalIgnoreCase)
            .Where(group => group.Key.Length > 0 && group.Count() == 1)
            .Select(group => group.Key).ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach (var r in csv.Rows)
        {
            var id = r["id"].Trim(); var file = First(r, "image", "file_name", "filename", "path", "key");
            if (id.Length == 0 || file.Length == 0) { issues.Add(issue("Warning", "INVALID_UPLOAD_METADATA", "Upload metadata without an ID or filename was skipped.", "uploads.csv", r.RowNumber, "Media", id, null)); continue; }
            var extension = First(r, "ext_name"); if (extension.Length > 0 && !extension.StartsWith('.')) extension = "." + extension;
            if (extension.Length == 0) extension = Path.GetExtension(file);
            var preview = NullIfEmpty(r["preview_url"]);
            if (preview is null && !packagedNames.Contains(Path.GetFileName(file)) &&
                !normalizedPackagedNames.Contains(MediaFileMatchKey(file)))
                issues.Add(issue("Warning", "MISSING_MEDIA_URL", "The upload has no preview_url and no packaged filename match; its bytes cannot be recovered from this export.", "uploads.csv", r.RowNumber, "Media", id, "automaticallyRepaired=false;field=preview_url"));
            result.Add(new(r.RowNumber, id, file, preview, NullIfEmpty(r["checksum"]), MimeFromUpload(r, extension), extension,
                long.TryParse(r["image_size"], out var size) ? size : null, ParseDate(r["created_at"], out _), r.Values));
        }
        AddDuplicateIssues(result.Select(x => (x.Id, x.RowNumber)), "UPLOAD_ID_DUPLICATE", "uploads.csv", "Media", issues, issue);
        return result;
    }

    private static Dictionary<string,string> BuildMediaSourceMap(IEnumerable<HelpJuiceUpload> uploads)
    {
        var result = new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);
        foreach (var upload in uploads)
        {
            foreach (var key in new[] { upload.Id, upload.FileName, upload.PreviewUrl }.Where(x => !string.IsNullOrWhiteSpace(x))) result.TryAdd(key!, upload.Id);
            if (upload.PreviewUrl is not null && Uri.TryCreate(upload.PreviewUrl, UriKind.Absolute, out var uri)) result.TryAdd(uri.LocalPath, upload.Id);
        }
        return result;
    }

    public static string MediaFileMatchKey(string value)
    {
        var fileName = Path.GetFileName(value).Normalize(NormalizationForm.FormKC);
        try { fileName = Uri.UnescapeDataString(fileName); } catch (UriFormatException) { }
        return new string(fileName.Where(char.IsLetterOrDigit).Select(char.ToLowerInvariant).ToArray());
    }

    private static string MimeFromUpload(CsvRow row, string extension) => row["file_type"].Trim().ToLowerInvariant() switch
    {
        "image" => extension.ToLowerInvariant() switch { ".png" => "image/png", ".jpg" or ".jpeg" => "image/jpeg", ".gif" => "image/gif", ".svg" => "image/svg+xml", ".webp" => "image/webp", _ => "application/octet-stream" },
        "video" => extension.Equals(".mp4", StringComparison.OrdinalIgnoreCase) ? "video/mp4" : "application/octet-stream",
        _ => extension.ToLowerInvariant() switch { ".pdf" => "application/pdf", ".docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".mp4" => "video/mp4", _ => "application/octet-stream" }
    };
    private static string First(CsvRow r, params string[] names)=>names.Select(n=>r[n].Trim()).FirstOrDefault(v=>v.Length>0)??"";
    private static string First(IReadOnlyDictionary<string,string> values, params string[] names)=>
        names.Select(name=>values.GetValueOrDefault(name)?.Trim()??"").FirstOrDefault(value=>value.Length>0)??"";
    private static IReadOnlyList<string> SplitIds(string value) => value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
    private static int? ParseInt(string value) => int.TryParse(value, out var parsed) ? parsed : null;
    private static void RequireColumns(ParsedCsv csv, IReadOnlyList<string> required, List<MigrationIssueData> issues,
        Func<string,string,string,string?,int?,string?,string?,string?,MigrationIssueData> issue){foreach(var c in required.Where(c=>!csv.Headers.Contains(c,StringComparer.OrdinalIgnoreCase))) issues.Add(issue("Error","EXPECTED_COLUMN_MISSING",$"{csv.FileName} is missing required column '{c}'.",csv.FileName,null,null,null,null));}
    private static void AddDuplicateIssues(IEnumerable<(string Id,int Row)> values,string code,string file,string type,List<MigrationIssueData> issues,
        Func<string,string,string,string?,int?,string?,string?,string?,MigrationIssueData> issue){foreach(var g in values.Where(x=>x.Id.Length>0).GroupBy(x=>x.Id,StringComparer.OrdinalIgnoreCase).Where(g=>g.Count()>1)) foreach(var x in g) issues.Add(issue("Error",code,$"Duplicate {type.ToLowerInvariant()} ID '{g.Key}'.",file,x.Row,type,g.Key,null));}
    private static bool ParseBoolean(string value,out bool valid){if(string.IsNullOrWhiteSpace(value)){valid=true;return false;} if(bool.TryParse(value,out var b)){valid=true;return b;} if(value.Trim() is "1" or "yes" or "YES" or "t" or "T"){valid=true;return true;} if(value.Trim() is "0" or "no" or "NO" or "f" or "F"){valid=true;return false;} valid=false;return false;}
    private static DateTime? ParseDate(string value,out bool valid){if(string.IsNullOrWhiteSpace(value)){valid=true;return null;}var normalized=value.Trim();if(normalized.EndsWith(" UTC",StringComparison.OrdinalIgnoreCase))normalized=normalized[..^4]+" +00:00";valid=DateTimeOffset.TryParse(normalized,System.Globalization.CultureInfo.InvariantCulture,System.Globalization.DateTimeStyles.AllowWhiteSpaces,out var d);return valid?d.UtcDateTime:null;}
    private static string? NullIfEmpty(string value)=>string.IsNullOrWhiteSpace(value)?null:value.Trim(); private static string Limit(string value)=>value.Length<=160?value:value[..157]+"...";
    private static HelpJuiceSource EmptySummary(PackageContents p,List<MigrationIssueData> issues,IReadOnlyList<string> missing){var s=new HelpJuiceValidationSummary(0,0,0,0,0,0,0,0,0,0,p.AvailableFiles,missing,p.UnsupportedFiles,issues.Count(i=>i.Severity=="Error"),issues.Count(i=>i.Severity=="Warning"));return new([],[],[],new Dictionary<string,string>(),p.MediaFiles,new Dictionary<string,string>(),new Dictionary<string,HelpJuiceHtmlConversion>(),issues,s,[]);}
}
