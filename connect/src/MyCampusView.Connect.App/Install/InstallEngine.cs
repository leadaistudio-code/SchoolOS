using System.Diagnostics;
using System.ServiceProcess;
using MyCampusView.Connect.Core.Config;

namespace MyCampusView.Connect.App.Install;

sealed record InstallResult(bool ServiceRunning, string? CloudProblem, bool Listening, string? ServiceProblem);

/// <summary>
/// Copies this exe into Program Files and wires it up as the service. Pairing
/// has already happened (the wizard does it first so a bad code fails fast).
/// </summary>
static class InstallEngine
{
    public static InstallResult Install(Settings settings, bool desktopShortcut, Action<string> step)
    {
        SetupLog.Write($"Installing {AppInfo.Name} {AppInfo.Version} from {AppInfo.CurrentExe}.");
        ConnectorConfig.EnsureDirectories();

        step("Stopping the previous version");
        SystemOps.StopService();

        if (settings.HasPushDevices && SystemOps.PortInUse(settings.Port))
        {
            throw new InvalidOperationException(
                $"Port {settings.Port} is already used by another program on this PC. Pick a different port on the Devices step.");
        }

        step("Copying program files");
        Directory.CreateDirectory(AppInfo.InstallDir);
        Directory.CreateDirectory(AppInfo.RuntimeDir);
        if (!AppInfo.RunningInstalled)
        {
            CopyWithRetry(AppInfo.CurrentExe, AppInfo.InstalledExe);
        }
        File.WriteAllText(Path.Combine(AppInfo.InstallDir, "appsettings.json"), AppSettingsJson);

        step("Saving settings");
        settings.Save();

        step("Allowing terminals through Windows Firewall");
        if (settings.HasPushDevices) SystemOps.OpenFirewall(settings.Port);
        else SystemOps.CloseFirewall();

        step("Registering the Windows service");
        SystemOps.RegisterService();
        SystemOps.RegisterUninstall();
        SystemOps.CreateShortcuts(desktopShortcut);

        step("Starting the service");
        return StartAndVerify(settings, step);
    }

    /// <summary>Start (or restart) the service and check it is really working.</summary>
    public static InstallResult StartAndVerify(Settings settings, Action<string> step)
    {
        string? serviceProblem = null;
        try
        {
            SystemOps.StartService(TimeSpan.FromSeconds(40));
        }
        catch (Exception e)
        {
            serviceProblem = e.Message;
        }

        // A bad config makes the host exit a few seconds after "Running".
        Thread.Sleep(TimeSpan.FromSeconds(6));
        var running = SystemOps.ServiceStatus() == ServiceControllerStatus.Running;
        if (!running)
        {
            serviceProblem ??= LastServiceError() ?? "The service stopped right after starting.";
        }

        step("Checking the connection to MyCampusView");
        var creds = Connection.Current();
        var cloudProblem = creds is null
            ? "This PC is not paired with MyCampusView."
            : Connection.VerifyAsync(creds, settings.Devices.Count, CancellationToken.None).GetAwaiter().GetResult();

        var listening = false;
        if (running && settings.HasPushDevices)
        {
            step($"Checking that terminals can reach port {settings.Port}");
            for (var i = 0; i < 5 && !listening; i++)
            {
                listening = SystemOps.CanConnectLocal(settings.Port);
                if (!listening) Thread.Sleep(1000);
            }
        }

        SetupLog.Write($"Verify: running={running} listening={listening} cloud={cloudProblem ?? "ok"} service={serviceProblem ?? "ok"}");
        return new InstallResult(running, cloudProblem, listening, serviceProblem);
    }

    public static void Uninstall(bool removeData)
    {
        SetupLog.Write($"Uninstalling (removeData={removeData}).");
        SystemOps.DeleteService();
        SystemOps.CloseFirewall();
        SystemOps.RemoveShortcuts();
        SystemOps.UnregisterUninstall();

        if (removeData)
        {
            try { Directory.Delete(AppInfo.DataDir, true); } catch { }
        }

        if (AppInfo.RunningInstalled)
        {
            // The running exe cannot delete itself; a short-lived cmd does it once we exit.
            Process.Start(new ProcessStartInfo("cmd.exe",
                $"/c ping -n 4 127.0.0.1 >nul & rmdir /s /q \"{AppInfo.InstallDir}\"")
            {
                CreateNoWindow = true,
                UseShellExecute = false,
                WindowStyle = ProcessWindowStyle.Hidden,
            });
        }
        else
        {
            try { Directory.Delete(AppInfo.InstallDir, true); } catch { }
        }
    }

    /// <summary>The most recent error line from today's service log, if any.</summary>
    public static string? LastServiceError()
    {
        var line = RecentServiceLog(80).LastOrDefault(l =>
            l.Contains("fail", StringComparison.OrdinalIgnoreCase) ||
            l.Contains("error", StringComparison.OrdinalIgnoreCase) ||
            l.Contains("exception", StringComparison.OrdinalIgnoreCase));
        return line?.Trim();
    }

    public static IReadOnlyList<string> RecentServiceLog(int lines)
    {
        try
        {
            var latest = new DirectoryInfo(ConnectorConfig.LogsDirectory)
                .GetFiles("connect-*.log")
                .OrderByDescending(f => f.LastWriteTimeUtc)
                .FirstOrDefault();
            if (latest is null) return Array.Empty<string>();
            using var fs = new FileStream(latest.FullName, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
            using var reader = new StreamReader(fs);
            var all = reader.ReadToEnd().Split('\n', StringSplitOptions.RemoveEmptyEntries);
            return all.Skip(Math.Max(0, all.Length - lines)).ToList();
        }
        catch
        {
            return Array.Empty<string>();
        }
    }

    static void CopyWithRetry(string from, string to)
    {
        for (var i = 0; ; i++)
        {
            try
            {
                File.Copy(from, to, true);
                return;
            }
            catch (IOException) when (i < 40)
            {
                Thread.Sleep(250);
            }
        }
    }

    const string AppSettingsJson = """
        {
          "Logging": {
            "LogLevel": {
              "Default": "Information",
              "Microsoft.Hosting.Lifetime": "Information",
              "System.Net.Http": "Warning"
            }
          }
        }
        """;
}
