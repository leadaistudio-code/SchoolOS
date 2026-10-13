using System;
using System.Drawing;
using System.IO;
using System.Reflection;

namespace MyCampusView.CctvRelay
{
    static class AppInfo
    {
        public const string Name = "MyCampusView CCTV Relay";
        public const string ExeName = "MyCampusView-CCTV-Relay.exe";
        public const string Publisher = "MyCampusView";
        public const string DefaultServer = "https://app.mycampusview.com";
        public const string MediaMtxVersion = "v1.21.1";
        public const int RelayPort = 8888;

        public static string Version
        {
            get
            {
                var v = Assembly.GetExecutingAssembly().GetName().Version;
                return v.Major + "." + v.Minor + "." + v.Build;
            }
        }

        static string LocalAppData => Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);

        /// <summary>Where the exe lives once installed. Per-user, so no administrator rights are needed.</summary>
        public static string InstallDir => Path.Combine(LocalAppData, "Programs", Name);
        public static string InstalledExe => Path.Combine(InstallDir, ExeName);

        /// <summary>Settings, logs and the unpacked MediaMTX.</summary>
        public static string DataDir => Path.Combine(LocalAppData, "MyCampusView", "CCTV Relay");
        public static string SettingsFile => Path.Combine(DataDir, "settings.json");
        public static string LogDir => Path.Combine(DataDir, "logs");
        public static string MediaMtxDir => Path.Combine(DataDir, "mediamtx");
        public static string MediaMtxExe => Path.Combine(MediaMtxDir, "mediamtx.exe");
        public static string MediaMtxConfig => Path.Combine(MediaMtxDir, "mediamtx.yml");

        public static Stream Resource(string name) => Assembly.GetExecutingAssembly().GetManifestResourceStream(name);

        static Icon _icon;
        public static Icon AppIcon => _icon ?? (_icon = new Icon(Resource("app.ico")));

        public static Icon SizedIcon(int size)
        {
            using (var s = Resource("app.ico")) return new Icon(s, size, size);
        }

        static Image _logo;
        public static Image Logo => _logo ?? (_logo = Image.FromStream(Resource("logo.png")));
    }
}
