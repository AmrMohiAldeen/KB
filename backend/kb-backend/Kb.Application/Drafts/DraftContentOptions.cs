namespace Kb.Application.Drafts;

public sealed class DraftContentOptions
{
    public const int DefaultMaxContentSizeBytes = 2 * 1024 * 1024;

    public string ContainerName { get; set; } = "article-content";
    public int MaxContentSizeBytes { get; set; } = DefaultMaxContentSizeBytes;
}
