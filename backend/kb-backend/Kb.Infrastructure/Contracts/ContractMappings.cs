using System.Linq.Expressions;
using Kb.Contracts.Articles;
using Kb.Contracts.Common;
using Kb.Contracts.ContentBlocks.ReusableBlocks;
using Kb.Contracts.ContentBlocks.Templates;
using Kb.Infrastructure.Data.Entities;

namespace Kb.Infrastructure.Contracts;

public static class ContractProjections
{
    public static readonly Expression<Func<Article, ArticleSummaryResponse>> ArticleSummary = article =>
        new ArticleSummaryResponse(
            article.ArticleId,
            article.Title,
            article.Slug,
            article.CategoryIdFkNavigation == null
                ? null
                : new CategorySummaryResponse(
                    article.CategoryIdFkNavigation.CategoryId,
                    article.CategoryIdFkNavigation.Name,
                    article.CategoryIdFkNavigation.Slug,
                    article.CategoryIdFkNavigation.Path),
            new UserSummaryResponse(article.AuthorIdFkNavigation.UserId, article.AuthorIdFkNavigation.FullName),
            article.Status,
            article.CreatedAt,
            article.UpdatedAt);
}

public static class ContentBlockQueries
{
    public static IQueryable<ContentBlock> TemplateById(this IQueryable<ContentBlock> source, Guid templateId) =>
        source.Where(block =>
            block.ContentBlockId == templateId &&
            block.Type == ContentBlockTypes.Template);
}

public static class ContentBlockMappings
{
    public static void ApplyTemplateMetadata(ContentBlock target, TemplateWriteRequest request)
    {
        target.Type = ContentBlockTypes.Template;
        target.Name = request.Name;
        target.Description = request.Description;
    }

    public static void ApplyReusableBlockMetadata(ContentBlock target, ReusableBlockWriteRequest request)
    {
        target.Type = ContentBlockTypes.ReusableBlock;
        target.Name = request.Name;
        target.Description = request.Description;
    }
}
