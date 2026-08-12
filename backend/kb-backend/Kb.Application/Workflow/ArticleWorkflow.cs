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
        (ArticleStatuses.ChangesRequested, ArticleStatuses.SubmittedForReview),
        (ArticleStatuses.Approved, ArticleStatuses.Published)
    };

    public static bool CanTransition(string fromStatus, string toStatus) =>
        !string.IsNullOrWhiteSpace(fromStatus) && !string.IsNullOrWhiteSpace(toStatus) &&
        Transitions.Contains((fromStatus, toStatus));

    public static bool CanPublish(string articleStatus, string draftStatus) =>
        articleStatus == ArticleStatuses.Approved && draftStatus == ArticleStatuses.Approved;

    public static bool HasConsistentDraftState(string articleStatus, string draftStatus) =>
        articleStatus == draftStatus && draftStatus is
            ArticleStatuses.Draft or
            ArticleStatuses.SubmittedForReview or
            ArticleStatuses.InReview or
            ArticleStatuses.ChangesRequested or
            ArticleStatuses.Approved ||
        articleStatus == ArticleStatuses.Published && draftStatus == ArticleStatuses.Approved;
}
