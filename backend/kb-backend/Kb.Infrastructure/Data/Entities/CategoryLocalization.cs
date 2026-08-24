namespace Kb.Infrastructure.Data.Entities;

public sealed class CategoryLocalization
{
    public Guid CategoryId { get; set; }
    public string LocaleCode { get; set; } = null!;
    public string Name { get; set; } = null!;
    public string? Description { get; set; }

    public Category Category { get; set; } = null!;
    public KbLanguage Language { get; set; } = null!;
}
