namespace Kb.Application.Migrations.HelpJuice;

public static class HelpJuicePreviewBuilder
{
    public static HelpJuiceMigrationPreview Build(HelpJuiceSource source, int limit)
    {
        ArgumentOutOfRangeException.ThrowIfLessThan(limit, 1);

        var categories = source.Categories.GroupBy(category => category.Id, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.First(), StringComparer.OrdinalIgnoreCase);
        var answersByQuestion = source.Answers.GroupBy(answer => answer.QuestionId, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.ToArray(), StringComparer.OrdinalIgnoreCase);
        var articles = source.Questions.Take(limit).Select(question =>
        {
            var answers = answersByQuestion.GetValueOrDefault(question.Id) ?? [];
            var answer = answers.FirstOrDefault();
            var categoryId = question.CategoryId ?? source.CategorizationByQuestionId.GetValueOrDefault(question.Id);
            var categoryIds = CategoryAncestry(categoryId, categories);
            var answerIds = answers.Select(item => item.Id).Where(id => id.Length > 0)
                .ToHashSet(StringComparer.OrdinalIgnoreCase);
            var issues = source.Issues.Where(issue => IsArticleIssue(
                    issue, question, answers, answerIds, categoryIds))
                .DistinctBy(issue => issue.Id).ToArray();
            var conversion = answer is not null && source.ConvertedAnswersById.TryGetValue(answer.Id, out var parsed)
                ? parsed
                : HelpJuiceHtmlConverter.Convert(answer?.Body);

            return new HelpJuiceMigrationPreviewArticle(question.Id, question.RowNumber, answer?.Id,
                answer?.RowNumber, question.Name, question.Slug, question.Description, question.IsPublished, question.IsArchived,
                question.CreatedAt, question.UpdatedAt, categoryId, CategoryLocation(categoryIds, categories),
                question.Visibility, question.HelpJuiceAuthorId, question.AuthorUserId, question.AuthorName,
                conversion.RenderedHtml, conversion.PlainText.Length,
                SourceMetadata(question, answer), issues);
        }).ToArray();

        var packageIssues = source.Issues.Where(issue => issue.RowNumber is null &&
            string.IsNullOrWhiteSpace(issue.ExternalId)).ToArray();
        return new(limit, source.Questions.Count, source.Categories.Count, source.Questions.Count > limit,
            source.Summary.AvailableFiles, source.Summary.MissingRequiredFiles, source.Summary.UnsupportedFiles,
            packageIssues, articles);
    }

    private static bool IsArticleIssue(MigrationIssueData issue, HelpJuiceQuestion question,
        IReadOnlyList<HelpJuiceAnswer> answers, IReadOnlySet<string> answerIds, IReadOnlySet<string> categoryIds)
    {
        if (issue.ExternalEntityType?.Equals("Question", StringComparison.OrdinalIgnoreCase) == true &&
            issue.ExternalId?.Equals(question.Id, StringComparison.OrdinalIgnoreCase) == true) return true;
        if (issue.ExternalEntityType?.Equals("Answer", StringComparison.OrdinalIgnoreCase) == true &&
            issue.ExternalId is not null && answerIds.Contains(issue.ExternalId)) return true;
        if (issue.ExternalEntityType?.Equals("Category", StringComparison.OrdinalIgnoreCase) == true &&
            issue.ExternalId is not null && categoryIds.Contains(issue.ExternalId)) return true;
        if (issue.FileName?.Equals("questions.csv", StringComparison.OrdinalIgnoreCase) == true &&
            issue.RowNumber == question.RowNumber) return true;
        return issue.FileName?.Equals("answers.csv", StringComparison.OrdinalIgnoreCase) == true &&
            answers.Any(answer => issue.RowNumber == answer.RowNumber);
    }

    private static HashSet<string> CategoryAncestry(string? categoryId,
        IReadOnlyDictionary<string, HelpJuiceCategory> categories)
    {
        var result = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var current = categoryId;
        while (current is not null && result.Add(current) && categories.TryGetValue(current, out var category))
            current = category.ParentId;
        return result;
    }

    private static string? CategoryLocation(IReadOnlySet<string> categoryIds,
        IReadOnlyDictionary<string, HelpJuiceCategory> categories)
    {
        var names = categoryIds.Where(categories.ContainsKey).Select(id => categories[id])
            .OrderBy(category => category.Depth).Select(category => category.Name).Where(name => name.Length > 0);
        var location = string.Join(" / ", names);
        return location.Length == 0 ? null : location;
    }

    private static IReadOnlyDictionary<string, string> SourceMetadata(HelpJuiceQuestion question,
        HelpJuiceAnswer? answer)
    {
        var metadata = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var pair in question.Source.Where(pair => pair.Value.Length > 0))
            metadata.TryAdd($"question.{pair.Key}", pair.Value);
        if (answer is not null)
            foreach (var pair in answer.Source.Where(pair => pair.Value.Length > 0 &&
                pair.Key is not "body" and not "body_txt"))
                metadata.TryAdd($"answer.{pair.Key}", pair.Value);
        return metadata;
    }
}
