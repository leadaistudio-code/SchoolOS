using System.Text.Json;
using System.Text.Json.Serialization;

namespace MyCampusView.Connect.Core.Config;

public sealed class ConnectorConfig
{
    public const string SectionName = "Connector";

    /// <summary>School ERP base URL, e.g. https://school.mycampusview.com</summary>
    public string ApiBaseUrl { get; set; } = "";

    public string ConnectorVersion { get; set; } = "1.0.0";

    public string? ConnectorName { get; set; }

    public int HeartbeatIntervalSeconds { get; set; } = 30;

    public int PollIntervalSeconds { get; set; } = 15;

    public int CommandPollIntervalSeconds { get; set; } = 20;

    public int BatchSize { get; set; } = 100;

    public int MaxUploadAttempts { get; set; } = 12;

    public int InitialBackoffSeconds { get; set; } = 2;

    public int MaxBackoffSeconds { get; set; } = 300;

    /// <summary>
    /// When false (default in Production), SimulatedBiometricAdapter will not be used
    /// even if a device Brand is Simulator.
    /// </summary>
    public bool AllowSimulator { get; set; }

    public List<DeviceConfigEntry> Devices { get; set; } = new();

    public static string ProgramDataRoot =>
        Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            "MyCampusView",
            "Connect");

    public static string QueueDbPath => Path.Combine(ProgramDataRoot, "queue.db");

    public static string LogsDirectory => Path.Combine(ProgramDataRoot, "logs");

    public static string CheckpointsDirectory => Path.Combine(ProgramDataRoot, "checkpoints");

    public static string LocalConfigPath => Path.Combine(ProgramDataRoot, "config.json");

    public static string CredentialsPath => Path.Combine(ProgramDataRoot, "credentials.dpapi");

    public static void EnsureDirectories()
    {
        Directory.CreateDirectory(ProgramDataRoot);
        Directory.CreateDirectory(LogsDirectory);
        Directory.CreateDirectory(CheckpointsDirectory);
    }

    public Uri GetApiBaseUri()
    {
        if (string.IsNullOrWhiteSpace(ApiBaseUrl))
        {
            throw new InvalidOperationException(
                "Connector:ApiBaseUrl is not configured. Pair the connector or set ApiBaseUrl in config.");
        }

        var trimmed = ApiBaseUrl.Trim().TrimEnd('/');
        if (!Uri.TryCreate(trimmed, UriKind.Absolute, out var uri) ||
            (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
        {
            throw new InvalidOperationException($"Connector:ApiBaseUrl is not a valid absolute HTTP(S) URL: {ApiBaseUrl}");
        }

        return uri;
    }
}

public sealed class DeviceConfigEntry
{
    public string LocalDeviceId { get; set; } = "";

    public string Name { get; set; } = "";

    /// <summary>e.g. Simulator, Realtime, RealtimeRS9W</summary>
    public string Brand { get; set; } = "";

    public string Model { get; set; } = "";

    public string? LocationLabel { get; set; }

    /// <summary>STUDENT | STAFF | BOTH | ACCESS_ONLY</summary>
    public string Purpose { get; set; } = "BOTH";

    public string? SerialNumber { get; set; }

    public string? MachineNumber { get; set; }

    public string? NetworkAddress { get; set; }

    public int? Port { get; set; }

    public string? ConnectionPassword { get; set; }

    public bool SyncEnabled { get; set; } = true;

    public bool IsSimulatorBrand()
    {
        var brand = Brand.Trim();
        return brand.Equals("Simulator", StringComparison.OrdinalIgnoreCase)
               || brand.Equals("Sim", StringComparison.OrdinalIgnoreCase);
    }

    public bool IsRealtimeBrand()
    {
        var brand = Brand.Trim();
        return brand.Equals("Realtime", StringComparison.OrdinalIgnoreCase)
               || brand.Equals("RealtimeRS9W", StringComparison.OrdinalIgnoreCase)
               || brand.Equals("RS9W", StringComparison.OrdinalIgnoreCase);
    }

    public DeviceInfo ToDeviceInfo()
    {
        var purpose = Purpose.Trim().ToUpperInvariant() switch
        {
            "STUDENT" => Abstractions.DevicePurpose.Student,
            "STAFF" => Abstractions.DevicePurpose.Staff,
            "ACCESS_ONLY" => Abstractions.DevicePurpose.AccessOnly,
            _ => Abstractions.DevicePurpose.Both,
        };

        return new Abstractions.DeviceInfo
        {
            LocalDeviceId = LocalDeviceId.Trim(),
            Name = string.IsNullOrWhiteSpace(Name) ? LocalDeviceId : Name.Trim(),
            Brand = Brand.Trim(),
            Model = string.IsNullOrWhiteSpace(Model) ? Brand : Model.Trim(),
            LocationLabel = LocationLabel,
            Purpose = purpose,
            SerialNumber = SerialNumber,
            MachineNumber = MachineNumber,
            NetworkAddress = NetworkAddress,
            Port = Port,
            ConnectionPassword = ConnectionPassword,
            SyncEnabled = SyncEnabled,
        };
    }
}

public static class ConnectorConfigLoader
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true,
        WriteIndented = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public static ConnectorConfig? TryLoadLocalOverlay()
    {
        ConnectorConfig.EnsureDirectories();
        if (!File.Exists(ConnectorConfig.LocalConfigPath))
        {
            return null;
        }

        var json = File.ReadAllText(ConnectorConfig.LocalConfigPath);
        var overlay = JsonSerializer.Deserialize<LocalConfigFile>(json, JsonOptions);
        if (overlay is null)
        {
            return null;
        }

        return overlay.ToConnectorConfig();
    }

    public static void SaveLocalOverlay(ConnectorConfig config)
    {
        ConnectorConfig.EnsureDirectories();
        var file = LocalConfigFile.FromConnectorConfig(config);
        var json = JsonSerializer.Serialize(file, JsonOptions);
        File.WriteAllText(ConnectorConfig.LocalConfigPath, json);
    }

    public static void MergeOverlay(ConnectorConfig target, ConnectorConfig overlay)
    {
        if (!string.IsNullOrWhiteSpace(overlay.ApiBaseUrl))
        {
            target.ApiBaseUrl = overlay.ApiBaseUrl;
        }

        if (!string.IsNullOrWhiteSpace(overlay.ConnectorName))
        {
            target.ConnectorName = overlay.ConnectorName;
        }

        if (!string.IsNullOrWhiteSpace(overlay.ConnectorVersion))
        {
            target.ConnectorVersion = overlay.ConnectorVersion;
        }

        if (overlay.HeartbeatIntervalSeconds > 0)
        {
            target.HeartbeatIntervalSeconds = overlay.HeartbeatIntervalSeconds;
        }

        if (overlay.PollIntervalSeconds > 0)
        {
            target.PollIntervalSeconds = overlay.PollIntervalSeconds;
        }

        if (overlay.CommandPollIntervalSeconds > 0)
        {
            target.CommandPollIntervalSeconds = overlay.CommandPollIntervalSeconds;
        }

        if (overlay.BatchSize > 0)
        {
            target.BatchSize = overlay.BatchSize;
        }

        if (overlay.MaxUploadAttempts > 0)
        {
            target.MaxUploadAttempts = overlay.MaxUploadAttempts;
        }

        if (overlay.InitialBackoffSeconds > 0)
        {
            target.InitialBackoffSeconds = overlay.InitialBackoffSeconds;
        }

        if (overlay.MaxBackoffSeconds > 0)
        {
            target.MaxBackoffSeconds = overlay.MaxBackoffSeconds;
        }

        if (overlay.Devices is { Count: > 0 })
        {
            target.Devices = overlay.Devices;
        }
    }

    /// <summary>
    /// Applies AllowSimulator only when the ProgramData config file explicitly set the property.
    /// </summary>
    public static void MergeAllowSimulatorIfPresent(ConnectorConfig target, string? localConfigJson)
    {
        if (string.IsNullOrWhiteSpace(localConfigJson))
        {
            return;
        }

        using var doc = JsonDocument.Parse(localConfigJson);
        if (doc.RootElement.TryGetProperty("AllowSimulator", out var prop) ||
            doc.RootElement.TryGetProperty("allowSimulator", out prop))
        {
            if (prop.ValueKind is JsonValueKind.True or JsonValueKind.False)
            {
                target.AllowSimulator = prop.GetBoolean();
            }
        }
    }

    private sealed class LocalConfigFile
    {
        public string? ApiBaseUrl { get; set; }
        public string? ConnectorVersion { get; set; }
        public string? ConnectorName { get; set; }
        public int? HeartbeatIntervalSeconds { get; set; }
        public int? PollIntervalSeconds { get; set; }
        public int? CommandPollIntervalSeconds { get; set; }
        public int? BatchSize { get; set; }
        public int? MaxUploadAttempts { get; set; }
        public int? InitialBackoffSeconds { get; set; }
        public int? MaxBackoffSeconds { get; set; }
        public bool? AllowSimulator { get; set; }
        public List<DeviceConfigEntry>? Devices { get; set; }

        public ConnectorConfig ToConnectorConfig()
        {
            var cfg = new ConnectorConfig();
            if (!string.IsNullOrWhiteSpace(ApiBaseUrl)) cfg.ApiBaseUrl = ApiBaseUrl;
            if (!string.IsNullOrWhiteSpace(ConnectorVersion)) cfg.ConnectorVersion = ConnectorVersion!;
            if (!string.IsNullOrWhiteSpace(ConnectorName)) cfg.ConnectorName = ConnectorName;
            if (HeartbeatIntervalSeconds is > 0) cfg.HeartbeatIntervalSeconds = HeartbeatIntervalSeconds.Value;
            if (PollIntervalSeconds is > 0) cfg.PollIntervalSeconds = PollIntervalSeconds.Value;
            if (CommandPollIntervalSeconds is > 0) cfg.CommandPollIntervalSeconds = CommandPollIntervalSeconds.Value;
            if (BatchSize is > 0) cfg.BatchSize = BatchSize.Value;
            if (MaxUploadAttempts is > 0) cfg.MaxUploadAttempts = MaxUploadAttempts.Value;
            if (InitialBackoffSeconds is > 0) cfg.InitialBackoffSeconds = InitialBackoffSeconds.Value;
            if (MaxBackoffSeconds is > 0) cfg.MaxBackoffSeconds = MaxBackoffSeconds.Value;
            if (AllowSimulator.HasValue) cfg.AllowSimulator = AllowSimulator.Value;
            if (Devices is { Count: > 0 }) cfg.Devices = Devices;
            return cfg;
        }

        public static LocalConfigFile FromConnectorConfig(ConnectorConfig config) => new()
        {
            ApiBaseUrl = config.ApiBaseUrl,
            ConnectorVersion = config.ConnectorVersion,
            ConnectorName = config.ConnectorName,
            HeartbeatIntervalSeconds = config.HeartbeatIntervalSeconds,
            PollIntervalSeconds = config.PollIntervalSeconds,
            CommandPollIntervalSeconds = config.CommandPollIntervalSeconds,
            BatchSize = config.BatchSize,
            MaxUploadAttempts = config.MaxUploadAttempts,
            InitialBackoffSeconds = config.InitialBackoffSeconds,
            MaxBackoffSeconds = config.MaxBackoffSeconds,
            AllowSimulator = config.AllowSimulator,
            Devices = config.Devices,
        };
    }
}
