using System.Text.Json;
using Kb.Application.Exceptions;
using Kb.Application.Translations;

namespace Kb.Tests.Translations;

public sealed class TiptapTranslationProcessorTests
{
    [Fact]
    public async Task Translates_user_facing_text_in_one_batch_and_preserves_structure_and_terms()
    {
        const string json = """
            {
              "type":"doc",
              "content":[
                {"type":"heading","attrs":{"level":2,"id":"heading-1"},"content":[{"type":"text","text":"Use GamaLearn API"}]},
                {"type":"paragraph","content":[{"type":"text","text":"Open OAuth docs","marks":[{"type":"link","attrs":{"href":"https://example.test/oauth"}}]}]},
                {"type":"codeBlock","attrs":{"language":"csharp"},"content":[{"type":"text","text":"var API = \"GamaLearn\";"}]},
                {"type":"paragraph","content":[{"type":"text","text":"inline API","marks":[{"type":"code"}]}]},
                {"type":"tabs","content":[{"type":"tabItem","attrs":{"itemId":"tab-1","label":"API overview"},"content":[{"type":"paragraph","content":[{"type":"text","text":"Tab content"}]}]}]},
                {"type":"accordion","content":[{"type":"accordionItem","attrs":{"itemId":"acc-1","title":"OAuth setup","open":true},"content":[{"type":"paragraph","content":[{"type":"text","text":"Accordion content"}]}]}]},
                {"type":"table","content":[{"type":"tableRow","content":[{"type":"tableCell","content":[{"type":"paragraph","content":[{"type":"text","text":"Table text"}]}]}]}]},
                {"type":"image","attrs":{"mediaId":"11111111-1111-1111-1111-111111111111","src":"https://storage.test/image.png","alt":"GamaLearn dashboard","title":"API screenshot","storagePath":"media/private/path"}}
              ]
            }
            """;
        var provider = new FakeProvider(texts => texts.Select(text => $"FR:{text}").ToArray());
        var processor = new TiptapTranslationProcessor(provider);

        var result = await processor.TranslateAsync("GamaLearn API guide", json, "en", "fr",
            ["GamaLearn", "OAuth", "API"], CancellationToken.None);

        Assert.Equal(1, provider.CallCount);
        Assert.Equal("en", provider.LastRequest!.SourceLocaleCode);
        Assert.Equal("fr", provider.LastRequest.TargetLocaleCode);
        Assert.Equal("FR:GamaLearn API guide", result.Title);
        Assert.Equal(10, result.TranslatedSegmentCount);
        using var translated = JsonDocument.Parse(result.ContentJson);
        var content = translated.RootElement.GetProperty("content");
        Assert.Equal("FR:Use GamaLearn API", Text(content[0]));
        Assert.Equal("https://example.test/oauth",
            content[1].GetProperty("content")[0].GetProperty("marks")[0].GetProperty("attrs").GetProperty("href").GetString());
        Assert.Equal("FR:Open OAuth docs", Text(content[1]));
        Assert.Equal("var API = \"GamaLearn\";", Text(content[2]));
        Assert.Equal("inline API", Text(content[3]));
        Assert.Equal("FR:API overview", content[4].GetProperty("content")[0].GetProperty("attrs").GetProperty("label").GetString());
        Assert.Equal("FR:OAuth setup", content[5].GetProperty("content")[0].GetProperty("attrs").GetProperty("title").GetString());
        Assert.Equal("FR:Table text", Text(content[6].GetProperty("content")[0].GetProperty("content")[0].GetProperty("content")[0]));
        var image = content[7];
        Assert.Equal("FR:GamaLearn dashboard", image.GetProperty("attrs").GetProperty("alt").GetString());
        Assert.Equal("FR:API screenshot", image.GetProperty("attrs").GetProperty("title").GetString());
        Assert.Equal("11111111-1111-1111-1111-111111111111", image.GetProperty("attrs").GetProperty("mediaId").GetString());
        Assert.Equal("https://storage.test/image.png", image.GetProperty("attrs").GetProperty("src").GetString());
        Assert.Equal("media/private/path", image.GetProperty("attrs").GetProperty("storagePath").GetString());
    }

    [Fact]
    public async Task Rejects_incomplete_provider_batch()
    {
        var provider = new FakeProvider(_ => Array.Empty<string>());
        var processor = new TiptapTranslationProcessor(provider);

        await Assert.ThrowsAsync<ExternalServiceException>(() => processor.TranslateAsync("Title",
            "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"Body\"}]}]}",
            "en", "fr", [], CancellationToken.None));
    }

    [Fact]
    public async Task Rejects_provider_output_that_drops_a_protected_term_marker()
    {
        var provider = new FakeProvider(texts => texts.Select(text => text.Replace("\uE100", string.Empty)).ToArray());
        var processor = new TiptapTranslationProcessor(provider);

        var exception = await Assert.ThrowsAsync<ExternalServiceException>(() => processor.TranslateAsync(
            "GamaLearn", "{\"type\":\"doc\",\"content\":[]}", "en", "fr", ["GamaLearn"],
            CancellationToken.None));
        Assert.Contains("protected-term", exception.Message);
    }

    private static string? Text(JsonElement node) => node.GetProperty("content")[0].GetProperty("text").GetString();

    private sealed class FakeProvider(Func<IReadOnlyList<string>, IReadOnlyList<string>> translate)
        : ITranslationProvider
    {
        public string Name => "Fake";
        public int CallCount { get; private set; }
        public TranslationProviderRequest? LastRequest { get; private set; }
        public Task<IReadOnlyList<string>> TranslateAsync(TranslationProviderRequest request,
            CancellationToken cancellationToken)
        {
            CallCount++;
            LastRequest = request;
            return Task.FromResult(translate(request.Texts));
        }
    }
}
