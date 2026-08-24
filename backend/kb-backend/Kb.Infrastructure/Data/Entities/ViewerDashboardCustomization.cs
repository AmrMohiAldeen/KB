namespace Kb.Infrastructure.Data.Entities;

/// <summary>Dashboard appearance and direct-card overrides for one Viewer root category.</summary>
public sealed class ViewerDashboardCustomization
{
    public Guid RootCategoryId { get; set; }
    public string PrimaryColor { get; set; } = "#1976D2";
    public string PageBackgroundColor { get; set; } = "#F8FAFC";
    public string CategoryCardBackgroundColor { get; set; } = "#FFFFFF";
    public string TextColor { get; set; } = "#1E293B";
    public DateTime UpdatedAt { get; set; }
    public Category RootCategory { get; set; } = null!;
    public ICollection<ViewerDashboardCategoryCustomization> Categories { get; set; } = new List<ViewerDashboardCategoryCustomization>();
}

public sealed class ViewerDashboardCategoryCustomization
{
    public Guid RootCategoryId { get; set; }
    public Guid CategoryId { get; set; }
    public int SortOrder { get; set; }
    public Guid? ViewerImageMediaId { get; set; }
    public string? ViewerIcon { get; set; }
    public string DisplayColor { get; set; } = "#1976D2";
    public ViewerDashboardCustomization Dashboard { get; set; } = null!;
    public Category Category { get; set; } = null!;
    public MediaFile? ViewerImageMedia { get; set; }
}
