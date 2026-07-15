using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using Kb.Application.Abstractions.Storage;

namespace Kb.Infrastructure.Storage;

public sealed class AzureBlobObjectStorage(
    BlobServiceClient blobServiceClient) : IObjectStorage
{
    public async Task<string> UploadAsync(
        string containerName,
        string objectName,
        Stream content,
        string contentType,
        CancellationToken cancellationToken)
    {
        ValidateContainerName(containerName);
        ValidateObjectName(objectName);
        ArgumentNullException.ThrowIfNull(content);
        ArgumentException.ThrowIfNullOrWhiteSpace(contentType);

        if (!content.CanRead)
        {
            throw new ArgumentException(
                "The supplied content stream must be readable.",
                nameof(content));
        }

        var normalizedObjectName = NormalizeObjectName(objectName);

        var containerClient =
            blobServiceClient.GetBlobContainerClient(containerName);

        // Containers remain private by default.
        await containerClient.CreateIfNotExistsAsync(
            cancellationToken: cancellationToken);

        var blobClient =
            containerClient.GetBlobClient(normalizedObjectName);

        var uploadOptions = new BlobUploadOptions
        {
            HttpHeaders = new BlobHttpHeaders
            {
                ContentType = contentType
            }
        };

        /*
         * UploadAsync with BlobUploadOptions replaces an existing blob at
         * the same path. This is useful for current-draft autosaves.
         *
         * Media and immutable article versions should always use unique
         * object names so they are not accidentally replaced.
         */
        await blobClient.UploadAsync(
            content,
            uploadOptions,
            cancellationToken);

        // Store this relative object name in SQL Server, not the full URL.
        return blobClient.Name;
    }

    public async Task<Stream> DownloadAsync(
        string containerName,
        string objectName,
        CancellationToken cancellationToken)
    {
        ValidateContainerName(containerName);
        ValidateObjectName(objectName);

        var blobClient = GetBlobClient(containerName, objectName);

        /*
         * The returned stream downloads content as it is read instead of
         * loading the entire file into memory.
         *
         * The caller is responsible for disposing the returned stream.
         */
        return await blobClient.OpenReadAsync(
            new BlobOpenReadOptions(allowModifications: false),
            cancellationToken);
    }

    public async Task DeleteAsync(
        string containerName,
        string objectName,
        CancellationToken cancellationToken)
    {
        ValidateContainerName(containerName);
        ValidateObjectName(objectName);

        var blobClient = GetBlobClient(containerName, objectName);

        await blobClient.DeleteIfExistsAsync(
            DeleteSnapshotsOption.IncludeSnapshots,
            conditions: null,
            cancellationToken);
    }

    private BlobClient GetBlobClient(
        string containerName,
        string objectName)
    {
        var normalizedObjectName = NormalizeObjectName(objectName);

        return blobServiceClient
            .GetBlobContainerClient(containerName)
            .GetBlobClient(normalizedObjectName);
    }

    private static string NormalizeObjectName(string objectName)
    {
        return objectName
            .Replace('\\', '/')
            .TrimStart('/');
    }

    private static void ValidateContainerName(string containerName)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(containerName);
    }

    private static void ValidateObjectName(string objectName)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(objectName);
    }
}