using System.Reflection;
using MyCampusView.Connect.Core.Config;

namespace MyCampusView.Connect.App;

static class AppInfo
{
    public const string Name = "MyCampusView Connect";
    public const string Publisher = "MyCampusView";
    public const string ServiceName = "MyCampusViewConnect";
    public const string FirewallRule = "MyCampusView Connect FKWeb";
    public const string DefaultServer = "https://app.mycampusview.com";
    public const int DefaultPort = 8080;

    public static string Version { get; } =
        Assembly.GetExecutingAssembly().GetName().Version is { } v ? $"{v.Major}.{v.Minor}.{v.Build}" : "1.0.0";

    public static string InstallDir { get; } = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "MyCampusView", "Connect");

    public static string InstalledExe => Path.Combine(InstallDir, "MyCampusViewConnect.exe");

    public static string DataDir => ConnectorConfig.ProgramDataRoot;

    /// <summary>Where the single-file bundle unpacks its native SQLite library when run as a service.</summary>
    public static string RuntimeDir => Path.Combine(DataDir, "runtime");

    public static string CurrentExe => Environment.ProcessPath ?? Application.ExecutablePath;

    public static bool RunningInstalled => string.Equals(
        Path.GetFullPath(CurrentExe), Path.GetFullPath(InstalledExe), StringComparison.OrdinalIgnoreCase);

    static Image? logo;
    public static Image Logo => logo ??= LoadLogo();

    static Image LoadLogo()
    {
        using var s = Assembly.GetExecutingAssembly().GetManifestResourceStream("logo.png");
        return s is null ? new Bitmap(1, 1) : Image.FromStream(s);
    }

    public static Icon? AppIcon
    {
        get
        {
            try { return Icon.ExtractAssociatedIcon(CurrentExe); }
            catch { return null; }
        }
    }
}
