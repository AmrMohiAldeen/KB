using Kb.Domain.Constants;

namespace Kb.Application.Workflow;

public static class ArticleWorkflow
{
    private static readonly IReadOnlySet<(string From, string To)> Transitions = new HashSet<(string, string)>
    {
        (ArticleStatuses.Draft, ArticleStatuses.SubmittedForReview),
        (ArticleStatuses.SubmittedForReview, ArticleStatuses.InReview),
        (ArticleStatuses.SubmittedForReview, ArticleStatuses.ChangesRequested),
        (ArticleStatuses.SubmittedForReview, ArticleStatuses.Approved),
        (ArticleStatuses.InReview, ArticleStatuses.ChangesRequested),
        (ArticleStatuses.InReview, ArticleStatuses.Approved),
        (ArticleStatuses.ChangesRequested, ArticleStatuses.Resubmitted),
        (ArticleStatuses.Resubmitted, ArticleStatuses.InReview),
        (ArticleStatuses.Resubmitted, ArticleStatuses.ChangesRequested),
        (ArticleStatuses.Resubmitted, ArticleStatuses.Approved),
        (ArticleStatuses.Approved, ArticleStatuses.Published)
    };

    public static bool CanTransition(string fromStatus, string toStatus) =>
        !string.IsNullOrWhiteSpace(fromStatus) && !string.IsNullOrWhiteSpace(toStatus) &&
        Transitions.Contains((fromStatus, toStatus));
}
