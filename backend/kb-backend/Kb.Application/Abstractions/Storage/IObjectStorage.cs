namespace Kb.Application.Abstractions.Storage;

public interface IObjectStorage
{
    Task<string> UploadAsync(
        string containerName,
        string objectName,
        Stream content,
        string contentType,
        CancellationToken cancellationToken);

    Task<Stream> DownloadAsync(
        string containerName,
        string objectName,
        CancellationToken cancellationToken);

    Task DeleteAsync(
        string containerName,
        string objectName,
        CancellationToken cancellationToken);
}