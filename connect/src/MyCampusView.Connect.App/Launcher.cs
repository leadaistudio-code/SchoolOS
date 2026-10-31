using MyCampusView.Connect.App.Install;
using MyCampusView.Connect.App.Ui;

namespace MyCampusView.Connect.App;

/// <summary>
/// One exe, five roles:
///   MyCampusViewConnect.exe service                     the Windows service (worker)
///   MyCampusViewConnect.exe                             setup wizard, or the manager once installed
///   MyCampusViewConnect.exe --manage                    the manager
///   MyCampusViewConnect.exe --uninstall [--quiet]       remove (Apps &amp; features calls this)
///   MyCampusViewConnect.exe --silent --code=MCV-…       unattended install for IT teams
///                           [--server=URL] [--name=PC] [--port=8080] [--no-desktop-shortcut]
/// </summary>
static class Launcher
{
    [STAThread]
    static int Main(string[] args)
    {
        if (args.Length > 0 && args[0].Equals("service", StringComparison.OrdinalIgnoreCase))
        {
            MyCampusView.Connect.Program.Main(args.Skip(1).ToArray()).GetAwaiter().GetResult();
            return 0;
        }

        bool Has(string flag) => args.Any(a => a.Equals(flag, StringComparison.OrdinalIgnoreCase));
        string? Value(string name) => args
            .Where(a => a.StartsWith(name + "=", StringComparison.OrdinalIgnoreCase))
            .Select(a => a[(name.Length + 1)..].Trim('"'))
            .FirstOrDefault();

        if (Has("--silent")) return SilentInstall(Value("--code"), Value("--server"), Value("--name"), Value("--port"), !Has("--no-desktop-shortcut"));

        if (Has("--uninstall") && Has("--quiet"))
        {
            InstallEngine.Uninstall(removeData: Has("--remove-data"));
            return 0;
        }

        using var single = new Mutex(true, @"Global\MyCampusViewConnectUi", out var first);
        if (!first)
        {
            MessageBox.Show("MyCampusView Connect is already open.", AppInfo.Name, MessageBoxButtons.OK, MessageBoxIcon.Information);
            return 0;
        }

        ApplicationConfiguration.Initialize();
        Application.ThreadException += (_, e) => Fatal(e.Exception);
        AppDomain.CurrentDomain.UnhandledException += (_, e) => Fatal(e.ExceptionObject as Exception);

        if (Has("--uninstall"))
        {
            ConfirmAndUninstall(null);
            return 0;
        }

        Form form = SystemOps.IsRegistered() && (AppInfo.RunningInstalled || Has("--manage"))
            ? new ManagerForm()
            : new SetupWizard();
        Application.Run(form);
        return 0;
    }

    public static bool ConfirmAndUninstall(IWin32Window? owner)
    {
        var page = new TaskDialogPage
        {
            Caption = AppInfo.Name,
            Heading = "Uninstall MyCampusView Connect?",
            Text = "Attendance punches from your terminals will stop reaching MyCampusView until it is installed again. " +
                   "To stop this PC's access completely, also revoke it in MyCampusView under Settings → Biometric attendance → Connectors.",
            Icon = TaskDialogIcon.Warning,
            Verification = new TaskDialogVerificationCheckBox("Also delete saved settings and any punches not yet sent"),
            Buttons = { TaskDialogButton.Yes, TaskDialogButton.No },
            DefaultButton = TaskDialogButton.No,
        };
        var answer = owner is null ? TaskDialog.ShowDialog(page) : TaskDialog.ShowDialog(owner, page);
        if (answer != TaskDialogButton.Yes) return false;

        try
        {
            InstallEngine.Uninstall(page.Verification.Checked);
            MessageBox.Show("MyCampusView Connect has been removed.", AppInfo.Name, MessageBoxButtons.OK, MessageBoxIcon.Information);
            return true;
        }
        catch (Exception e)
        {
            SetupLog.Write($"Uninstall failed: {e}");
            MessageBox.Show($"Uninstall did not finish: {e.Message}", AppInfo.Name, MessageBoxButtons.OK, MessageBoxIcon.Error);
            return false;
        }
    }

    static int SilentInstall(string? code, string? server, string? name, string? port, bool desktopShortcut)
    {
        try
        {
            var settings = Settings.Load();
            if (!string.IsNullOrWhiteSpace(port))
            {
                settings.Port = int.TryParse(port, out var p) && p is > 0 and < 65536
                    ? p
                    : throw new ArgumentException($"--port must be a number between 1 and 65535, not '{port}'.");
            }

            if (!string.IsNullOrWhiteSpace(code))
            {
                var url = Connection.NormalizeServer(server ?? settings.Server);
                var creds = Connection.PairAsync(url, Connection.NormalizeCode(code), name, CancellationToken.None)
                    .GetAwaiter().GetResult();
                settings.Server = url;
                settings.ConnectorName = creds.ConnectorName ?? settings.ConnectorName;
            }
            else if (Connection.Current() is null)
            {
                throw new ArgumentException("This PC is not paired yet. Pass --code=MCV-XXXX-XXXX.");
            }

            var result = InstallEngine.Install(settings, desktopShortcut, s => SetupLog.Write("  " + s));
            return result.ServiceRunning && result.CloudProblem is null ? 0 : 2;
        }
        catch (Exception e)
        {
            SetupLog.Write($"Silent install failed: {e}");
            return 1;
        }
    }

    static void Fatal(Exception? e)
    {
        SetupLog.Write($"Unhandled: {e}");
        MessageBox.Show($"Something went wrong: {e?.Message}\n\nDetails: {SetupLog.PathOnDisk}",
            AppInfo.Name, MessageBoxButtons.OK, MessageBoxIcon.Error);
    }
}
