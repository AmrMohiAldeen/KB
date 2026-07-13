using System.Security.Claims;
using Kb.Application.Abstractions;
using Kb.Domain.Constants;
using Microsoft.AspNetCore.Http;

namespace Kb.Api.Authentication;

public sealed class HttpCurrentUser(IHttpContextAccessor httpContextAccessor) : ICurrentUser
{
    private ClaimsPrincipal? Principal => httpContextAccessor.HttpContext?.User;

    public bool IsAuthenticated => Principal?.Identity?.IsAuthenticated == true;

    public Guid UserId
    {
        get
        {
            if (!IsAuthenticated)
                throw new UnauthorizedAccessException("An authenticated KB user is required.");

            var value = Principal!.FindFirstValue(ClaimNames.InternalUserId);
            if (!Guid.TryParse(value, out var userId) || userId == Guid.Empty)
                throw new UnauthorizedAccessException("The authenticated identity does not contain a valid KB user identifier.");

            return userId;
        }
    }

    public string? Email => IsAuthenticated ? Principal?.FindFirstValue(ClaimTypes.Email) : null;
}
