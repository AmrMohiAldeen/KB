using Kb.Application;
using Kb.Application.Lifecycle;
using Kb.Infrastructure;
using Kb.Infrastructure.Data;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Kb.Tests;

public sealed class DependencyInjectionLifetimeTests
{
    [Fact]
    public void Lifecycle_service_and_database_context_are_scoped()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Storage:ConnectionString"] = "UseDevelopmentStorage=true",
                ["ConnectionStrings:kbDatabase"] =
                    "Server=(localdb)\\mssqllocaldb;Database=kb-lifetime-test;Trusted_Connection=True"
            })
            .Build();
        var services = new ServiceCollection();

        services.AddApplication();
        services.AddInfrastructure(configuration);

        Assert.Contains(services, descriptor =>
            descriptor.ServiceType == typeof(ArticleLifecycleService) &&
            descriptor.Lifetime == ServiceLifetime.Scoped);
        Assert.Contains(services, descriptor =>
            descriptor.ServiceType == typeof(KbDbContext) &&
            descriptor.Lifetime == ServiceLifetime.Scoped);
    }
}
