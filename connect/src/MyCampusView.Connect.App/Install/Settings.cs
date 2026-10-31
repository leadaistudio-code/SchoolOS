using System.Text.RegularExpressions;
using MyCampusView.Connect.Core.Config;

namespace MyCampusView.Connect.App.Install;

/// <summary>The parts of ProgramData\...\config.json this app edits; everything else is preserved.</summary>
sealed class Settings
{
    public string Server { get; set; } = AppInfo.DefaultServer;
    public string ConnectorName { get; set; } = Environment.MachineName;
    public int Port { get; set; } = AppInfo.DefaultPort;
    public List<DeviceConfigEntry> Devices { get; set; } = new();

    public bool HasPushDevices => Devices.Any(d => d.SyncEnabled && d.IsRealtimeBrand() && d.IsFkWebPush());

    public static Settings Load()
    {
        var s = new Settings();
        ConnectorConfig? cfg = null;
        try { cfg = ConnectorConfigLoader.TryLoadLocalOverlay(); }
        catch (Exception e) { SetupLog.Write($"Could not read config.json: {e.Message}"); }

        var creds = Connection.Current();
        if (!string.IsNullOrWhiteSpace(cfg?.ApiBaseUrl)) s.Server = cfg!.ApiBaseUrl;
        else if (!string.IsNullOrWhiteSpace(creds?.ApiBaseUrl)) s.Server = creds!.ApiBaseUrl;
        if (!string.IsNullOrWhiteSpace(cfg?.ConnectorName)) s.ConnectorName = cfg!.ConnectorName!;
        else if (!string.IsNullOrWhiteSpace(creds?.ConnectorName)) s.ConnectorName = creds!.ConnectorName!;
        if (cfg is not null)
        {
            s.Port = PortOf(cfg.FkWebListenPrefix) ?? AppInfo.DefaultPort;
            s.Devices = cfg.Devices.Select(Clone).ToList();
        }
        return s;
    }

    public void Save()
    {
        var cfg = ConnectorConfigLoader.TryLoadLocalOverlay() ?? new ConnectorConfig();
        cfg.ApiBaseUrl = Server;
        cfg.ConnectorName = ConnectorName;
        cfg.ConnectorVersion = AppInfo.Version;
        cfg.FkWebListenPrefix = $"http://+:{Port}/";
        cfg.AllowSimulator = false;
        cfg.Devices = Devices;
        ConnectorConfigLoader.SaveLocalOverlay(cfg);
        SetupLog.Write($"Saved settings: server {Server}, port {Port}, {Devices.Count} device(s).");
    }

    static int? PortOf(string? prefix)
    {
        var m = Regex.Match(prefix ?? "", @":(\d+)/?$");
        return m.Success && int.TryParse(m.Groups[1].Value, out var p) ? p : null;
    }

    public static DeviceConfigEntry Clone(DeviceConfigEntry d) => new()
    {
        LocalDeviceId = d.LocalDeviceId,
        Name = d.Name,
        Brand = d.Brand,
        Model = d.Model,
        LocationLabel = d.LocationLabel,
        Purpose = d.Purpose,
        SerialNumber = d.SerialNumber,
        MachineNumber = d.MachineNumber,
        NetworkAddress = d.NetworkAddress,
        Port = d.Port,
        ConnectionPassword = d.ConnectionPassword,
        ConnectionMode = d.ConnectionMode,
        PushDeviceId = d.PushDeviceId,
        SyncEnabled = d.SyncEnabled,
    };
}
