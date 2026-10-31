using System.Diagnostics;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.ServiceProcess;
using Microsoft.Win32;

namespace MyCampusView.Connect.App.Install;

/// <summary>The Windows plumbing: service, firewall, Apps &amp; features entry, shortcuts.</summary>
static class SystemOps
{
    const string UninstallKey = @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\MyCampusViewConnect";

    static string StartMenuShortcut => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.CommonPrograms), AppInfo.Name + ".lnk");

    static string DesktopShortcut => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.CommonDesktopDirectory), AppInfo.Name + ".lnk");

    public static (int ExitCode, string Output) Run(string file, params string[] args)
    {
        var psi = new ProcessStartInfo(file)
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        foreach (var a in args) psi.ArgumentList.Add(a);
        using var p = Process.Start(psi)!;
        var output = p.StandardOutput.ReadToEnd() + p.StandardError.ReadToEnd();
        p.WaitForExit(60_000);
        return (p.ExitCode, output.Trim());
    }

    /* ------------------------------------------------------------ service */

    public static ServiceControllerStatus? ServiceStatus()
    {
        try
        {
            using var sc = new ServiceController(AppInfo.ServiceName);
            return sc.Status;
        }
        catch (InvalidOperationException)
        {
            return null;
        }
    }

    public static void StopService()
    {
        try
        {
            using var sc = new ServiceController(AppInfo.ServiceName);
            if (sc.Status is not (ServiceControllerStatus.Stopped or ServiceControllerStatus.StopPending))
            {
                sc.Stop();
            }
            sc.WaitForStatus(ServiceControllerStatus.Stopped, TimeSpan.FromSeconds(30));
        }
        catch (InvalidOperationException)
        {
            // Not installed.
        }
        catch (System.ServiceProcess.TimeoutException)
        {
            SetupLog.Write("Service did not stop in 30s; ending the process.");
        }

        // A hung or crashed instance can still hold the exe open.
        foreach (var p in Process.GetProcessesByName(Path.GetFileNameWithoutExtension(AppInfo.InstalledExe)))
        {
            try
            {
                if (p.Id != Environment.ProcessId &&
                    string.Equals(p.MainModule?.FileName, AppInfo.InstalledExe, StringComparison.OrdinalIgnoreCase) &&
                    !string.Equals(AppInfo.CurrentExe, AppInfo.InstalledExe, StringComparison.OrdinalIgnoreCase))
                {
                    p.Kill();
                    p.WaitForExit(10_000);
                }
            }
            catch
            {
                // Access denied for other users' processes is fine.
            }
        }
    }

    public static void StartService(TimeSpan wait)
    {
        using var sc = new ServiceController(AppInfo.ServiceName);
        if (sc.Status != ServiceControllerStatus.Running)
        {
            if (sc.Status != ServiceControllerStatus.StartPending) sc.Start();
            sc.WaitForStatus(ServiceControllerStatus.Running, wait);
        }
    }

    public static void RestartService()
    {
        StopService();
        StartService(TimeSpan.FromSeconds(30));
    }

    public static void RegisterService()
    {
        var binPath = $"\"{AppInfo.InstalledExe}\" service";
        if (ServiceStatus() is null)
        {
            var (code, output) = Run("sc.exe", "create", AppInfo.ServiceName,
                "binPath=", binPath, "start=", "auto", "DisplayName=", AppInfo.Name);
            if (code != 0) throw new InvalidOperationException($"Could not create the Windows service: {output}");
        }
        else
        {
            var (code, output) = Run("sc.exe", "config", AppInfo.ServiceName,
                "binPath=", binPath, "start=", "auto", "DisplayName=", AppInfo.Name);
            if (code != 0) throw new InvalidOperationException($"Could not update the Windows service: {output}");
        }

        Run("sc.exe", "description", AppInfo.ServiceName,
            "Sends biometric attendance punches from school terminals to MyCampusView.");
        // Restart on crash: 10 s, 30 s, then every minute; the failure count resets daily.
        Run("sc.exe", "failure", AppInfo.ServiceName, "reset=", "86400",
            "actions=", "restart/10000/restart/30000/restart/60000");

        using var key = Registry.LocalMachine.OpenSubKey(
            $@"SYSTEM\CurrentControlSet\Services\{AppInfo.ServiceName}", writable: true)
            ?? throw new InvalidOperationException("The service registry key is missing.");
        key.SetValue("Environment", new[]
        {
            "DOTNET_ENVIRONMENT=Production",
            $"DOTNET_BUNDLE_EXTRACT_BASE_DIR={AppInfo.RuntimeDir}",
        }, RegistryValueKind.MultiString);
    }

    public static void DeleteService()
    {
        if (ServiceStatus() is null) return;
        StopService();
        Run("sc.exe", "delete", AppInfo.ServiceName);
    }

    /* ----------------------------------------------------------- firewall */

    public static void OpenFirewall(int port)
    {
        CloseFirewall();
        var (code, output) = Run("netsh", "advfirewall", "firewall", "add", "rule",
            $"name={AppInfo.FirewallRule}", "dir=in", "action=allow", "protocol=TCP",
            $"localport={port}", "remoteip=localsubnet", "profile=any");
        if (code != 0) throw new InvalidOperationException($"Could not open port {port} in Windows Firewall: {output}");
    }

    public static void CloseFirewall() =>
        Run("netsh", "advfirewall", "firewall", "delete", "rule", $"name={AppInfo.FirewallRule}");

    /* -------------------------------------------------------- registration */

    public static void RegisterUninstall()
    {
        using var k = Registry.LocalMachine.CreateSubKey(UninstallKey);
        k.SetValue("DisplayName", AppInfo.Name);
        k.SetValue("DisplayVersion", AppInfo.Version);
        k.SetValue("Publisher", AppInfo.Publisher);
        k.SetValue("DisplayIcon", AppInfo.InstalledExe + ",0");
        k.SetValue("InstallLocation", AppInfo.InstallDir);
        k.SetValue("UninstallString", $"\"{AppInfo.InstalledExe}\" --uninstall");
        k.SetValue("QuietUninstallString", $"\"{AppInfo.InstalledExe}\" --uninstall --quiet");
        k.SetValue("ModifyPath", $"\"{AppInfo.InstalledExe}\"");
        k.SetValue("URLInfoAbout", "https://mycampusview.com");
        k.SetValue("NoRepair", 1, RegistryValueKind.DWord);
        k.SetValue("EstimatedSize", (int)(new FileInfo(AppInfo.InstalledExe).Length / 1024), RegistryValueKind.DWord);
        k.SetValue("InstallDate", DateTime.Now.ToString("yyyyMMdd"));
    }

    public static void UnregisterUninstall()
    {
        try { Registry.LocalMachine.DeleteSubKeyTree(UninstallKey, false); } catch { }
    }

    public static bool IsRegistered()
    {
        using var k = Registry.LocalMachine.OpenSubKey(UninstallKey);
        return k is not null && File.Exists(AppInfo.InstalledExe);
    }

    public static void CreateShortcuts(bool desktop)
    {
        CreateShortcut(StartMenuShortcut);
        if (desktop) CreateShortcut(DesktopShortcut);
    }

    public static void RemoveShortcuts()
    {
        foreach (var lnk in new[] { StartMenuShortcut, DesktopShortcut })
        {
            try { if (File.Exists(lnk)) File.Delete(lnk); } catch { }
        }
    }

    static void CreateShortcut(string path)
    {
        try
        {
            var shellType = Type.GetTypeFromProgID("WScript.Shell")!;
            dynamic shell = Activator.CreateInstance(shellType)!;
            dynamic lnk = shell.CreateShortcut(path);
            lnk.TargetPath = AppInfo.InstalledExe;
            lnk.WorkingDirectory = AppInfo.InstallDir;
            lnk.Description = "Check and manage biometric attendance for MyCampusView";
            lnk.IconLocation = AppInfo.InstalledExe + ",0";
            lnk.Save();
        }
        catch (Exception e)
        {
            SetupLog.Write($"Could not create shortcut {path}: {e.Message}");
        }
    }

    /* ------------------------------------------------------------ network */

    /// <summary>IPv4 addresses a terminal on the school LAN could reach this PC at.</summary>
    public static List<string> LanAddresses()
    {
        var result = new List<(string Ip, bool HasGateway)>();
        foreach (var nic in NetworkInterface.GetAllNetworkInterfaces())
        {
            if (nic.OperationalStatus != OperationalStatus.Up ||
                nic.NetworkInterfaceType is NetworkInterfaceType.Loopback or NetworkInterfaceType.Tunnel)
            {
                continue;
            }

            var props = nic.GetIPProperties();
            var hasGateway = props.GatewayAddresses.Any(g =>
                g.Address.AddressFamily == AddressFamily.InterNetwork && !g.Address.Equals(IPAddress.Any));
            foreach (var u in props.UnicastAddresses)
            {
                if (u.Address.AddressFamily != AddressFamily.InterNetwork) continue;
                var ip = u.Address.ToString();
                if (ip.StartsWith("169.254.")) continue;
                result.Add((ip, hasGateway));
            }
        }

        return result.OrderByDescending(r => r.HasGateway).Select(r => r.Ip).Distinct().ToList();
    }

    public static bool PortInUse(int port) =>
        IPGlobalProperties.GetIPGlobalProperties().GetActiveTcpListeners().Any(ep => ep.Port == port);

    public static bool CanConnectLocal(int port)
    {
        try
        {
            using var client = new TcpClient();
            return client.ConnectAsync(IPAddress.Loopback, port).Wait(TimeSpan.FromSeconds(3)) && client.Connected;
        }
        catch
        {
            return false;
        }
    }

    public static void OpenUrl(string url)
    {
        try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); } catch { }
    }
}
