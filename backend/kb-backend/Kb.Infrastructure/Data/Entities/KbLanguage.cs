using System;
using System.Collections.Generic;

namespace Kb.Infrastructure.Data.Entities;

public sealed class KbLanguage
{
    public Guid LanguageId { get; set; }
    public string LocaleCode { get; set; } = null!;
    public string DisplayName { get; set; } = null!;
    public string NativeName { get; set; } = null!;
    public bool IsDefault { get; set; }
    public bool IsEnabled { get; set; }
    public bool IsRtl { get; set; }
    public int SortOrder { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public ICollection<CategoryLocalization> CategoryLocalizations { get; set; } = new List<CategoryLocalization>();
}
