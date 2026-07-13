using System.Data;
using System.Diagnostics;
using Kb.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Kb.Api.Controllers;

[ApiController]
[AllowAnonymous]
[Route("api/[controller]")]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class DiagnosticsController : ControllerBase
{
    private readonly KbDbContext _dbContext; 
    private readonly IWebHostEnvironment _environment;
    private readonly TimeProvider _timeProvider;

    public DiagnosticsController(
        KbDbContext dbContext,
        IWebHostEnvironment environment,
        TimeProvider timeProvider)
    {
        _dbContext = dbContext;
        _environment = environment;
        _timeProvider = timeProvider;
    }

    /// <summary>
    /// Confirms that the API is running.
    /// </summary>
    /// <returns>Basic API status information.</returns>
    [HttpGet]
    [ProducesResponseType<ApiDiagnosticsResponse>(StatusCodes.Status200OK)]
    public ActionResult<ApiDiagnosticsResponse> GetApiDiagnostics()
    {
        return Ok(new ApiDiagnosticsResponse(
            Status: "Healthy",
            Service: "Kb.Api",
            Environment: _environment.EnvironmentName,
            UtcTimestamp: _timeProvider.GetUtcNow()));
    }

    /// <summary>
    /// Checks whether the API can connect to SQL Server and execute a query.
    /// Available only in the Development environment.
    /// </summary>
    [HttpGet("database")]
    [ProducesResponseType<DatabaseDiagnosticsResponse>(
        StatusCodes.Status200OK)]
    [ProducesResponseType<DatabaseDiagnosticsResponse>(
        StatusCodes.Status503ServiceUnavailable)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<DatabaseDiagnosticsResponse>>
        GetDatabaseDiagnostics(CancellationToken cancellationToken)
    {
        // Do not expose database and server information in production.
        if (!_environment.IsDevelopment())
        {
            return NotFound();
        }

        var stopwatch = Stopwatch.StartNew();

        var canConnect = await _dbContext.Database
            .CanConnectAsync(cancellationToken);

        if (!canConnect)
        {
            stopwatch.Stop();

            return StatusCode(
                StatusCodes.Status503ServiceUnavailable,
                new DatabaseDiagnosticsResponse(
                    Status: "Unhealthy",
                    CanConnect: false,
                    Provider: _dbContext.Database.ProviderName,
                    DatabaseName: null,
                    DataSource: null,
                    ServerVersion: null,
                    ServerEdition: null,
                    ResponseTimeMilliseconds:
                        stopwatch.ElapsedMilliseconds,
                    Error: "The database connection could not be opened."));
        }

        var connection = _dbContext.Database.GetDbConnection();
        var shouldCloseConnection =
            connection.State != ConnectionState.Open;

        try
        {
            if (shouldCloseConnection)
            {
                await connection.OpenAsync(cancellationToken);
            }

            await using var command = connection.CreateCommand();

            command.CommandText = """
                    SELECT
                        DB_NAME() AS DatabaseName,
                        CAST(
                            SERVERPROPERTY('ProductVersion')
                            AS nvarchar(128)
                        ) AS ServerVersion,
                        CAST(
                            SERVERPROPERTY('Edition')
                            AS nvarchar(128)
                        ) AS ServerEdition;
                """;

            await using var reader =
                await command.ExecuteReaderAsync(cancellationToken);

            if (!await reader.ReadAsync(cancellationToken))
            {
                throw new InvalidOperationException(
                    "The database diagnostic query returned no result.");
            }

            stopwatch.Stop();

            return Ok(new DatabaseDiagnosticsResponse(
                Status: "Healthy",
                CanConnect: true,
                Provider: _dbContext.Database.ProviderName,
                DatabaseName: GetNullableString(reader, 0),
                DataSource: connection.DataSource,
                ServerVersion: GetNullableString(reader, 1),
                ServerEdition: GetNullableString(reader, 2),
                ResponseTimeMilliseconds:
                    stopwatch.ElapsedMilliseconds,
                Error: null));
        }
        finally
        {
            if (shouldCloseConnection &&
                connection.State != ConnectionState.Closed)
            {
                await connection.CloseAsync();
            }
        }
    }

    private static string? GetNullableString(
        System.Data.Common.DbDataReader reader,
        int ordinal)
    {
        return reader.IsDBNull(ordinal)
            ? null
            : reader.GetString(ordinal);
    }
}

public sealed record ApiDiagnosticsResponse(
    string Status,
    string Service,
    string Environment,
    DateTimeOffset UtcTimestamp);

public sealed record DatabaseDiagnosticsResponse(
    string Status,
    bool CanConnect,
    string? Provider,
    string? DatabaseName,
    string? DataSource,
    string? ServerVersion,
    string? ServerEdition,
    long ResponseTimeMilliseconds,
    string? Error);
