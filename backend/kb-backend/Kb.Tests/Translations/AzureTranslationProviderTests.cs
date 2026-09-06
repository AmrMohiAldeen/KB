using System.Net;
using System.Text;
using System.Text.Json;
using Kb.Application.Exceptions;
using Kb.Application.Translations;
using Kb.Infrastructure.Translations;
using Microsoft.Extensions.Options;

namespace Kb.Tests.Translations;

public sealed class AzureTranslationProviderTests
{
    [Fact]
    public async Task Splits_large_articles_into_ordered_plain_text_batches()
    {
        var handler = new TranslationHandler();
        var provider = Provider(handler, maxItems: 2, maxCharacters: 10_000);
        var source = Enumerable.Range(0, 5).Select(index => $"segment-{index}").ToArray();

        var translated = await provider.TranslateAsync(new("en", "ar", source), default);

        Assert.Equal(3, handler.Requests.Count);
        Assert.Equal(["segment-0", "segment-1"], handler.Requests[0]);
        Assert.Equal(["segment-2", "segment-3"], handler.Requests[1]);
        Assert.Equal(["segment-4"], handler.Requests[2]);
        Assert.Equal([
            "batch-0:segment-0", "batch-0:segment-1",
            "batch-1:segment-2", "batch-1:segment-3",
            "batch-2:segment-4"
        ], translated);
    }

    [Fact]
    public async Task Stops_and_returns_a_clear_error_when_any_batch_fails()
    {
        var handler = new TranslationHandler { FailRequest = 1 };
        var provider = Provider(handler, maxItems: 2, maxCharacters: 10_000);

        var exception = await Assert.ThrowsAsync<ExternalServiceException>(() => provider.TranslateAsync(
            new("en", "fr", ["one", "two", "three", "four", "five"]), default));

        Assert.Equal("Azure AI Translator returned HTTP 503.", exception.Message);
        Assert.Equal(2, handler.Requests.Count);
    }

    private static AzureTranslationProvider Provider(HttpMessageHandler handler, int maxItems, int maxCharacters) =>
        new(new HttpClient(handler), Options.Create(new AzureTranslationOptions
        {
            Endpoint = "https://translator.test",
            ApiKey = "test-key",
            MaxBatchItems = maxItems,
            MaxBatchCharacters = maxCharacters
        }));

    private sealed class TranslationHandler : HttpMessageHandler
    {
        public List<IReadOnlyList<string>> Requests { get; } = [];
        public int? FailRequest { get; init; }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            var requestIndex = Requests.Count;
            var body = await request.Content!.ReadAsStringAsync(cancellationToken);
            using var json = JsonDocument.Parse(body);
            Assert.All(json.RootElement.EnumerateArray(), item =>
                Assert.Equal(["text"], item.EnumerateObject().Select(property => property.Name).ToArray()));
            var texts = json.RootElement.EnumerateArray()
                .Select(item => item.GetProperty("text").GetString()!).ToArray();
            Requests.Add(texts);
            if (FailRequest == requestIndex)
                return new(HttpStatusCode.ServiceUnavailable);

            var response = texts.Select(text => new
            {
                translations = new[] { new { text = $"batch-{requestIndex}:{text}", to = "ar" } }
            });
            return new(HttpStatusCode.OK)
            {
                Content = new StringContent(JsonSerializer.Serialize(response), Encoding.UTF8, "application/json")
            };
        }
    }
}
