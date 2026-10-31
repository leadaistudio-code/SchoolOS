using System.Diagnostics;
using System.ServiceProcess;
using MyCampusView.Connect.App.Install;

namespace MyCampusView.Connect.App.Ui;

/// <summary>What the Start menu shortcut opens: is it working, and the few things a school changes.</summary>
sealed class ManagerForm : Form
{
    const int ContentWidth = 600;

    readonly HeaderBar header = new() { Text = AppInfo.Name, Subtitle = $"Version {AppInfo.Version} · biometric attendance for MyCampusView" };
    readonly StatusLine service = new(ContentWidth);
    readonly StatusLine cloud = new(ContentWidth);
    readonly StatusLine terminals = new(ContentWidth);
    readonly TextBox url = new() { ReadOnly = true, Width = 380, Font = new Font("Consolas", 10.5f), BackColor = Theme.Page };
    readonly TextBox log = new()
    {
        Multiline = true,
        ReadOnly = true,
        ScrollBars = ScrollBars.Vertical,
        Width = ContentWidth,
        Height = 130,
        Font = new Font("Consolas", 8.5f),
        BackColor = Theme.Page,
        BorderStyle = BorderStyle.None,
        WordWrap = false,
    };
    readonly FlatBtn startStop = new("Stop service");
    readonly FlatBtn restart = new("Restart");
    readonly System.Windows.Forms.Timer timer = new() { Interval = 4000 };

    string? cloudProblem;
    DateTime lastCloudCheck = DateTime.MinValue;
    bool busy;

    public ManagerForm()
    {
        Text = AppInfo.Name;
        Icon = AppInfo.AppIcon;
        FormBorderStyle = FormBorderStyle.FixedSingle;
        MaximizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(680, 640);
        BackColor = Color.White;
        Font = Theme.Ui(9.5f);
        AutoScaleMode = AutoScaleMode.Dpi;

        var page = new FlowLayoutPanel
        {
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            Dock = DockStyle.Fill,
            Padding = new Padding(32, 20, 32, 12),
            AutoScroll = true,
        };
        page.Controls.Add(service);
        page.Controls.Add(cloud);
        page.Controls.Add(terminals);

        var urlRow = new FlowLayoutPanel { AutoSize = true, Margin = new Padding(26, 0, 0, 10) };
        var copy = new FlatBtn("Copy");
        copy.Click += (_, _) => { if (url.Text.Length > 0) Clipboard.SetText(url.Text); };
        urlRow.Controls.Add(url);
        urlRow.Controls.Add(copy);
        page.Controls.Add(urlRow);

        var actions = new FlowLayoutPanel { AutoSize = true, Margin = new Padding(0, 4, 0, 14), WrapContents = true, MaximumSize = new Size(ContentWidth, 0) };
        var devices = new FlatBtn("Terminals…", primary: true) { Margin = new Padding(0, 0, 8, 8) };
        var pair = new FlatBtn("Pair again…") { Margin = new Padding(0, 0, 8, 8) };
        var school = new FlatBtn("Open MyCampusView") { Margin = new Padding(0, 0, 8, 8) };
        var logs = new FlatBtn("Log folder") { Margin = new Padding(0, 0, 8, 8) };
        var uninstall = new FlatBtn("Uninstall") { Margin = new Padding(0, 0, 8, 8) };
        startStop.Margin = restart.Margin = new Padding(0, 0, 8, 8);
        actions.Controls.AddRange(new Control[] { devices, restart, startStop, pair, school, logs, uninstall });
        page.Controls.Add(actions);

        page.Controls.Add(Theme.FieldLabel("Recent activity"));
        page.Controls.Add(log);

        Controls.Add(page);
        Controls.Add(header);

        devices.Click += (_, _) => EditDevices();
        restart.Click += async (_, _) => await Act("Restarting…", SystemOps.RestartService);
        startStop.Click += async (_, _) =>
        {
            if (SystemOps.ServiceStatus() == ServiceControllerStatus.Running)
                await Act("Stopping…", SystemOps.StopService);
            else
                await Act("Starting…", () => SystemOps.StartService(TimeSpan.FromSeconds(30)));
        };
        pair.Click += (_, _) =>
        {
            using var dlg = new PairDialog(Settings.Load().Server);
            if (dlg.ShowDialog(this) == DialogResult.OK)
            {
                lastCloudCheck = DateTime.MinValue;
                RefreshStatus(force: true);
            }
        };
        school.Click += (_, _) => SystemOps.OpenUrl(SetupWizard.SchoolUrl(Connection.Current()) + "/settings/biometric");
        logs.Click += (_, _) =>
        {
            try { Process.Start(new ProcessStartInfo("explorer.exe", Path.Combine(AppInfo.DataDir, "logs")) { UseShellExecute = true }); } catch { }
        };
        uninstall.Click += (_, _) =>
        {
            if (Launcher.ConfirmAndUninstall(this)) Close();
        };

        timer.Tick += (_, _) => RefreshStatus(force: false);
        Shown += (_, _) => { RefreshStatus(force: true); timer.Start(); };
    }

    void EditDevices()
    {
        var settings = Settings.Load();
        using var dlg = new Form
        {
            Text = "Terminals",
            Icon = AppInfo.AppIcon,
            FormBorderStyle = FormBorderStyle.FixedDialog,
            MaximizeBox = false,
            MinimizeBox = false,
            StartPosition = FormStartPosition.CenterParent,
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            BackColor = Color.White,
            Font = Theme.Ui(9.5f),
            Padding = new Padding(20),
        };
        var editor = new DevicesEditor(settings);
        var save = new FlatBtn("Save and restart", primary: true);
        var cancel = new FlatBtn("Cancel") { DialogResult = DialogResult.Cancel };
        save.Click += (_, _) => dlg.DialogResult = DialogResult.OK;
        var buttons = new FlowLayoutPanel { FlowDirection = FlowDirection.RightToLeft, AutoSize = true, Dock = DockStyle.Fill, Margin = new Padding(0, 16, 0, 0) };
        buttons.Controls.Add(save);
        buttons.Controls.Add(cancel);
        var stack = new FlowLayoutPanel { FlowDirection = FlowDirection.TopDown, AutoSize = true, WrapContents = false };
        stack.Controls.Add(editor);
        stack.Controls.Add(buttons);
        dlg.Controls.Add(stack);
        dlg.AcceptButton = save;
        dlg.CancelButton = cancel;
        if (dlg.ShowDialog(this) != DialogResult.OK) return;

        var oldPort = settings.Port;
        editor.ApplyTo(settings);
        _ = Act("Saving terminals…", () =>
        {
            SystemOps.StopService();
            if (settings.HasPushDevices && settings.Port != oldPort && SystemOps.PortInUse(settings.Port))
            {
                throw new InvalidOperationException($"Port {settings.Port} is already used by another program.");
            }
            settings.Save();
            if (settings.HasPushDevices) SystemOps.OpenFirewall(settings.Port);
            else SystemOps.CloseFirewall();
            SystemOps.StartService(TimeSpan.FromSeconds(30));
        });
    }

    async Task Act(string label, Action action)
    {
        if (busy) return;
        busy = true;
        UseWaitCursor = true;
        header.SetPill(label, Theme.Neutral);
        try
        {
            await Task.Run(action);
        }
        catch (Exception e)
        {
            SetupLog.Write($"{label} failed: {e.Message}");
            MessageBox.Show(this, e.Message, AppInfo.Name, MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
        finally
        {
            busy = false;
            UseWaitCursor = false;
            lastCloudCheck = DateTime.MinValue;
            RefreshStatus(force: true);
        }
    }

    void RefreshStatus(bool force)
    {
        if (busy) return;
        var settings = Settings.Load();
        var creds = Connection.Current();
        var status = SystemOps.ServiceStatus();
        var running = status == ServiceControllerStatus.Running;

        service.Set(running ? Theme.Good : Theme.Bad,
            status switch
            {
                null => "The service is not installed",
                ServiceControllerStatus.Running => "Service running",
                _ => $"Service {status.ToString()!.ToLowerInvariant()}",
            },
            running ? "Starts with Windows and restarts itself if it stops." : InstallEngine.LastServiceError() ?? "Click Restart to start it.");
        startStop.Text = running ? "Stop service" : "Start service";
        restart.Enabled = status is not null;

        if (creds is null)
        {
            cloud.Set(Theme.Bad, "Not paired with MyCampusView", "Click Pair again… and enter a pairing code.");
        }
        else
        {
            if (force || DateTime.UtcNow - lastCloudCheck > TimeSpan.FromSeconds(60))
            {
                lastCloudCheck = DateTime.UtcNow;
                var count = settings.Devices.Count;
                _ = Task.Run(async () =>
                {
                    var problem = await Connection.VerifyAsync(creds, count, CancellationToken.None);
                    if (IsHandleCreated) BeginInvoke(() => { cloudProblem = problem; RefreshStatus(force: false); });
                });
            }
            cloud.Set(cloudProblem is null ? Theme.Good : Theme.Bad,
                cloudProblem is null ? $"Connected to {creds.TenantName ?? creds.ApiBaseUrl}" : "Cannot reach MyCampusView",
                cloudProblem ?? $"As \"{creds.ConnectorName}\" · {new Uri(creds.ApiBaseUrl).Host}");
        }

        if (!settings.HasPushDevices)
        {
            terminals.Set(Theme.Warn, "No terminals added", "Click Terminals… to add one.");
            url.Text = "";
        }
        else
        {
            var listening = running && SystemOps.PortInUse(settings.Port);
            terminals.Set(listening ? Theme.Good : Theme.Bad,
                $"{settings.Devices.Count} terminal{(settings.Devices.Count == 1 ? "" : "s")} · " +
                (listening ? $"listening on port {settings.Port}" : $"not listening on port {settings.Port}"),
                "Each terminal's Web Server URL (Menu → Comm → Cloud server, mode FkWeb):");
            var ip = SystemOps.LanAddresses().FirstOrDefault() ?? "<this PC's IP>";
            url.Text = $"http://{ip}:{settings.Port}/hdata.aspx";
        }

        var ok = running && creds is not null && cloudProblem is null;
        header.SetPill(ok ? "Running" : "Needs attention", ok ? Theme.Good : Theme.Warn);

        var lines = InstallEngine.RecentServiceLog(40);
        var text = lines.Count == 0 ? "No activity logged yet." : string.Join(Environment.NewLine, lines.Select(l => l.TrimEnd('\r')));
        if (log.Text != text)
        {
            log.Text = text;
            log.SelectionStart = log.TextLength;
            log.ScrollToCaret();
        }
    }
}
