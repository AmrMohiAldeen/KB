using System.Diagnostics;
using System.Threading.Channels;
using Kb.Application.Abstractions.Storage;
using Kb.Application.ExportJobs;
using Kb.Domain.Constants;
using Kb.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Kb.Infrastructure.ExportJobs;

public sealed class ExportMediaResolver(KbDbContext db, IObjectStorage storage,
    IOptions<ExportOptions> options) : IExportMediaResolver
{
    public async Task<ExportMediaData?> ResolveAsync(Guid mediaId, int maximumBytes,
        CancellationToken cancellationToken)
    {
        var media = await db.MediaFiles.AsNoTracking()
            .Where(item => item.MediaId == mediaId && item.Status != MediaStatuses.Deleted)
            .Select(item => new { item.MimeType, item.OriginalFileName, item.FileSizeBytes, item.StoragePath })
            .SingleOrDefaultAsync(cancellationToken);
        if (media is null || media.FileSizeBytes < 0 || media.FileSizeBytes > maximumBytes) return null;
        await using var source = await storage.DownloadAsync(options.Value.MediaContainerName,
            media.StoragePath, cancellationToken);
        using var output = new MemoryStream((int)Math.Min(media.FileSizeBytes, int.MaxValue));
        await source.CopyToAsync(output, cancellationToken);
        if (output.Length > maximumBytes) return null;
        return new(media.MimeType, media.OriginalFileName, output.ToArray());
    }
}

public sealed class ChromiumPdfRenderer(IOptions<ExportOptions> options) : IPdfRenderer
{
    public async Task<Stream> RenderAsync(string html, CancellationToken cancellationToken)
    {
        var executable = ResolveExecutable(options.Value.ChromiumExecutablePath);
        if (executable is null)
            throw new InvalidOperationException(
                "A Chromium executable is required for PDF exports. Configure Exports:ChromiumExecutablePath.");

        var directory = Path.Combine(Path.GetTempPath(), $"kb-export-{Guid.NewGuid():N}");
        Directory.CreateDirectory(directory);
        var inputPath = Path.Combine(directory, "document.html");
        var outputPath = Path.Combine(directory, "document.pdf");
        try
        {
            await File.WriteAllTextAsync(inputPath, html, cancellationToken);
            var start = new ProcessStartInfo(executable)
            {
                RedirectStandardError = true,
                RedirectStandardOutput = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };
            start.ArgumentList.Add("--headless=new");
            start.ArgumentList.Add("--disable-gpu");
            start.ArgumentList.Add("--no-pdf-header-footer");
            start.ArgumentList.Add($"--print-to-pdf={outputPath}");
            start.ArgumentList.Add(new Uri(inputPath).AbsoluteUri);
            using var process = Process.Start(start)
                ?? throw new InvalidOperationException("Chromium could not be started.");
            var standardOutput = process.StandardOutput.ReadToEndAsync(cancellationToken);
            var standardError = process.StandardError.ReadToEndAsync(cancellationToken);
            try
            {
                await process.WaitForExitAsync(cancellationToken);
            }
            catch (OperationCanceledException)
            {
                try { process.Kill(entireProcessTree: true); } catch { /* process already stopped */ }
                await process.WaitForExitAsync(CancellationToken.None);
                throw;
            }
            await standardOutput;
            var error = await standardError;
            if (process.ExitCode != 0 || !File.Exists(outputPath))
            {
                throw new InvalidOperationException($"Chromium PDF rendering failed: {Safe(error)}");
            }
            return new MemoryStream(await File.ReadAllBytesAsync(outputPath, cancellationToken), writable: false);
        }
        finally
        {
            try { Directory.Delete(directory, recursive: true); } catch { /* best-effort temporary cleanup */ }
        }
    }

    private static string? ResolveExecutable(string? configured)
    {
        if (!string.IsNullOrWhiteSpace(configured) && File.Exists(configured)) return configured;
        var candidates = new[]
        {
            Environment.GetEnvironmentVariable("CHROME_PATH"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                "Google", "Chrome", "Application", "chrome.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
                "Microsoft", "Edge", "Application", "msedge.exe"),
            "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"
        };
        return candidates.FirstOrDefault(path => !string.IsNullOrWhiteSpace(path) && File.Exists(path));
    }

    private static string Safe(string value) => string.IsNullOrWhiteSpace(value)
        ? "No renderer diagnostic was returned."
        : value.Replace('\r', ' ').Replace('\n', ' ').Trim()[..Math.Min(value.Trim().Length, 500)];
}

public sealed class ExportJobSignal : IExportJobSignal
{
    private readonly Channel<bool> channel = Channel.CreateBounded<bool>(new BoundedChannelOptions(1)
    {
        FullMode = BoundedChannelFullMode.DropWrite,
        SingleReader = true,
        SingleWriter = false
    });

    public void Notify() => channel.Writer.TryWrite(true);

    public async Task WaitAsync(TimeSpan maximumDelay, CancellationToken cancellationToken)
    {
        var ready = channel.Reader.WaitToReadAsync(cancellationToken).AsTask();
        var delay = Task.Delay(maximumDelay, cancellationToken);
        if (await Task.WhenAny(ready, delay) == ready && await ready)
            while (channel.Reader.TryRead(out _)) { }
    }
}

public sealed class ExportJobWorker(
    IServiceScopeFactory scopeFactory,
    IExportJobSignal jobSignal,
    IOptions<ExportOptions> options,
    ILogger<ExportJobWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = scopeFactory.CreateScope();
                var processed = await scope.ServiceProvider.GetRequiredService<ExportJobProcessor>()
                    .ProcessNextAsync(stoppingToken);
                if (!processed) await jobSignal.WaitAsync(options.Value.PollInterval, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
            catch (Exception exception)
            {
                logger.LogError(exception, "The export background worker encountered an error");
                await Task.Delay(options.Value.PollInterval, stoppingToken);
            }
        }
    }
}
