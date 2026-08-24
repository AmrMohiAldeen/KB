using System.Net.Http.Json;
using System.Text.Json;
using Kb.Application.Exceptions;
using Kb.Application.Translations;
using Microsoft.Extensions.Options;

namespace Kb.Infrastructure.Translations;

public sealed class AzureTranslationProvider(HttpClient httpClient, IOptions<AzureTranslationOptions> options)
    : ITranslationProvider
{
    private readonly AzureTranslationOptions settings = options.Value;
    public string Name => "AzureAITranslator";

    public async Task<IReadOnlyList<string>> TranslateAsync(TranslationProviderRequest request,
        CancellationToken cancellationToken)
    {
        if (request.Texts.Count == 0) return Array.Empty<string>();
        if (string.IsNullOrWhiteSpace(settings.ApiKey))
            throw new ExternalServiceException(
                "Azure AI Translator is not configured. Set Translation__Azure__ApiKey in the environment.");
        if (!Uri.TryCreate(settings.Endpoint, UriKind.Absolute, out var endpoint) || endpoint.Scheme != Uri.UriSchemeHttps)
            throw new ExternalServiceException("Azure AI Translator endpoint must be an absolute HTTPS URL.");
        if (settings.MaxBatchItems <= 0 || settings.MaxBatchCharacters <= 0)
            throw new ExternalServiceException("Azure AI Translator batch limits are invalid.");

        var translated = new List<string>(request.Texts.Count);
        foreach (var batch in Batches(request.Texts, settings.MaxBatchItems, settings.MaxBatchCharacters))
        {
            var uri = new Uri(endpoint,
                $"/translate?api-version=3.0&from={Uri.EscapeDataString(request.SourceLocaleCode)}&to={Uri.EscapeDataString(request.TargetLocaleCode)}");
            using var message = new HttpRequestMessage(HttpMethod.Post, uri)
            {
                Content = JsonContent.Create(batch.Select(text => new TranslationBody(text)).ToArray())
            };
            message.Headers.TryAddWithoutValidation("Ocp-Apim-Subscription-Key", settings.ApiKey);
            if (!string.IsNullOrWhiteSpace(settings.Region))
                message.Headers.TryAddWithoutValidation("Ocp-Apim-Subscription-Region", settings.Region);
            message.Headers.TryAddWithoutValidation("X-ClientTraceId", Guid.NewGuid().ToString());

            HttpResponseMessage response;
            try { response = await httpClient.SendAsync(message, HttpCompletionOption.ResponseHeadersRead, cancellationToken); }
            catch (OperationCanceledException) { throw; }
            catch (Exception exception)
            { throw new ExternalServiceException("Azure AI Translator could not be reached.", exception); }
            using (response)
            {
                if (!response.IsSuccessStatusCode)
                    throw new ExternalServiceException(
                        $"Azure AI Translator returned HTTP {(int)response.StatusCode}.");
                try
                {
                    await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
                    using var json = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
                    if (json.RootElement.ValueKind != JsonValueKind.Array ||
                        json.RootElement.GetArrayLength() != batch.Count)
                        throw new JsonException("Translation response count does not match the request.");
                    foreach (var item in json.RootElement.EnumerateArray())
                    {
                        var translations = item.GetProperty("translations");
                        if (translations.GetArrayLength() == 0) throw new JsonException("Translation is missing.");
                        translated.Add(translations[0].GetProperty("text").GetString()
                            ?? throw new JsonException("Translated text is null."));
                    }
                }
                catch (OperationCanceledException) { throw; }
                catch (ExternalServiceException) { throw; }
                catch (Exception exception)
                { throw new ExternalServiceException("Azure AI Translator returned an invalid response.", exception); }
            }
        }
        return translated;
    }

    private static IReadOnlyList<IReadOnlyList<string>> Batches(IReadOnlyList<string> texts, int maxItems,
        int maxCharacters)
    {
        var result = new List<IReadOnlyList<string>>();
        var current = new List<string>();
        var characters = 0;
        foreach (var text in texts)
        {
            if (text.Length > maxCharacters)
                throw new ExternalServiceException("A translation segment exceeds the provider character limit.");
            if (current.Count == maxItems || characters + text.Length > maxCharacters)
            { result.Add(current.ToArray()); current.Clear(); characters = 0; }
            current.Add(text); characters += text.Length;
        }
        if (current.Count > 0) result.Add(current.ToArray());
        return result;
    }

    private sealed record TranslationBody(string Text);
}
