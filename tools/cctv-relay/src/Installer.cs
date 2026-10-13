using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using Microsoft.Win32;

namespace MyCampusView.CctvRelay
{
    /// <summary>
    /// Per-user install: no administrator rights, nothing outside the user's
    /// profile. Registers in Apps &amp; features so it can be removed the
    /// normal Windows way.
    /// </summary>
    static class Installer
    {
        const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
        const string UninstallKey = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\MyCampusViewCctvRelay";
        const string RunValue = "MyCampusView CCTV Relay";

        public static string CurrentExe => Process.GetCurrentProcess().MainModule.FileName;

        public static bool RunningInstalled =>
            string.Equals(Path.GetFullPath(CurrentExe), Path.GetFullPath(AppInfo.InstalledExe), StringComparison.OrdinalIgnoreCase);

        public static bool IsInstalled => File.Exists(AppInfo.InstalledExe);

        static string StartMenuShortcut => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), AppInfo.Name + ".lnk");
        static string DesktopShortcut => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), AppInfo.Name + ".lnk");

        public static void Install(bool desktopShortcut)
        {
            Directory.CreateDirectory(AppInfo.InstallDir);
            CopyWithRetry(CurrentExe, AppInfo.InstalledExe);

            CreateShortcut(StartMenuShortcut, AppInfo.InstalledExe, "Passes your CCTV cameras on to MyCampusView");
            if (desktopShortcut) CreateShortcut(DesktopShortcut, AppInfo.InstalledExe, "Passes your CCTV cameras on to MyCampusView");

            using (var k = Registry.CurrentUser.CreateSubKey(UninstallKey))
            {
                k.SetValue("DisplayName", AppInfo.Name);
                k.SetValue("DisplayVersion", AppInfo.Version);
                k.SetValue("Publisher", AppInfo.Publisher);
                k.SetValue("DisplayIcon", AppInfo.InstalledExe + ",0");
                k.SetValue("InstallLocation", AppInfo.InstallDir);
                k.SetValue("UninstallString", "\"" + AppInfo.InstalledExe + "\" --uninstall");
                k.SetValue("URLInfoAbout", "https://mycampusview.com");
                k.SetValue("NoModify", 1, RegistryValueKind.DWord);
                k.SetValue("NoRepair", 1, RegistryValueKind.DWord);
                k.SetValue("EstimatedSize", (int)(new FileInfo(AppInfo.InstalledExe).Length / 1024) + 60 * 1024, RegistryValueKind.DWord);
                k.SetValue("InstallDate", DateTime.Now.ToString("yyyyMMdd"));
            }
            Log.Info("Installed " + AppInfo.Name + " " + AppInfo.Version + ".");
        }

        static void CopyWithRetry(string from, string to)
        {
            for (var i = 0; ; i++)
            {
                try { File.Copy(from, to, true); return; }
                catch (IOException) when (i < 20) { Thread.Sleep(250); }
            }
        }

        public static void SetStartWithWindows(bool on)
        {
            using (var k = Registry.CurrentUser.CreateSubKey(RunKey))
            {
                if (on) k.SetValue(RunValue, "\"" + AppInfo.InstalledExe + "\" --minimized");
                else if (k.GetValue(RunValue) != null) k.DeleteValue(RunValue);
            }
        }

        public static void Uninstall(bool removeSettings)
        {
            try { SetStartWithWindows(false); } catch { }
            try { Registry.CurrentUser.DeleteSubKeyTree(UninstallKey, false); } catch { }
            foreach (var lnk in new[] { StartMenuShortcut, DesktopShortcut })
                try { if (File.Exists(lnk)) File.Delete(lnk); } catch { }

            var dataDir = AppInfo.DataDir;
            if (removeSettings)
            {
                try { Directory.Delete(dataDir, true); } catch { }
            }
            else
            {
                try { Directory.Delete(AppInfo.MediaMtxDir, true); } catch { }
            }

            // The running exe cannot delete itself; a short-lived cmd does it once we exit.
            var cmd = "/c ping -n 3 127.0.0.1 >nul & rmdir /s /q \"" + AppInfo.InstallDir + "\"";
            Process.Start(new ProcessStartInfo("cmd.exe", cmd) { CreateNoWindow = true, UseShellExecute = false, WindowStyle = ProcessWindowStyle.Hidden });
        }

        static void CreateShortcut(string lnkPath, string target, string description)
        {
            try
            {
                var shellType = Type.GetTypeFromProgID("WScript.Shell");
                dynamic shell = Activator.CreateInstance(shellType);
                dynamic lnk = shell.CreateShortcut(lnkPath);
                lnk.TargetPath = target;
                lnk.WorkingDirectory = Path.GetDirectoryName(target);
                lnk.Description = description;
                lnk.IconLocation = target + ",0";
                lnk.Save();
            }
            catch (Exception e)
            {
                Log.Warn("Could not create shortcut " + lnkPath + ": " + e.Message);
            }
        }
    }
}
