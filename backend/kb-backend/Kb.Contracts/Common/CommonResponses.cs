namespace Kb.Contracts.Common;

public sealed record PagedResponse<T>(IReadOnlyList<T> Items, int Page, int PageSize, long TotalCount);
public sealed record UserSummaryResponse(Guid UserId, string FullName);
public sealed record CategorySummaryResponse(Guid CategoryId, string Name, string Slug, string? Path);
public sealed record RoleSummaryResponse(Guid RoleId, string RoleName);
