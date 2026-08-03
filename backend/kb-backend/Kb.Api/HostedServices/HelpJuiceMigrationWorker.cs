using Kb.Application.Migrations.HelpJuice;

namespace Kb.Api.HostedServices;

public sealed class HelpJuiceMigrationWorker(IServiceScopeFactory scopeFactory,
    ILogger<HelpJuiceMigrationWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = scopeFactory.CreateScope();
                var service = scope.ServiceProvider.GetRequiredService<HelpJuiceMigrationService>();
                var worked = await service.ProcessOneValidationAsync(stoppingToken) |
                             await service.ProcessOneImportAsync(stoppingToken);
                if (!worked) await Task.Delay(TimeSpan.FromSeconds(2), stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
            catch (Exception exception)
            {
                logger.LogError(exception, "The HelpJuice migration worker iteration failed.");
                await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
            }
        }
    }
}
