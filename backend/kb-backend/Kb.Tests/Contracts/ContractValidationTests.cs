using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using Kb.Contracts.Articles;
using Kb.Contracts.Comments;
using Kb.Contracts.Common;
using Kb.Contracts.Drafts;
using Kb.Contracts.ExportJobs;
using Kb.Contracts.Notifications;
using Kb.Contracts.Roles;

namespace Kb.Tests.Contracts;

public sealed class ContractValidationTests
{
    [Fact]
    public void Required_string_rejects_whitespace()
    {
        var request = new CreateArticleRequest { Title = "   " };
        AssertInvalid(request, nameof(CreateArticleRequest.Title));
    }

    [Theory]
    [InlineData("")]
    [InlineData("not-base64")]
    [InlineData("====")]
    public void Row_version_rejects_invalid_base64(string rowVersion)
    {
        var request = new SaveArticleDraftRequest { Content = TiptapDocument(), RowVersion = rowVersion };
        AssertInvalid(request, nameof(SaveArticleDraftRequest.RowVersion));
    }

    [Fact]
    public void Row_version_accepts_non_empty_base64()
    {
        var request = new SaveArticleDraftRequest
        {
            Content = TiptapDocument(),
            RowVersion = Convert.ToBase64String([1, 2, 3, 4])
        };

        Assert.Empty(Validate(request));
    }

    [Fact]
    public void Tiptap_content_requires_doc_root()
    {
        using var json = JsonDocument.Parse("""{"type":"paragraph"}""");
        var request = new SaveArticleDraftRequest
        {
            Content = json.RootElement.Clone(),
            RowVersion = Convert.ToBase64String([1])
        };

        AssertInvalid(request, nameof(SaveArticleDraftRequest.Content));
    }

    [Fact]
    public void Role_permissions_reject_unknown_and_duplicate_codes()
    {
        var request = new CreateRoleRequest
        {
            RoleName = "Editor",
            PermissionCodes = [PermissionCodes.ArticlesCreate, PermissionCodes.ArticlesCreate, "unknown"]
        };

        var results = Validate(request);
        Assert.Contains(results, result => result.ErrorMessage!.Contains("duplicates", StringComparison.Ordinal));
        Assert.Contains(results, result => result.ErrorMessage!.Contains("Unsupported", StringComparison.Ordinal));
    }

    [Fact]
    public void Notification_batch_requires_unique_non_empty_ids()
    {
        var id = Guid.NewGuid();
        var request = new MarkNotificationsReadRequest { NotificationIds = [id, id, Guid.Empty] };
        var results = Validate(request);

        Assert.Contains(results, result => result.ErrorMessage!.Contains("empty GUIDs", StringComparison.Ordinal));
        Assert.Contains(results, result => result.ErrorMessage!.Contains("duplicates", StringComparison.Ordinal));
    }

    [Fact]
    public void Anchored_comment_requires_supported_type_and_object_data()
    {
        var request = new CreateCommentRequest { Body = "Review this", AnchorType = CommentAnchorTypes.TextRange };
        AssertInvalid(request, nameof(CreateCommentRequest.AnchorData));
    }

    [Theory]
    [InlineData("PDF")]
    [InlineData("HTML")]
    public void Export_accepts_supported_immutable_version_formats(string format)
    {
        var request = new ExportArticleRequest { VersionId = Guid.NewGuid(), ExportType = format };
        Assert.Empty(Validate(request));
    }

    private static JsonElement TiptapDocument()
    {
        using var document = JsonDocument.Parse("""{"type":"doc","content":[]}""");
        return document.RootElement.Clone();
    }

    private static IReadOnlyList<ValidationResult> Validate(object value)
    {
        var results = new List<ValidationResult>();
        Validator.TryValidateObject(value, new ValidationContext(value), results, validateAllProperties: true);
        return results;
    }

    private static void AssertInvalid(object value, string memberName) =>
        Assert.Contains(Validate(value), result => result.MemberNames.Contains(memberName));
}
