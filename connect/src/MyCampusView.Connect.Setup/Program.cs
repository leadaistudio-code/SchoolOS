using System.Runtime.InteropServices;
using Microsoft.Extensions.Logging;
using MyCampusView.Connect.Core.Abstractions;
using MyCampusView.Connect.Core.Cloud;
using MyCampusView.Connect.Core.Config;

namespace MyCampusView.Connect.Setup;

public static class Program
{
    public static async Task<int> Main(string[] args)
    {
        Console.WriteLine("MyCampusView Connect — Pairing Setup");
        Console.WriteLine("====================================");
        Console.WriteLine();

        if (!RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        {
            Console.Error.WriteLine("This tool requires Windows (DPAPI credential storage).");
            return 2;
        }

        ConnectorConfig.EnsureDirectories();

        using var loggerFactory = LoggerFactory.Create(b =>
        {
            b.SetMinimumLevel(LogLevel.Information);
            b.AddSimpleConsole(o =>
            {
                o.SingleLine = true;
                o.TimestampFormat = "HH:mm:ss ";
            });
        });

        var apiBase = Prompt(
            "API base URL (e.g. https://school.mycampusview.com)",
            args.ElementAtOrDefault(0));
        var pairingCode = Prompt(
            "Pairing code from Biometric admin (e.g. MCV-XXXX-XXXX)",
            args.ElementAtOrDefault(1));
        var connectorName = Prompt(
            "Connector display name",
            args.ElementAtOrDefault(2) ?? Environment.MachineName);

        if (string.IsNullOrWhiteSpace(apiBase) || string.IsNullOrWhiteSpace(pairingCode))
        {
            Console.Error.WriteLine("API base URL and pairing code are required.");
            return 1;
        }

        apiBase = apiBase.Trim().TrimEnd('/');
        pairingCode = pairingCode.Trim();

        var config = new ConnectorConfig
        {
            ApiBaseUrl = apiBase,
            ConnectorVersion = "1.0.0",
            ConnectorName = connectorName,
            AllowSimulator = false,
        };

        using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(60) };
        var cloud = new CloudApiClient(http, config, loggerFactory.CreateLogger<CloudApiClient>());
        cloud.SetApiBaseUrl(apiBase);

        Console.WriteLine();
        Console.WriteLine("Pairing…");

        try
        {
            var result = await cloud.PairAsync(new PairRequest
            {
                Code = pairingCode,
                Hostname = Environment.MachineName,
                OsInfo = $"{Environment.OSVersion}; .NET {Environment.Version}",
                ConnectorVersion = config.ConnectorVersion,
                Name = connectorName,
            }).ConfigureAwait(false);

            var store = new SecureCredentialStore();
            store.Save(new StoredCredentials
            {
                ApiBaseUrl = apiBase,
                ConnectorId = result.ConnectorId,
                ConnectorKey = result.ConnectorKey,
                ConnectorSecret = result.ConnectorSecret,
                ConnectorName = result.ConnectorName,
                TenantId = result.Tenant?.Id,
                TenantName = result.Tenant?.Name,
                TenantSlug = result.Tenant?.Slug,
                PairedAt = DateTimeOffset.UtcNow,
            });

            // Persist non-secret runtime config for the Windows service.
            var existing = ConnectorConfigLoader.TryLoadLocalOverlay() ?? new ConnectorConfig();
            existing.ApiBaseUrl = apiBase;
            existing.ConnectorName = result.ConnectorName;
            existing.ConnectorVersion = config.ConnectorVersion;
            if (existing.Devices.Count == 0)
            {
                Console.WriteLine();
                Console.WriteLine("No devices configured yet.");
                Console.WriteLine($"Edit {ConnectorConfig.LocalConfigPath} and add Connector devices, for example:");
                Console.WriteLine(
                    """
                    {
                      "ApiBaseUrl": "https://your-school-host",
                      "AllowSimulator": false,
                      "Devices": [
                        {
                          "LocalDeviceId": "gate-1",
                          "Name": "Main Gate",
                          "Brand": "Realtime",
                          "Model": "RS9W",
                          "NetworkAddress": "192.168.1.50",
                          "Port": 4370,
                          "Purpose": "BOTH"
                        }
                      ]
                    }
                    """);
            }

            ConnectorConfigLoader.SaveLocalOverlay(existing);

            Console.WriteLine();
            Console.WriteLine("Paired successfully.");
            Console.WriteLine($"  Tenant:     {result.Tenant?.Name ?? "(unknown)"} ({result.Tenant?.Slug})");
            Console.WriteLine($"  Connector:  {result.ConnectorName}");
            Console.WriteLine($"  Id:         {result.ConnectorId}");
            Console.WriteLine($"  Key:        {result.ConnectorKey}");
            Console.WriteLine($"  Secret:     stored via DPAPI at {ConnectorConfig.CredentialsPath}");
            Console.WriteLine($"  Config:     {ConnectorConfig.LocalConfigPath}");
            Console.WriteLine();
            Console.WriteLine("Next: configure devices, then install/start the Windows service:");
            Console.WriteLine("  .\\scripts\\publish.ps1");
            Console.WriteLine("  .\\scripts\\install-service.ps1");
            return 0;
        }
        catch (CloudApiException ex)
        {
            Console.Error.WriteLine($"Pairing failed ({(int)ex.StatusCode} {ex.Code}): {ex.Message}");
            return 3;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Pairing failed: {ex.Message}");
            return 4;
        }
    }

    private static string Prompt(string label, string? preset)
    {
        if (!string.IsNullOrWhiteSpace(preset))
        {
            Console.WriteLine($"{label}: {preset}");
            return preset.Trim();
        }

        Console.Write($"{label}: ");
        return (Console.ReadLine() ?? "").Trim();
    }
}
