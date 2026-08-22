using Azure.Storage.Blobs;

namespace Kb.Api.Startup;

public sealed class BlobStorageStartupCheck(
    BlobServiceClient blobServiceClient,
    IHostEnvironment environment,
    ILogger<BlobStorageStartupCheck> logger) : IHostedService
{
    public async Task StartAsync(CancellationToken cancellationToken)
    {
        try
        {
            await blobServiceClient.GetPropertiesAsync(cancellationToken);
            logger.LogInformation("Object storage is reachable at {BlobServiceUri}.", blobServiceClient.Uri);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception exception)
        {
            var guidance = environment.IsDevelopment()
                ? " Start the local dependencies with 'docker compose -f compose.typesense.yml up -d' from backend/kb-backend."
                : " Verify the environment-provided Storage__ConnectionString and blob service availability.";

            throw new InvalidOperationException(
                $"Object storage at '{blobServiceClient.Uri}' is not reachable or its credentials are invalid.{guidance}",
                exception);
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
