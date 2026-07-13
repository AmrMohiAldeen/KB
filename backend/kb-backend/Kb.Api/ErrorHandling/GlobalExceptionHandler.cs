using System.Diagnostics;
using System.ComponentModel.DataAnnotations;
using System.Data.Common;
using Kb.Application.Exceptions;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Kb.Api.ErrorHandling;

public sealed class GlobalExceptionHandler(ILogger<GlobalExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        var (status, title, detail) = Map(exception);
        var traceId = Activity.Current?.Id ?? httpContext.TraceIdentifier;

        if (status == StatusCodes.Status500InternalServerError)
        {
            logger.LogError(exception, "Unhandled exception for trace {TraceId}", traceId);
        }
        else if (status == StatusCodes.Status503ServiceUnavailable)
        {
            logger.LogWarning(exception, "External dependency failure for trace {TraceId}", traceId);
        }

        var problem = new ProblemDetails
        {
            Status = status,
            Title = title,
            Detail = detail,
            Type = $"https://httpstatuses.com/{status}",
            Instance = httpContext.Request.Path
        };
        problem.Extensions["traceId"] = traceId;

        httpContext.Response.StatusCode = status;
        await httpContext.Response.WriteAsJsonAsync(problem, cancellationToken);
        return true;
    }

    internal static (int Status, string Title, string Detail) Map(Exception exception) => exception switch
    {
        BadHttpRequestException => (StatusCodes.Status400BadRequest, "Bad request", "The request could not be processed."),
        ValidationException => (StatusCodes.Status400BadRequest, "Validation failed", "The request is invalid."),
        BusinessRuleException businessRule => (StatusCodes.Status400BadRequest, "Business rule violation", businessRule.Message),
        UnauthorizedAccessException => (StatusCodes.Status401Unauthorized, "Unauthorized", "Authentication is required."),
        ForbiddenException forbidden => (StatusCodes.Status403Forbidden, "Forbidden", forbidden.Message),
        NotFoundException notFound => (StatusCodes.Status404NotFound, "Not found", notFound.Message),
        ConflictException conflict => (StatusCodes.Status409Conflict, "Conflict", conflict.Message),
        ConcurrencyConflictException concurrency => (StatusCodes.Status409Conflict, "Concurrency conflict", concurrency.Message),
        DbUpdateConcurrencyException => (StatusCodes.Status409Conflict, "Concurrency conflict", "The resource was changed by another request."),
        ExternalServiceException => (StatusCodes.Status503ServiceUnavailable, "Service unavailable", "A required service is temporarily unavailable."),
        DbException => (StatusCodes.Status503ServiceUnavailable, "Service unavailable", "A required service is temporarily unavailable."),
        _ => (StatusCodes.Status500InternalServerError, "An unexpected error occurred.", "An unexpected error occurred. Contact support with the trace ID.")
    };
}
