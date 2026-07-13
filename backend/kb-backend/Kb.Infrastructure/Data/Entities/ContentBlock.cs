using System;
using System.Collections.Generic;

namespace Kb.Infrastructure.Data.Entities;

public partial class ContentBlock
{
    public Guid ContentBlockId { get; set; }

    public string Type { get; set; } = null!;

    public string Name { get; set; } = null!;

    public string? Description { get; set; }

    public string ContentJsonStoragePath { get; set; } = null!;

    public string? RenderedHtmlStoragePath { get; set; }

    public string? PlainTextStoragePath { get; set; }

    public Guid CreatedByFk { get; set; }

    public Guid? UpdatedByFk { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    public virtual User CreatedByFkNavigation { get; set; } = null!;

    public virtual User? UpdatedByFkNavigation { get; set; }
}
