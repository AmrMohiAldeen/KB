using System.Text.Json;
using Kb.Api.ErrorHandling;
using Kb.Application.Exceptions;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging.Abstractions;

namespace Kb.Tests.Foundations;

public sealed class GlobalExceptionHandlerTests
{
    [Theory]
    [MemberData(nameof(KnownExceptions))]
    public async Task Known_exceptions_map_to_the_expected_problem_status(Exception exception, int expectedStatus)
    {
        var (context, document) = await HandleAsync(exception);

        Assert.Equal(expectedStatus, context.Response.StatusCode);
        Assert.Equal(expectedStatus, document.RootElement.GetProperty("status").GetInt32());
        Assert.Equal("trace-for-test", document.RootElement.GetProperty("traceId").GetString());
    }

    [Fact]
    public async Task Unexpected_exception_returns_safe_problem_details_and_does_not_leak_sensitive_data()
    {
        var (_, document) = await HandleAsync(new InvalidOperationException("Server=db01; Password=secret; C:\\storage\\file"));
        var json = document.RootElement.GetRawText();

        Assert.Equal(StatusCodes.Status500InternalServerError, document.RootElement.GetProperty("status").GetInt32());
        Assert.Equal("trace-for-test", document.RootElement.GetProperty("traceId").GetString());
        Assert.DoesNotContain("db01", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("secret", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("storage", json, StringComparison.OrdinalIgnoreCase);
    }

    public static IEnumerable<object[]> KnownExceptions()
    {
        yield return [new BusinessRuleException(), StatusCodes.Status400BadRequest];
        yield return [new UnauthorizedAccessException(), StatusCodes.Status401Unauthorized];
        yield return [new ForbiddenException(), StatusCodes.Status403Forbidden];
        yield return [new NotFoundException(), StatusCodes.Status404NotFound];
        yield return [new ConflictException(), StatusCodes.Status409Conflict];
        yield return [new ConcurrencyConflictException(), StatusCodes.Status409Conflict];
        yield return [new ExternalServiceException(), StatusCodes.Status503ServiceUnavailable];
    }

    private static async Task<(DefaultHttpContext Context, JsonDocument Document)> HandleAsync(Exception exception)
    {
        var context = new DefaultHttpContext { TraceIdentifier = "trace-for-test" };
        context.Response.Body = new MemoryStream();
        var handler = new GlobalExceptionHandler(NullLogger<GlobalExceptionHandler>.Instance);

        Assert.True(await handler.TryHandleAsync(context, exception, CancellationToken.None));
        context.Response.Body.Position = 0;
        return (context, await JsonDocument.ParseAsync(context.Response.Body));
    }
}
