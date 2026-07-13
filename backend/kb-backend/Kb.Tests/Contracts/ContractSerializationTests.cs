using System.Reflection;
using System.Text.Json;
using Kb.Contracts.Articles;
using Kb.Contracts.Common;
using Kb.Contracts.ContentBlocks.ReusableBlocks;
using Kb.Contracts.ContentBlocks.Templates;
using Kb.Contracts.Drafts;
using Kb.Contracts.ExportJobs;
using Kb.Contracts.Media;
using Kb.Contracts.Versions;

namespace Kb.Tests.Contracts;

public sealed class ContractSerializationTests
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    [Fact]
    public void Contracts_never_expose_internal_identifiers_or_paths()
    {
        var forbidden = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "SsoId", "ContentJsonStoragePath", "RenderedHtmlStoragePath", "PlainTextStoragePath",
            "StoragePath", "StoredFileName", "ResultPath", "MetaDataJson"
        };

        var exposed = ContractTypes()
            .SelectMany(type => type.GetProperties(BindingFlags.Instance | BindingFlags.Public))
            .Where(property => forbidden.Contains(property.Name))
            .Select(property => $"{property.DeclaringType!.Name}.{property.Name}")
            .ToArray();

        Assert.Empty(exposed);
    }

    [Fact]
    public void Article_summary_serialization_excludes_content()
    {
        var response = new ArticleSummaryResponse(
            Guid.NewGuid(), "Title", "title", null,
            new UserSummaryResponse(Guid.NewGuid(), "Author"), "Draft", DateTime.UtcNow, DateTime.UtcNow);

        var json = JsonSerializer.Serialize(response, JsonOptions);
        Assert.DoesNotContain("content", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("path", json, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Content_details_expose_content_without_storage_paths()
    {
        using var contentDocument = JsonDocument.Parse("""{"type":"doc","content":[]}""");
        var response = new ArticleVersionDetailsResponse(
            Guid.NewGuid(), Guid.NewGuid(), 1, contentDocument.RootElement.Clone(), null, 25,
            new UserSummaryResponse(Guid.NewGuid(), "Author"), DateTime.UtcNow, null, null);

        var json = JsonSerializer.Serialize(response, JsonOptions);
        Assert.Contains("\"content\"", json, StringComparison.Ordinal);
        Assert.DoesNotContain("storagePath", json, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Media_responses_exclude_stored_file_names_and_paths()
    {
        var response = new MediaDetailsResponse(
            Guid.NewGuid(), "photo.png", "image/png", ".png", 100, "/api/media/1", "Active",
            new UserSummaryResponse(Guid.NewGuid(), "Uploader"), DateTime.UtcNow, 2);

        var json = JsonSerializer.Serialize(response, JsonOptions);
        Assert.DoesNotContain("storedFileName", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("storagePath", json, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("\"url\"", json, StringComparison.Ordinal);
    }

    [Fact]
    public void Export_response_excludes_result_path()
    {
        var response = new ExportJobResponse(
            Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), "PDF", "Completed",
            new UserSummaryResponse(Guid.NewGuid(), "Requester"), DateTime.UtcNow, "/api/exports/1/download", null);

        var json = JsonSerializer.Serialize(response, JsonOptions);
        Assert.DoesNotContain("resultPath", json, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("downloadUrl", json, StringComparison.Ordinal);
    }

    [Fact]
    public void Content_block_requests_cannot_set_type()
    {
        Assert.Null(typeof(CreateTemplateRequest).GetProperty("Type"));
        Assert.Null(typeof(UpdateTemplateRequest).GetProperty("Type"));
        Assert.Null(typeof(CreateReusableBlockRequest).GetProperty("Type"));
        Assert.Null(typeof(UpdateReusableBlockRequest).GetProperty("Type"));
    }

    [Fact]
    public void Unsupported_contract_fields_are_absent()
    {
        var forbiddenFragments = new[] { "Suggestion", "DraftNumber", "SnapshotType", "SourceDraft", "AltText", "Caption" };
        var names = ContractTypes()
            .SelectMany(type => new[] { type.Name }.Concat(type.GetProperties().Select(property => property.Name)))
            .ToArray();

        foreach (var fragment in forbiddenFragments)
            Assert.DoesNotContain(names, name => name.Contains(fragment, StringComparison.OrdinalIgnoreCase));
    }

    private static IEnumerable<Type> ContractTypes() => typeof(PagedResponse<>).Assembly
        .GetTypes()
        .Where(type => type.IsPublic && type.Namespace?.StartsWith("Kb.Contracts", StringComparison.Ordinal) == true);
}
