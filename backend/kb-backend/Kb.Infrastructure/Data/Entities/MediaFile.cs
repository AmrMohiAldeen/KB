using System;
using System.Collections.Generic;

namespace Kb.Infrastructure.Data.Entities;

public partial class MediaFile
{
    public Guid MediaId { get; set; }

    public string OriginalFileName { get; set; } = null!;

    public string StoredFileName { get; set; } = null!;

    public string MimeType { get; set; } = null!;

    public string? FileExtension { get; set; }

    public long FileSizeBytes { get; set; }

    public string StoragePath { get; set; } = null!;

    public string? AccessUrl { get; set; }

    public string Status { get; set; } = null!;

    public Guid UploadedByFk { get; set; }

    public DateTime UploadedAt { get; set; }

    public virtual ICollection<MediaReference> MediaReferences { get; set; } = new List<MediaReference>();

    public virtual User UploadedByFkNavigation { get; set; } = null!;
}
