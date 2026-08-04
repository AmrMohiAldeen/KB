namespace Kb.Contracts.Auth;

public sealed record PermissionContextResponse(Guid UserId, IReadOnlyList<string> Permissions);
