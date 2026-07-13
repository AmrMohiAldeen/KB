using Kb.Infrastructure.Services;

namespace Kb.Tests.Foundations;

public sealed class SlugGeneratorTests
{
    private readonly SlugGenerator _generator = new();

    [Theory]
    [InlineData("Getting Started With KB", "getting-started-with-kb")]
    [InlineData("  Getting   Started  ", "getting-started")]
    [InlineData("hello---world___again", "hello-world-again")]
    [InlineData("Hello!!!...World", "hello-world")]
    [InlineData("  - Hello -  ", "hello")]
    [InlineData("", "")]
    [InlineData("   ", "")]
    public void Generate_normalizes_common_title_input(string input, string expected) =>
        Assert.Equal(expected, _generator.Generate(input));

    [Fact]
    public void Generate_normalizes_diacritics_and_preserves_supported_unicode_letters()
    {
        Assert.Equal("creme-brulee", _generator.Generate("Crème brûlée"));
        Assert.Equal("مرحبا-بالعالم", _generator.Generate("مرحبا بالعالم"));
    }
}
