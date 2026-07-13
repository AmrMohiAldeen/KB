using System.ComponentModel.DataAnnotations;
using Kb.Contracts.Common;

namespace Kb.Contracts.Notifications;

public sealed record NotificationResponse(
    Guid NotificationId,
    Guid? ArticleId,
    string Type,
    string Title,
    string? Body,
    bool IsRead,
    DateTime CreatedAt,
    DateTime? ReadAt);

public sealed class MarkNotificationsReadRequest : IValidatableObject
{
    [Required, MinLength(1), MaxLength(ContractLimits.MaxNotificationIds)]
    public required IReadOnlyList<Guid> NotificationIds { get; init; }

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (NotificationIds is null) yield break;

        if (NotificationIds.Any(id => id == Guid.Empty))
            yield return new ValidationResult("Notification IDs must not be empty GUIDs.", [nameof(NotificationIds)]);

        if (NotificationIds.Count != NotificationIds.Distinct().Count())
            yield return new ValidationResult("Notification IDs must not contain duplicates.", [nameof(NotificationIds)]);
    }
}
