using System.Text;

namespace Kb.Application.Migrations.HelpJuice;

public sealed record HelpJuiceQuestion(
    int RowNumber, string Id, string Slug, string Name, string? Description, bool IsPublished,
    DateTime? CreatedAt, DateTime? UpdatedAt, string? CategoryId, IReadOnlyDictionary<string, string> Source);
public sealed record HelpJuiceAnswer(int RowNumber, string Id, string QuestionId, string Body);
public sealed record HelpJuiceCategory(int RowNumber, string Id, string? ParentId, string Name, int Depth = 0);

public sealed record HelpJuiceSource(
    IReadOnlyList<HelpJuiceQuestion> Questions,
    IReadOnlyList<HelpJuiceAnswer> Answers,
    IReadOnlyList<HelpJuiceCategory> Categories,
    IReadOnlyDictionary<string, string> CategorizationByQuestionId,
    IReadOnlyList<string> MediaFiles,
    IReadOnlyDictionary<string, string> MediaBySource,
    IReadOnlyList<MigrationIssueData> Issues,
    HelpJuiceValidationSummary Summary);

public static class HelpJuiceSourceParser
{
    public static async Task<HelpJuiceSource> ParseAndValidateAsync(PackageContents package,
        HelpJuiceMigrationLimits limits, TimeProvider timeProvider,
        IReadOnlySet<string>? destinationArticleSlugs = null,
        CancellationToken cancellationToken = default)
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
        foreach (var legacy in new[] { "groups.csv", "passes.csv" }.Where(package.KnownCsvFiles.ContainsKey))
            issues.Add(Issue("Warning", "UNSUPPORTED_LEGACY_PERMISSIONS",
                $"{legacy} contains legacy HelpJuice permissions; category ACLs are not imported.", legacy));
        if (package.KnownCsvFiles.ContainsKey("users.csv"))
            issues.Add(Issue("Warning", "UNSUPPORTED_USERS", "users.csv is reported but users are not imported.", "users.csv"));

        if (missing.Length > 0)
            return EmptySummary(package, issues, missing);

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

        var questions = new List<HelpJuiceQuestion>();
        foreach (var row in questionsCsv.Rows)
        {
            var id = row["id"].Trim(); var name = row["name"].Trim();
            if (id.Length == 0) { issues.Add(Issue("Error", "INVALID_QUESTION_ID", "Question ID is required.", "questions.csv", row.RowNumber)); continue; }
            if (name.Length == 0) issues.Add(Issue("Error", "TITLE_REQUIRED", "Question name is required.", "questions.csv", row.RowNumber, "Question", id));
            var slug = NormalizeSlug(row["codename"].Length == 0 ? name : row["codename"]);
            if (slug.Length == 0) issues.Add(Issue("Error", "INVALID_SLUG", "Question slug cannot be normalized.", "questions.csv", row.RowNumber, "Question", id));
            var published = ParseBoolean(row["is_published"], out var validBool);
            if (!validBool && row["is_published"].Length > 0) issues.Add(Issue("Error", "INVALID_BOOLEAN", "is_published is not a supported boolean.", "questions.csv", row.RowNumber, "Question", id));
            var created = ParseDate(row["created_at"], out var validCreated); var updated = ParseDate(row["updated_at"], out var validUpdated);
            if (!validCreated) issues.Add(Issue("Error", "INVALID_DATE", "created_at is not a valid date.", "questions.csv", row.RowNumber, "Question", id));
            if (!validUpdated) issues.Add(Issue("Error", "INVALID_DATE", "updated_at is not a valid date.", "questions.csv", row.RowNumber, "Question", id));
            if (row.Values.ContainsKey("joined_tag_names") && row["joined_tag_names"].Length > 0)
                issues.Add(Issue("Warning", "TAGS_IGNORED", "HelpJuice tags are not imported.", "questions.csv", row.RowNumber, "Question", id));
            questions.Add(new(row.RowNumber, id, slug, name, NullIfEmpty(row["description"]), published,
                created, updated, NullIfEmpty(row["category_id"]), row.Values));
        }

        var answers = answersCsv.Rows.Select(row => new HelpJuiceAnswer(row.RowNumber,
            row["id"].Trim(), row["question_id"].Trim(), row["body"])).ToArray();
        AddDuplicateIssues(questions.Select(x => (x.Id, x.RowNumber)), "QUESTION_ID_DUPLICATE", "questions.csv", "Question", issues, Issue);
        AddDuplicateIssues(answers.Select(x => (x.Id, x.RowNumber)), "ANSWER_ID_DUPLICATE", "answers.csv", "Answer", issues, Issue);
        var duplicateSlugs = questions.Where(x => x.Slug.Length > 0).GroupBy(x => x.Slug, StringComparer.OrdinalIgnoreCase).Where(g => g.Count() > 1).ToArray();
        foreach (var group in duplicateSlugs)
            foreach (var question in group) issues.Add(Issue("Error", "QUESTION_SLUG_DUPLICATE", $"Duplicate source slug '{group.Key}'.", "questions.csv", question.RowNumber, "Question", question.Id));
        if (destinationArticleSlugs is not null)
            foreach (var question in questions.Where(q => destinationArticleSlugs.Contains(q.Slug)))
                issues.Add(Issue("Warning", "DESTINATION_SLUG_CONFLICT", $"Destination article slug '{question.Slug}' already exists.", "questions.csv", question.RowNumber, "Question", question.Id));

        var questionIds = questions.Select(x => x.Id).ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach (var answer in answers.Where(a => !questionIds.Contains(a.QuestionId)))
            issues.Add(Issue("Error", "ANSWER_QUESTION_MISSING", $"Answer references missing question '{answer.QuestionId}'.", "answers.csv", answer.RowNumber, "Answer", answer.Id));
        var answerQuestionDuplicates = answers.Where(a => questionIds.Contains(a.QuestionId)).GroupBy(a => a.QuestionId, StringComparer.OrdinalIgnoreCase).Where(g => g.Count() > 1);
        foreach (var group in answerQuestionDuplicates)
            issues.Add(Issue("Error", "MULTIPLE_ANSWERS", $"Question '{group.Key}' has multiple answers; the relationship is ambiguous.", "answers.csv", group.First().RowNumber, "Question", group.Key));

        var categories = await ParseCategoriesAsync(package, limits, issues, Issue, cancellationToken);
        var categorizations = await ParseCategorizationsAsync(package, limits, issues, Issue, cancellationToken);
        var categoryIds = categories.Select(x => x.Id).ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach (var category in categories.Where(x => x.ParentId is not null && !categoryIds.Contains(x.ParentId)))
            issues.Add(Issue("Error", "CATEGORY_PARENT_MISSING", $"Category parent '{category.ParentId}' does not exist.", "categories.csv", category.RowNumber, "Category", category.Id));
        var ordered = OrderCategories(categories, out var cycleIds);
        foreach (var id in cycleIds) issues.Add(Issue("Error", "CATEGORY_CYCLE", $"Category '{id}' participates in a hierarchy cycle.", "categories.csv", type: "Category", id: id));
        var depthById = ordered.ToDictionary(x => x.Id, x => x.Depth, StringComparer.OrdinalIgnoreCase);
        categories = categories.Select(c => c with { Depth = depthById.GetValueOrDefault(c.Id) }).ToList();
        foreach (var question in questions)
        {
            var categoryId = question.CategoryId ?? categorizations.GetValueOrDefault(question.Id);
            if (categoryId is not null && !categoryIds.Contains(categoryId))
                issues.Add(Issue("Error", "ARTICLE_CATEGORY_MISSING", $"Question references missing category '{categoryId}'.", "questions.csv", question.RowNumber, "Question", question.Id));
        }

        var mediaBySource = await ParseUploadsAsync(package, limits, cancellationToken);
        var mediaNames = package.MediaFiles.Select(Path.GetFileName).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var answersByQuestion = answers.GroupBy(x => x.QuestionId, StringComparer.OrdinalIgnoreCase).ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);
        var missingAnswers = questions.Count(q => !answersByQuestion.TryGetValue(q.Id, out var answer) || string.IsNullOrWhiteSpace(answer.Body));
        var missingMedia = 0;
        foreach (var answer in answers.Where(a => questionIds.Contains(a.QuestionId)))
        {
            var conversion = HelpJuiceHtmlConverter.Convert(answer.Body);
            if (Encoding.UTF8.GetByteCount(answer.Body) > limits.MaxArticleContentSizeBytes)
                issues.Add(Issue("Error", "HTML_TOO_LARGE", "Article HTML exceeds the configured content limit.", "answers.csv", answer.RowNumber, "Answer", answer.Id));
            foreach (var source in conversion.MediaSources)
            {
                var name = Path.GetFileName(Uri.TryCreate(source, UriKind.Absolute, out var uri) ? uri.LocalPath : source);
                if (name.Length > 0 && (mediaNames.Contains(name) || mediaBySource.ContainsKey(source))) continue;
                missingMedia++;
                issues.Add(Issue("Warning", "MEDIA_UNRESOLVED", $"Media '{Limit(source)}' is not present in the backup.", "answers.csv", answer.RowNumber, "Answer", answer.Id));
            }
            foreach (var warning in conversion.Warnings.Where(w => w.Code is not "UNRESOLVED_MEDIA"))
                issues.Add(Issue("Warning", warning.Code, warning.Message, "answers.csv", answer.RowNumber, "Answer", answer.Id));
        }

        var summary = new HelpJuiceValidationSummary(questions.Count, questions.Count(q => q.IsPublished), questions.Count(q => !q.IsPublished),
            categories.Count, categories.Count == 0 ? 0 : categories.Max(c => c.Depth) + 1, missingAnswers,
            issues.Count(i => i.ErrorCode.EndsWith("_DUPLICATE", StringComparison.Ordinal)), duplicateSlugs.Length,
            issues.Count(i => i.ErrorCode is "ARTICLE_CATEGORY_MISSING" or "CATEGORY_PARENT_MISSING"), missingMedia,
            package.AvailableFiles, missing, package.UnsupportedFiles, issues.Count(i => i.Severity == "Error"), issues.Count(i => i.Severity == "Warning"));
        return new(questions, answers, categories, categorizations, package.MediaFiles, mediaBySource, issues, summary);
    }

    public static IReadOnlyList<HelpJuiceCategory> OrderCategories(IReadOnlyList<HelpJuiceCategory> categories, out IReadOnlyList<string> cycleIds)
    {
        var byId = categories.GroupBy(c => c.Id, StringComparer.OrdinalIgnoreCase).ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);
        var state = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase); var result = new List<HelpJuiceCategory>(); var cycles = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        void Visit(HelpJuiceCategory c)
        {
            if (state.GetValueOrDefault(c.Id) == 2) return;
            if (state.GetValueOrDefault(c.Id) == 1) { cycles.Add(c.Id); return; }
            state[c.Id] = 1; var depth = 0;
            if (c.ParentId is not null && byId.TryGetValue(c.ParentId, out var parent)) { Visit(parent); if (cycles.Contains(parent.Id)) cycles.Add(c.Id); depth = parent.Depth + 1; }
            state[c.Id] = 2; result.Add(c with { Depth = depth });
        }
        foreach (var c in categories) Visit(c);
        cycleIds = cycles.ToArray(); return result;
    }

    public static string NormalizeSlug(string value)
    {
        var decoded = value.Trim().ToLowerInvariant().Normalize(); var b = new StringBuilder(); var dash = false;
        foreach (var ch in decoded)
        {
            if (char.IsLetterOrDigit(ch)) { b.Append(ch); dash = false; }
            else if (!dash && b.Length > 0) { b.Append('-'); dash = true; }
        }
        return b.ToString().Trim('-')[..Math.Min(b.ToString().Trim('-').Length, 350)];
    }

    private static async Task<List<HelpJuiceCategory>> ParseCategoriesAsync(PackageContents package, HelpJuiceMigrationLimits limits,
        List<MigrationIssueData> issues, Func<string,string,string,string?,int?,string?,string?,string?,MigrationIssueData> issue, CancellationToken ct)
    {
        if (!package.KnownCsvFiles.TryGetValue("categories.csv", out var path)) return [];
        var csv = await HelpJuiceCsvReader.ReadAsync(path, limits.MaxCsvRows, ct); RequireColumns(csv, ["id", "name"], issues, issue);
        var result = csv.Rows.Select(r => new HelpJuiceCategory(r.RowNumber, r["id"].Trim(), NullIfEmpty(r["parent_id"]), r["name"].Trim())).ToList();
        AddDuplicateIssues(result.Select(x => (x.Id, x.RowNumber)), "CATEGORY_ID_DUPLICATE", "categories.csv", "Category", issues, issue); return result;
    }
    private static async Task<Dictionary<string,string>> ParseCategorizationsAsync(PackageContents p, HelpJuiceMigrationLimits l,
        List<MigrationIssueData> issues, Func<string,string,string,string?,int?,string?,string?,string?,MigrationIssueData> issue, CancellationToken ct)
    {
        var result = new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase); if (!p.KnownCsvFiles.TryGetValue("categorizations.csv", out var path)) return result;
        var csv = await HelpJuiceCsvReader.ReadAsync(path,l.MaxCsvRows,ct);
        foreach(var r in csv.Rows){ var q=First(r,"question_id","categorizable_id"); var c=First(r,"category_id"); if(q.Length==0||c.Length==0) continue; if(!result.TryAdd(q,c)) issues.Add(issue("Warning","MULTIPLE_CATEGORIES","Only the first HelpJuice categorization is imported.","categorizations.csv",r.RowNumber,"Question",q,null)); }
        return result;
    }
    private static async Task<Dictionary<string,string>> ParseUploadsAsync(PackageContents p, HelpJuiceMigrationLimits l, CancellationToken ct)
    {
        var result=new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase); if(!p.KnownCsvFiles.TryGetValue("uploads.csv",out var path)) return result;
        var csv=await HelpJuiceCsvReader.ReadAsync(path,l.MaxCsvRows,ct); foreach(var r in csv.Rows){ var file=First(r,"file_name","filename","path","key"); if(file.Length==0) continue; foreach(var key in new[]{"url","path","key","file_name","filename"}) if(r.Values.TryGetValue(key,out var v)&&v.Length>0) result.TryAdd(v,file); } return result;
    }
    private static string First(CsvRow r, params string[] names)=>names.Select(n=>r[n].Trim()).FirstOrDefault(v=>v.Length>0)??"";
    private static void RequireColumns(ParsedCsv csv, IReadOnlyList<string> required, List<MigrationIssueData> issues,
        Func<string,string,string,string?,int?,string?,string?,string?,MigrationIssueData> issue){foreach(var c in required.Where(c=>!csv.Headers.Contains(c,StringComparer.OrdinalIgnoreCase))) issues.Add(issue("Error","EXPECTED_COLUMN_MISSING",$"{csv.FileName} is missing required column '{c}'.",csv.FileName,null,null,null,null));}
    private static void AddDuplicateIssues(IEnumerable<(string Id,int Row)> values,string code,string file,string type,List<MigrationIssueData> issues,
        Func<string,string,string,string?,int?,string?,string?,string?,MigrationIssueData> issue){foreach(var g in values.Where(x=>x.Id.Length>0).GroupBy(x=>x.Id,StringComparer.OrdinalIgnoreCase).Where(g=>g.Count()>1)) foreach(var x in g) issues.Add(issue("Error",code,$"Duplicate {type.ToLowerInvariant()} ID '{g.Key}'.",file,x.Row,type,g.Key,null));}
    private static bool ParseBoolean(string value,out bool valid){if(string.IsNullOrWhiteSpace(value)){valid=true;return false;} if(bool.TryParse(value,out var b)){valid=true;return b;} if(value.Trim() is "1" or "yes" or "YES"){valid=true;return true;} if(value.Trim() is "0" or "no" or "NO"){valid=true;return false;} valid=false;return false;}
    private static DateTime? ParseDate(string value,out bool valid){if(string.IsNullOrWhiteSpace(value)){valid=true;return null;} valid=DateTimeOffset.TryParse(value,out var d);return valid?d.UtcDateTime:null;}
    private static string? NullIfEmpty(string value)=>string.IsNullOrWhiteSpace(value)?null:value.Trim(); private static string Limit(string value)=>value.Length<=160?value:value[..157]+"...";
    private static HelpJuiceSource EmptySummary(PackageContents p,List<MigrationIssueData> issues,IReadOnlyList<string> missing){var s=new HelpJuiceValidationSummary(0,0,0,0,0,0,0,0,0,0,p.AvailableFiles,missing,p.UnsupportedFiles,issues.Count(i=>i.Severity=="Error"),issues.Count(i=>i.Severity=="Warning"));return new([],[],[],new Dictionary<string,string>(),p.MediaFiles,new Dictionary<string,string>(),issues,s);}
}
