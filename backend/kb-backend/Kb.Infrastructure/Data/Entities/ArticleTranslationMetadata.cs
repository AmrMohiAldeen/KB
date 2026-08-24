using System;

namespace Kb.Infrastructure.Data.Entities;

public sealed class ArticleTranslationMetadata
{
    public Guid ArticleId { get; set; }
    public Guid? SourceArticleId { get; set; }
    public Guid? SourceVersionId { get; set; }
    public int? SourceVersionNumber { get; set; }
    public string TranslationMethod { get; set; } = null!;
    public string TranslationStatus { get; set; } = null!;
    public Guid? AssignedTranslatorUserId { get; set; }
    public DateTime? LastTranslatedAt { get; set; }
    public DateTime? VerifiedAt { get; set; }
    public Guid? VerifiedByUserId { get; set; }

    public Article Article { get; set; } = null!;
    public Article? SourceArticle { get; set; }
    public ArticleVersion? SourceVersion { get; set; }
    public User? AssignedTranslatorUser { get; set; }
    public User? VerifiedByUser { get; set; }
}
