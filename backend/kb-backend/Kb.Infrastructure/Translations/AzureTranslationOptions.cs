namespace Kb.Infrastructure.Translations;

public sealed class AzureTranslationOptions
{
    public string Endpoint { get; set; } = "https://api.cognitive.microsofttranslator.com";
    public string ApiKey { get; set; } = string.Empty;
    public string? Region { get; set; }
    public int MaxBatchItems { get; set; } = 100;
    public int MaxBatchCharacters { get; set; } = 40000;
}
