using Kb.Application.Workflow;
using Kb.Domain.Constants;

namespace Kb.Tests.Foundations;

public sealed class ArticleWorkflowTests
{
    [Fact]
    public void Article_and_draft_status_definitions_keep_published_separate_and_exclude_resubmitted()
    {
        Assert.Contains(ArticleStatuses.Published, ArticleStatuses.All);
        Assert.DoesNotContain(ArticleStatuses.Published, ArticleDraftStatuses.All);
        Assert.DoesNotContain("Resubmitted", ArticleStatuses.All);
        Assert.DoesNotContain("Resubmitted", ArticleDraftStatuses.All);
    }

    [Theory]
    [InlineData(ArticleStatuses.Approved, ArticleStatuses.Approved, true)]
    [InlineData(ArticleStatuses.Published, ArticleStatuses.Approved, true)]
    [InlineData(ArticleStatuses.Approved, ArticleStatuses.Draft, false)]
    public void Publishing_requires_approved_article_and_draft_states(
        string articleStatus,
        string draftStatus,
        bool expected) =>
        Assert.Equal(expected, ArticleWorkflow.CanPublish(articleStatus, draftStatus));

    [Theory]
    [InlineData(ArticleStatuses.Draft, ArticleStatuses.SubmittedForReview)]
    [InlineData(ArticleStatuses.SubmittedForReview, ArticleStatuses.InReview)]
    [InlineData(ArticleStatuses.SubmittedForReview, ArticleStatuses.ChangesRequested)]
    [InlineData(ArticleStatuses.SubmittedForReview, ArticleStatuses.Approved)]
    [InlineData(ArticleStatuses.InReview, ArticleStatuses.ChangesRequested)]
    [InlineData(ArticleStatuses.InReview, ArticleStatuses.Approved)]
    [InlineData(ArticleStatuses.ChangesRequested, ArticleStatuses.SubmittedForReview)]
    [InlineData(ArticleStatuses.Approved, ArticleStatuses.Published)]
    public void Allows_defined_transitions(string from, string to) => Assert.True(ArticleWorkflow.CanTransition(from, to));

    [Theory]
    [InlineData(ArticleStatuses.Draft, ArticleStatuses.Published)]
    [InlineData(ArticleStatuses.SubmittedForReview, ArticleStatuses.Published)]
    [InlineData(ArticleStatuses.ChangesRequested, ArticleStatuses.InReview)]
    [InlineData(ArticleStatuses.Published, ArticleStatuses.Draft)]
    [InlineData("", ArticleStatuses.Draft)]
    [InlineData(ArticleStatuses.Draft, "")]
    public void Rejects_undefined_transitions(string from, string to) => Assert.False(ArticleWorkflow.CanTransition(from, to));
}
