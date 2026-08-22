using System;
using System.Collections.Generic;

namespace Kb.Infrastructure.Data.Entities;

public partial class Category
{
    public Guid CategoryId { get; set; }

    public Guid? ParentCategoryIdFk { get; set; }

    public string Name { get; set; } = null!;

    public string Slug { get; set; } = null!;

    public string? Description { get; set; }

    public int SortOrder { get; set; }

    public Guid? ViewerImageMediaIdFk { get; set; }

    public string? ViewerIcon { get; set; }

    public string? Path { get; set; }

    public int Depth { get; set; }

    public string Status { get; set; } = "Active";

    public string Visibility { get; set; } = "Public";

    public virtual ICollection<Article> Articles { get; set; } = new List<Article>();

    public virtual ICollection<ExportJob> ExportJobs { get; set; } = new List<ExportJob>();

    public virtual ICollection<Category> InverseParentCategoryIdFkNavigation { get; set; } = new List<Category>();

    public virtual Category? ParentCategoryIdFkNavigation { get; set; }

    public virtual MediaFile? ViewerImageMediaIdFkNavigation { get; set; }

    public virtual ViewerSolution? ViewerSolution { get; set; }
}
