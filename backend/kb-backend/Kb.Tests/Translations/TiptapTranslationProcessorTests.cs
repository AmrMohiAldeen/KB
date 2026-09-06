using System.Text.Json;
using System.Text.Json.Nodes;
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

    [Fact]
    public async Task Preserves_inline_marks_links_nested_lists_tables_and_surrounding_whitespace()
    {
        const string json = """
            {"type":"doc","attrs":{"dir":"rtl","documentId":"doc-7"},"content":[
              {"type":"heading","attrs":{"level":2,"id":"account-settings"},"content":[{"type":"text","text":"Account Settings"}]},
              {"type":"paragraph","content":[
                {"type":"text","text":"Hello "},
                {"type":"text","text":"bold","marks":[{"type":"bold"}]},
                {"type":"text","text":" and "},
                {"type":"text","text":"italic","marks":[{"type":"italic"}]},
                {"type":"text","text":" link","marks":[{"type":"link","attrs":{"href":"/articles/reset-password","target":"_blank","rel":"noopener"}}]}
              ]},
              {"type":"bulletList","attrs":{"listStyleType":"disc"},"content":[{"type":"listItem","attrs":{"itemId":"li-1"},"content":[
                {"type":"paragraph","content":[{"type":"text","text":"Parent"}]},
                {"type":"orderedList","attrs":{"start":3},"content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Child"}]}]}]}
              ]}]},
              {"type":"table","attrs":{"caption":"Plan comparison","widthPct":80},"content":[
                {"type":"tableRow","attrs":{"rowHeight":44},"content":[
                  {"type":"tableHeader","attrs":{"colspan":2,"rowspan":1,"colwidth":[120,140]},"content":[{"type":"paragraph","content":[{"type":"text","text":"Feature"}]}]},
                  {"type":"tableCell","attrs":{"colspan":1,"rowspan":2,"backgroundColor":"#fff"},"content":[{"type":"paragraph","content":[{"type":"text","text":"Available"}]}]}
                ]}
              ]}
            ]}
            """;
        var provider = new FakeProvider(texts => texts.Select(text => $"T:{text.Trim()}").ToArray());

        var result = await new TiptapTranslationProcessor(provider).TranslateAsync(
            "Guide", json, "en", "ar", [], default);

        using var translated = JsonDocument.Parse(result.ContentJson);
        var root = translated.RootElement;
        var content = root.GetProperty("content");
        Assert.Equal("rtl", root.GetProperty("attrs").GetProperty("dir").GetString());
        Assert.Equal("doc-7", root.GetProperty("attrs").GetProperty("documentId").GetString());
        Assert.Equal("account-settings", content[0].GetProperty("attrs").GetProperty("id").GetString());
        var inline = content[1].GetProperty("content");
        Assert.Equal("T:Hello ", inline[0].GetProperty("text").GetString());
        Assert.Equal("Hello", provider.LastRequest!.Texts[2]);
        Assert.Equal("and", provider.LastRequest.Texts[4]);
        Assert.Equal("T:bold", inline[1].GetProperty("text").GetString());
        Assert.Equal("bold", inline[1].GetProperty("marks")[0].GetProperty("type").GetString());
        Assert.Equal(" T:and ", inline[2].GetProperty("text").GetString());
        Assert.Equal("T:italic", inline[3].GetProperty("text").GetString());
        Assert.Equal("italic", inline[3].GetProperty("marks")[0].GetProperty("type").GetString());
        Assert.Equal(" T:link", inline[4].GetProperty("text").GetString());
        Assert.Equal("/articles/reset-password",
            inline[4].GetProperty("marks")[0].GetProperty("attrs").GetProperty("href").GetString());
        Assert.Equal("li-1", content[2].GetProperty("content")[0].GetProperty("attrs").GetProperty("itemId").GetString());
        Assert.Equal(3, content[2].GetProperty("content")[0].GetProperty("content")[1]
            .GetProperty("attrs").GetProperty("start").GetInt32());
        var tableAttrs = content[3].GetProperty("attrs");
        Assert.Equal("T:Plan comparison", tableAttrs.GetProperty("caption").GetString());
        Assert.Equal(80, tableAttrs.GetProperty("widthPct").GetInt32());
        var headerAttrs = content[3].GetProperty("content")[0].GetProperty("content")[0].GetProperty("attrs");
        Assert.Equal(2, headerAttrs.GetProperty("colspan").GetInt32());
        Assert.Equal([120, 140], headerAttrs.GetProperty("colwidth").EnumerateArray().Select(x => x.GetInt32()).ToArray());
    }

    [Fact]
    public async Task Uses_positions_for_duplicate_segments_and_keeps_html_looking_output_as_text()
    {
        const string json = """
            {"type":"doc","content":[
              {"type":"paragraph","content":[{"type":"text","text":"Duplicate"}]},
              {"type":"paragraph","content":[{"type":"text","text":"Duplicate"}]},
              {"type":"image","attrs":{"src":"/media/login.png","mediaId":"media-1","alt":"Login screen","data-owner":"team-1"}}
            ]}
            """;
        var provider = new FakeProvider(texts => texts.Select((_, index) => $"<script>segment-{index}</script>").ToArray());

        var result = await new TiptapTranslationProcessor(provider).TranslateAsync(
            "Title", json, "en", "fr", [], default);

        var root = JsonNode.Parse(result.ContentJson)!.AsObject();
        var content = root["content"]!.AsArray();
        Assert.Equal("<script>segment-0</script>", result.Title);
        Assert.Equal("<script>segment-1</script>", content[0]!["content"]![0]!["text"]!.GetValue<string>());
        Assert.Equal("<script>segment-2</script>", content[1]!["content"]![0]!["text"]!.GetValue<string>());
        Assert.Equal("<script>segment-3</script>", content[2]!["attrs"]!["alt"]!.GetValue<string>());
        Assert.Equal("/media/login.png", content[2]!["attrs"]!["src"]!.GetValue<string>());
        Assert.Equal("media-1", content[2]!["attrs"]!["mediaId"]!.GetValue<string>());
        Assert.Equal("team-1", content[2]!["attrs"]!["data-owner"]!.GetValue<string>());
    }

    [Fact]
    public async Task Translates_realistic_imported_helpjuice_content_without_changing_custom_structure()
    {
        const string json = """
            {"type":"doc","content":[
              {"type":"codeBlock","attrs":{"language":"bash"},"content":[{"type":"text","text":"npm run build"}]},
              {"type":"pre","content":[{"type":"text","text":"PRE_VALUE=1"}]},
              {"type":"script","attrs":{"src":"/scripts/app.js"},"content":[{"type":"text","text":"alert('x')"}]},
              {"type":"style","content":[{"type":"text","text":".thing { color: red; }"}]},
              {"type":"paragraph","content":[{"type":"text","text":"INLINE_CODE","marks":[{"type":"code"}]}]},
              {"type":"callout","attrs":{"variant":"warning","id":"callout-1","title":"Important"},"content":[{"type":"paragraph","content":[{"type":"text","text":"Check this setting"}]}]},
              {"type":"tabs","attrs":{"defaultTab":"tab-2"},"content":[{"type":"tabItem","attrs":{"itemId":"tab-2","label":"Details","ariaLabel":"Details tab"},"content":[{"type":"paragraph","content":[{"type":"text","text":"Tab body"}]}]}]},
              {"type":"accordion","content":[{"type":"accordionItem","attrs":{"itemId":"acc-1","title":"Troubleshooting","open":true},"content":[{"type":"paragraph","content":[{"type":"text","text":"Accordion body"}]}]}]},
              {"type":"glossary","attrs":{"id":"term-1","term":"Workspace","definition":"Your private area"}},
              {"type":"figure","attrs":{"caption":"Login flow","layout":"wide"},"content":[{"type":"image","attrs":{"src":"/media/flow.png","alt":"Flow diagram","fileName":"flow.png","mimeType":"image/png"}}]}
            ]}
            """;
        var provider = new FakeProvider(texts => texts.Select(text => $"AR:{text}").ToArray());

        var result = await new TiptapTranslationProcessor(provider).TranslateAsync(
            "Technical guide", json, "en", "ar", [], default);

        using var translated = JsonDocument.Parse(result.ContentJson);
        var content = translated.RootElement.GetProperty("content");
        Assert.Equal("npm run build", Text(content[0]));
        Assert.Equal("PRE_VALUE=1", Text(content[1]));
        Assert.Equal("alert('x')", Text(content[2]));
        Assert.Equal(".thing { color: red; }", Text(content[3]));
        Assert.Equal("INLINE_CODE", Text(content[4]));
        Assert.Equal("warning", content[5].GetProperty("attrs").GetProperty("variant").GetString());
        Assert.Equal("AR:Important", content[5].GetProperty("attrs").GetProperty("title").GetString());
        Assert.Equal("AR:Check this setting", Text(content[5].GetProperty("content")[0]));
        Assert.Equal("tab-2", content[6].GetProperty("attrs").GetProperty("defaultTab").GetString());
        var tabAttrs = content[6].GetProperty("content")[0].GetProperty("attrs");
        Assert.Equal("tab-2", tabAttrs.GetProperty("itemId").GetString());
        Assert.Equal("AR:Details", tabAttrs.GetProperty("label").GetString());
        Assert.Equal("AR:Details tab", tabAttrs.GetProperty("ariaLabel").GetString());
        var accordionAttrs = content[7].GetProperty("content")[0].GetProperty("attrs");
        Assert.True(accordionAttrs.GetProperty("open").GetBoolean());
        Assert.Equal("AR:Troubleshooting", accordionAttrs.GetProperty("title").GetString());
        Assert.Equal("AR:Accordion body", Text(content[7].GetProperty("content")[0].GetProperty("content")[0]));
        Assert.Equal("AR:Workspace", content[8].GetProperty("attrs").GetProperty("term").GetString());
        Assert.Equal("AR:Your private area", content[8].GetProperty("attrs").GetProperty("definition").GetString());
        Assert.Equal("AR:Login flow", content[9].GetProperty("attrs").GetProperty("caption").GetString());
        var imageAttrs = content[9].GetProperty("content")[0].GetProperty("attrs");
        Assert.Equal("AR:Flow diagram", imageAttrs.GetProperty("alt").GetString());
        Assert.Equal("flow.png", imageAttrs.GetProperty("fileName").GetString());
        Assert.Equal("image/png", imageAttrs.GetProperty("mimeType").GetString());
        Assert.Equal("wide", content[9].GetProperty("attrs").GetProperty("layout").GetString());
    }

    [Fact]
    public async Task Masks_urls_routes_paths_filenames_mime_types_and_environment_variables_inside_text()
    {
        const string source =
            "Open https://example.test/a?x=1, then use /api/articles/7 with image/png from C:\\media\\login.png and $KB_TOKEN in appsettings.json.";
        var provider = new FakeProvider(texts =>
        {
            Assert.DoesNotContain(texts, text => text.Contains("https://", StringComparison.Ordinal));
            Assert.DoesNotContain(texts, text => text.Contains("/api/articles/7", StringComparison.Ordinal));
            Assert.DoesNotContain(texts, text => text.Contains("image/png", StringComparison.Ordinal));
            Assert.DoesNotContain(texts, text => text.Contains("C:\\media\\login.png", StringComparison.Ordinal));
            Assert.DoesNotContain(texts, text => text.Contains("$KB_TOKEN", StringComparison.Ordinal));
            Assert.DoesNotContain(texts, text => text.Contains("appsettings.json", StringComparison.Ordinal));
            return texts.Select(text => $"AR:{text}").ToArray();
        });
        var json = JsonSerializer.Serialize(new
        {
            type = "doc",
            content = new[] { new { type = "paragraph", content = new[] { new { type = "text", text = source } } } }
        });

        var result = await new TiptapTranslationProcessor(provider).TranslateAsync(
            "Guide", json, "en", "ar", [], default);

        using var translated = JsonDocument.Parse(result.ContentJson);
        var output = Text(translated.RootElement.GetProperty("content")[0]);
        Assert.Contains("https://example.test/a?x=1", output);
        Assert.Contains("/api/articles/7", output);
        Assert.Contains("image/png", output);
        Assert.Contains("C:\\media\\login.png", output);
        Assert.Contains("$KB_TOKEN", output);
        Assert.Contains("appsettings.json", output);
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
