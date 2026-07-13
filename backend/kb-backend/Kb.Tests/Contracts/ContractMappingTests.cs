using System.Text.Json;
using Kb.Contracts.Common;
using Kb.Contracts.ContentBlocks.ReusableBlocks;
using Kb.Contracts.ContentBlocks.Templates;
using Kb.Infrastructure.Contracts;
using Kb.Infrastructure.Data.Entities;

namespace Kb.Tests.Contracts;

public sealed class ContractMappingTests
{
    [Fact]
    public void Template_lookup_matches_only_template_content_blocks()
    {
        var id = Guid.NewGuid();
        var blocks = new[]
        {
            Block(id, ContentBlockTypes.ReusableBlock),
            Block(Guid.NewGuid(), ContentBlockTypes.Template)
        }.AsQueryable();

        Assert.Empty(blocks.TemplateById(id));

        blocks = new[] { Block(id, ContentBlockTypes.Template) }.AsQueryable();
        Assert.Equal(id, blocks.TemplateById(id).Single().ContentBlockId);
    }

    [Fact]
    public void Template_and_reusable_block_mappings_set_distinct_seeded_types()
    {
        var template = Block(Guid.NewGuid(), "wrong");
        var reusableBlock = Block(Guid.NewGuid(), "wrong");
        var content = TiptapDocument();

        ContentBlockMappings.ApplyTemplateMetadata(template, new CreateTemplateRequest { Name = "Starter", Content = content });
        ContentBlockMappings.ApplyReusableBlockMetadata(reusableBlock, new CreateReusableBlockRequest { Name = "Warning", Content = content });

        Assert.Equal(ContentBlockTypes.Template, template.Type);
        Assert.Equal(ContentBlockTypes.ReusableBlock, reusableBlock.Type);
    }

    private static ContentBlock Block(Guid id, string type) => new()
    {
        ContentBlockId = id,
        Type = type,
        Name = "Block",
        ContentJsonStoragePath = "internal/path"
    };

    private static JsonElement TiptapDocument()
    {
        using var document = JsonDocument.Parse("""{"type":"doc","content":[]}""");
        return document.RootElement.Clone();
    }
}
