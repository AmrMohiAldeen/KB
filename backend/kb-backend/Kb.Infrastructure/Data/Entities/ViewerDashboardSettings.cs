namespace Kb.Infrastructure.Data.Entities;

/// <summary>Singleton, persisted appearance used by the external Viewer dashboard.</summary>
public sealed class ViewerDashboardSettings
{
    public int SettingsId { get; set; }
    public string PrimaryColor { get; set; } = "#1976D2";
    public string PageBackgroundColor { get; set; } = "#F8FAFC";
    public string CategoryCardBackgroundColor { get; set; } = "#FFFFFF";
    public string TextColor { get; set; } = "#1E293B";
    public DateTime UpdatedAt { get; set; }
}
