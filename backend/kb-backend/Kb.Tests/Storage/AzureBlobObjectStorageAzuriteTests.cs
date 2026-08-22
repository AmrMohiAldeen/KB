using Azure.Storage.Blobs;
using Kb.Infrastructure.Storage;

namespace Kb.Tests.Storage;

public sealed class AzureBlobObjectStorageAzuriteTests
{
    [AzuriteFact]
    public async Task Upload_and_stream_download_preserve_existing_media_object_names()
    {
        var connectionString = Environment.GetEnvironmentVariable("KB_TEST_BLOB_CONNECTION_STRING")!;
        var blobServiceClient = new BlobServiceClient(connectionString);
        var storage = new AzureBlobObjectStorage(blobServiceClient);
        var containerName = $"kb-storage-test-{Guid.NewGuid():N}";
        var objectName = $"2026/08/{Guid.NewGuid():N}.png";
        var expected = "real Azurite upload and streamed download"u8.ToArray();

        try
        {
            await using var upload = new MemoryStream(expected);
            var storedObjectName = await storage.UploadAsync(
                containerName, objectName, upload, "image/png", CancellationToken.None);

            Assert.Equal(objectName, storedObjectName);

            await using var downloaded = await storage.DownloadAsync(
                containerName, objectName, CancellationToken.None);
            await using var copy = new MemoryStream();
            await downloaded.CopyToAsync(copy);

            Assert.Equal(expected, copy.ToArray());
        }
        finally
        {
            await blobServiceClient.GetBlobContainerClient(containerName).DeleteIfExistsAsync();
        }
    }
}

public sealed class AzuriteFactAttribute : FactAttribute
{
    public AzuriteFactAttribute()
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("KB_TEST_BLOB_CONNECTION_STRING")))
            Skip = "Set KB_TEST_BLOB_CONNECTION_STRING to run the Azurite integration test.";
    }
}
