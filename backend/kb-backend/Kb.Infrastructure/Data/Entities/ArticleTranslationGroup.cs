using System;
using System.Collections.Generic;

namespace Kb.Infrastructure.Data.Entities;

public sealed class ArticleTranslationGroup
{
    public Guid TranslationGroupId { get; set; }
    public DateTime CreatedAt { get; set; }

    public ICollection<Article> Articles { get; set; } = new List<Article>();
}
