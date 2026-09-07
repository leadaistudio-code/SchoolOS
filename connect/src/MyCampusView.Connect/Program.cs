using Microsoft.Extensions.Logging;
using MyCampusView.Connect.Core.Abstractions;
using MyCampusView.Connect.Core.Cloud;
using MyCampusView.Connect.Core.Config;
using MyCampusView.Connect.Core.Logging;
using MyCampusView.Connect.Core.Queue;
using MyCampusView.Connect.Core.Services;

namespace MyCampusView.Connect;

public static class Program
{
    public static async Task Main(string[] args)
    {
        ConnectorConfig.EnsureDirectories();

        var builder = Host.CreateApplicationBuilder(args);

        builder.Services.AddWindowsService(options =>
        {
            options.ServiceName = "MyCampusView Connect";
        });

        builder.Logging.ClearProviders();
        builder.Logging.AddConsole();
        builder.Logging.AddProvider(new RotatingFileLoggerProvider());

        var connectorOptions = new ConnectorConfig();
        builder.Configuration.GetSection(ConnectorConfig.SectionName).Bind(connectorOptions);

        var localConfigPath = ConnectorConfig.LocalConfigPath;
        if (File.Exists(localConfigPath))
        {
            var overlay = ConnectorConfigLoader.TryLoadLocalOverlay();
            if (overlay is not null)
            {
                ConnectorConfigLoader.MergeOverlay(connectorOptions, overlay);
            }

            ConnectorConfigLoader.MergeAllowSimulatorIfPresent(
                connectorOptions,
                File.ReadAllText(localConfigPath));
        }

        // Production hard-guard: simulator stays off unless explicitly enabled.
        if (builder.Environment.IsProduction())
        {
            var explicitAllow = builder.Configuration.GetValue("Connector:AllowSimulator", false);
            if (File.Exists(localConfigPath))
            {
                var json = File.ReadAllText(localConfigPath);
                using var doc = System.Text.Json.JsonDocument.Parse(json);
                if (doc.RootElement.TryGetProperty("AllowSimulator", out var p) ||
                    doc.RootElement.TryGetProperty("allowSimulator", out p))
                {
                    if (p.ValueKind is System.Text.Json.JsonValueKind.True)
                    {
                        explicitAllow = true;
                    }
                    else if (p.ValueKind is System.Text.Json.JsonValueKind.False)
                    {
                        explicitAllow = false;
                    }
                }
            }

            if (!explicitAllow)
            {
                connectorOptions.AllowSimulator = false;
            }
        }

        builder.Services.AddSingleton(connectorOptions);
        builder.Services.AddSingleton(new SecureCredentialStore());
        builder.Services.AddSingleton<IEventQueue, SqliteEventQueue>();
        builder.Services.AddHttpClient("MyCampusView.Connect", client =>
        {
            client.Timeout = TimeSpan.FromSeconds(60);
        });
        builder.Services.AddSingleton<ICloudApiClient>(sp =>
        {
            var http = sp.GetRequiredService<IHttpClientFactory>().CreateClient("MyCampusView.Connect");
            return new CloudApiClient(
                http,
                sp.GetRequiredService<ConnectorConfig>(),
                sp.GetRequiredService<ILogger<CloudApiClient>>());
        });
        builder.Services.AddSingleton<SyncService>();
        builder.Services.AddHostedService(sp => sp.GetRequiredService<SyncService>());
        builder.Services.AddHostedService<Worker>();

        var host = builder.Build();
        await host.RunAsync().ConfigureAwait(false);
    }
}
