namespace Kb.Infrastructure.Data.Entities;

/// <summary>
/// Associates an article with every category in which it is published. ARTICLES.CategoryID_FK is
/// retained as the primary/legacy category for compatibility with older clients and ordering code.
/// </summary>
public sealed class ArticleCategory
{
    public Guid ArticleIdFk { get; set; }
    public Guid CategoryIdFk { get; set; }
    public bool IsPrimary { get; set; }
    public int SortOrder { get; set; }
    public Article Article { get; set; } = null!;
    public Category Category { get; set; } = null!;
}
