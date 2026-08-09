using Kb.Application.Workflow;
using Kb.Domain.Constants;

namespace Kb.Tests.Foundations;

public sealed class ArticleWorkflowTests
{
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
