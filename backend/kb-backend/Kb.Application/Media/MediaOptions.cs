namespace Kb.Application.Media;

public sealed class MediaOptions
{
    public const long DefaultMaxFileSizeBytes = 100L * 1024 * 1024;

    public string ContainerName { get; set; } = "media";
    public long MaxFileSizeBytes { get; set; } = DefaultMaxFileSizeBytes;
}
