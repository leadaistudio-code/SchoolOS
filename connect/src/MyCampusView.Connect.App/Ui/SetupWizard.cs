using MyCampusView.Connect.App.Install;
using MyCampusView.Connect.Core.Config;

namespace MyCampusView.Connect.App.Ui;

/// <summary>
/// Welcome → connect to the school → terminals → install → done.
/// Pairing happens when leaving the connect step so a bad code fails before
/// anything is installed.
/// </summary>
sealed class SetupWizard : Form
{
    const int ContentWidth = 600;

    readonly HeaderBar header = new() { Text = AppInfo.Name };
    readonly Panel content = new() { Dock = DockStyle.Fill, Padding = new Padding(32, 24, 32, 12), BackColor = Color.White };
    readonly FlatBtn back = new("Back");
    readonly FlatBtn next = new("Next", primary: true);
    readonly FlatBtn cancel = new("Cancel");

    readonly Settings settings = Settings.Load();
    readonly StoredCredentials? existing = Connection.Current();
    readonly bool updating = SystemOps.IsRegistered();

    // Connect step
    readonly RadioButton keepPairing = new() { AutoSize = true, Font = Theme.Ui(9.5f), Checked = true };
    readonly RadioButton newPairing = new() { AutoSize = true, Font = Theme.Ui(9.5f), Text = "Connect with a new pairing code" };
    readonly TextBox code = new()
    {
        Width = 300,
        Font = new Font("Consolas", 16f, FontStyle.Bold),
        CharacterCasing = CharacterCasing.Upper,
        PlaceholderText = "MCV-XXXX-XXXX",
    };
    readonly TextBox connectorName = new() { Width = 300, PlaceholderText = "Use the name set in MyCampusView" };
    readonly TextBox server = new() { Width = 300, Visible = false };
    readonly Label connectStatus = new() { AutoSize = true, Font = Theme.Ui(9.5f), MaximumSize = new Size(ContentWidth, 0), Margin = new Padding(0, 12, 0, 0) };

    // Welcome step
    readonly CheckBox desktopShortcut = new() { Text = "Put a shortcut on the desktop", AutoSize = true, Checked = true, Font = Theme.Ui(9.5f) };

    DevicesEditor? devicesEditor;
    InstallResult? result;
    int step;
    bool busy;

    public SetupWizard()
    {
        Text = updating ? $"{AppInfo.Name} {AppInfo.Version} — update" : $"{AppInfo.Name} {AppInfo.Version} — setup";
        Icon = AppInfo.AppIcon;
        FormBorderStyle = FormBorderStyle.FixedSingle;
        MaximizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(680, 600);
        BackColor = Color.White;
        Font = Theme.Ui(9.5f);
        AutoScaleMode = AutoScaleMode.Dpi;

        var footer = new Panel { Dock = DockStyle.Bottom, Height = 60, BackColor = Theme.Page };
        footer.Paint += (_, e) => { using var pen = new Pen(Theme.Line); e.Graphics.DrawLine(pen, 0, 0, footer.Width, 0); };
        var buttons = new FlowLayoutPanel
        {
            FlowDirection = FlowDirection.RightToLeft,
            Dock = DockStyle.Fill,
            Padding = new Padding(0, 14, 24, 0),
        };
        buttons.Controls.AddRange(new Control[] { cancel, next, back });
        footer.Controls.Add(buttons);

        Controls.Add(content);
        Controls.Add(footer);
        Controls.Add(header);

        back.Click += (_, _) => Go(step - 1);
        next.Click += async (_, _) => await Advance();
        cancel.Click += (_, _) => Close();
        AcceptButton = next;

        if (existing is null)
        {
            keepPairing.Visible = newPairing.Visible = false;
            newPairing.Checked = true;
        }
        else
        {
            keepPairing.Text = $"Keep this PC connected to {existing.TenantName ?? existing.ApiBaseUrl}";
        }
        keepPairing.CheckedChanged += (_, _) => code.Enabled = connectorName.Enabled = !keepPairing.Checked;
        code.Enabled = connectorName.Enabled = !keepPairing.Checked;
        server.Text = settings.Server;

        Go(0);
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        if (busy)
        {
            e.Cancel = true;
            return;
        }
        if (step is > 0 and < 3 && e.CloseReason == CloseReason.UserClosing &&
            MessageBox.Show(this, "Leave setup? Nothing has been installed yet.", AppInfo.Name,
                MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes)
        {
            e.Cancel = true;
        }
        base.OnFormClosing(e);
    }

    void Go(int target)
    {
        step = Math.Clamp(target, 0, 4);
        content.SuspendLayout();
        content.Controls.Clear();
        var page = new FlowLayoutPanel
        {
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            AutoSize = true,
            Dock = DockStyle.Top,
        };
        switch (step)
        {
            case 0: BuildWelcome(page); break;
            case 1: BuildConnect(page); break;
            case 2: BuildDevices(page); break;
            case 3: BuildInstalling(page); break;
            default: BuildDone(page); break;
        }
        content.Controls.Add(page);
        content.ResumeLayout();

        header.Subtitle = step switch
        {
            0 => "Biometric attendance for MyCampusView",
            1 => "Step 1 of 3 · Connect to your school",
            2 => "Step 2 of 3 · Add your attendance terminals",
            3 => "Step 3 of 3 · Installing",
            _ => "Finished",
        };
        back.Visible = step is 1 or 2;
        cancel.Visible = step < 3;
        next.Visible = step != 3;
        next.Text = step switch { 2 => updating ? "Update" : "Install", 4 => "Finish", _ => "Next" };
    }

    async Task Advance()
    {
        switch (step)
        {
            case 0:
                Go(1);
                break;
            case 1:
                if (await Connect()) Go(2);
                break;
            case 2:
                devicesEditor!.ApplyTo(settings);
                if (settings.Devices.Count == 0 &&
                    MessageBox.Show(this,
                        "No terminals added. Connect will install and stay connected, but no punches arrive until you add a terminal from the MyCampusView Connect window.\n\nInstall anyway?",
                        AppInfo.Name, MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes)
                {
                    return;
                }
                Go(3);
                await RunInstall();
                break;
            default:
                Close();
                break;
        }
    }

    /* ------------------------------------------------------------- pages */

    void BuildWelcome(FlowLayoutPanel p)
    {
        p.Controls.Add(Theme.Heading(updating ? "Update MyCampusView Connect" : "Set up biometric attendance"));
        p.Controls.Add(Theme.Body(
            "MyCampusView Connect runs quietly on this PC and passes every fingerprint or face punch from your attendance terminals to MyCampusView, where it marks student and staff attendance.",
            ContentWidth));
        p.Controls.Add(Theme.FieldLabel("Before you start, have ready:"));
        p.Controls.Add(Theme.Body(
            "•  A pairing code — in MyCampusView open Settings → Biometric attendance → Connectors and click Generate pairing code.\n" +
            "•  Each terminal's Cloud ID — on the terminal: Menu → Comm → Cloud server.\n\n" +
            "This PC should stay switched on during school hours and be on the same network as the terminals. Punches made while it is off are kept on the terminal and sent when it is back.",
            ContentWidth));
        if (updating)
        {
            p.Controls.Add(Theme.Body("Your current connection and terminals are kept. You can change them on the next steps.", ContentWidth));
        }
        p.Controls.Add(desktopShortcut);
    }

    void BuildConnect(FlowLayoutPanel p)
    {
        p.Controls.Add(Theme.Heading("Connect this PC to your school"));
        p.Controls.Add(Theme.Body(
            "Type the pairing code shown in MyCampusView under Settings → Biometric attendance → Connectors. A code works once and expires after 30 minutes.",
            ContentWidth));
        p.Controls.Add(keepPairing);
        p.Controls.Add(newPairing);
        p.Controls.Add(Theme.FieldLabel("Pairing code"));
        p.Controls.Add(code);
        p.Controls.Add(Theme.FieldLabel("Name for this PC (optional)"));
        p.Controls.Add(connectorName);

        var advanced = new LinkLabel
        {
            Text = server.Visible ? "Hide server address" : "Advanced: server address",
            AutoSize = true,
            LinkColor = Theme.Muted,
            Margin = new Padding(0, 14, 0, 2),
        };
        advanced.LinkClicked += (_, _) =>
        {
            server.Visible = !server.Visible;
            advanced.Text = server.Visible ? "Hide server address" : "Advanced: server address";
        };
        p.Controls.Add(advanced);
        p.Controls.Add(server);
        p.Controls.Add(connectStatus);
        BeginInvoke(() => (code.Enabled ? (Control)code : next).Focus());
    }

    void BuildDevices(FlowLayoutPanel p)
    {
        p.Controls.Add(Theme.Heading("Add your attendance terminals"));
        p.Controls.Add(Theme.Body(
            "Add each Realtime terminal (RS9W and other FkWeb models) on this network. Terminals send punches to this PC; it forwards them to MyCampusView.",
            ContentWidth));
        devicesEditor ??= new DevicesEditor(settings);
        p.Controls.Add(devicesEditor);
    }

    readonly Label currentStep = new() { AutoSize = true, Font = Theme.Semibold(10f), ForeColor = Theme.Ink, Margin = new Padding(0, 8, 0, 8) };
    readonly ListBox doneSteps = new() { Width = ContentWidth, Height = 220, BorderStyle = BorderStyle.None, Font = Theme.Ui(9.5f), ForeColor = Theme.Muted };

    void BuildInstalling(FlowLayoutPanel p)
    {
        p.Controls.Add(Theme.Heading(updating ? "Updating…" : "Installing…"));
        p.Controls.Add(new ProgressBar { Style = ProgressBarStyle.Marquee, Width = ContentWidth, Height = 8, MarqueeAnimationSpeed = 25 });
        p.Controls.Add(currentStep);
        p.Controls.Add(doneSteps);
    }

    void BuildDone(FlowLayoutPanel p)
    {
        var r = result!;
        var allGood = r.ServiceRunning && r.CloudProblem is null && (!settings.HasPushDevices || r.Listening);
        header.SetPill(allGood ? "Running" : "Needs attention", allGood ? Theme.Good : Theme.Warn);
        p.Controls.Add(Theme.Heading(allGood ? "MyCampusView Connect is running" : "Installed, but something needs attention"));

        var service = new StatusLine(ContentWidth);
        service.Set(r.ServiceRunning ? Theme.Good : Theme.Bad,
            r.ServiceRunning ? "Running as a Windows service" : "The service is not running",
            r.ServiceRunning ? "Starts automatically with Windows and restarts itself if it stops." : r.ServiceProblem ?? "");
        p.Controls.Add(service);

        var creds = Connection.Current();
        var cloud = new StatusLine(ContentWidth);
        cloud.Set(r.CloudProblem is null ? Theme.Good : Theme.Bad,
            r.CloudProblem is null ? $"Connected to {creds?.TenantName ?? "MyCampusView"}" : "Not connected to MyCampusView",
            r.CloudProblem ?? $"Shown in MyCampusView as \"{creds?.ConnectorName}\".");
        p.Controls.Add(cloud);

        var terminals = new StatusLine(ContentWidth);
        if (!settings.HasPushDevices)
        {
            terminals.Set(Theme.Warn, "No terminals added yet", "Open MyCampusView Connect from the Start menu to add them.");
        }
        else
        {
            terminals.Set(r.Listening ? Theme.Good : Theme.Bad,
                r.Listening
                    ? $"Listening for {settings.Devices.Count} terminal{(settings.Devices.Count == 1 ? "" : "s")} on port {settings.Port}"
                    : $"Not listening on port {settings.Port}",
                r.Listening ? "" : "Another program may be using the port. Change it in MyCampusView Connect.");
        }
        p.Controls.Add(terminals);

        if (settings.HasPushDevices)
        {
            p.Controls.Add(Theme.FieldLabel("Last step — on each terminal"));
            p.Controls.Add(Theme.Body(
                "Menu → Comm → Cloud server: set Server-Client mode to FkWeb and the Web Server URL to:",
                ContentWidth));
            p.Controls.Add(UrlBox(settings.Port));
        }

        var open = new LinkLabel { Text = "Open Biometric attendance in MyCampusView", AutoSize = true, Margin = new Padding(0, 12, 0, 0) };
        open.LinkClicked += (_, _) => SystemOps.OpenUrl(SchoolUrl(creds) + "/settings/biometric");
        p.Controls.Add(open);
    }

    static Control UrlBox(int port)
    {
        var ips = SystemOps.LanAddresses();
        var urls = ips.Count == 0
            ? new List<string> { $"http://<this PC's IP>:{port}/hdata.aspx" }
            : ips.Select(ip => $"http://{ip}:{port}/hdata.aspx").ToList();
        var row = new FlowLayoutPanel { AutoSize = true, Margin = new Padding(0, 0, 0, 4) };
        var box = new TextBox
        {
            Text = urls[0],
            ReadOnly = true,
            Width = 380,
            Font = new Font("Consolas", 11f),
            BackColor = Theme.Page,
        };
        var copy = new FlatBtn("Copy");
        copy.Click += (_, _) => { Clipboard.SetText(box.Text); copy.Text = "Copied"; };
        row.Controls.Add(box);
        row.Controls.Add(copy);

        var wrap = new FlowLayoutPanel { FlowDirection = FlowDirection.TopDown, AutoSize = true, WrapContents = false };
        wrap.Controls.Add(row);
        if (urls.Count > 1)
        {
            wrap.Controls.Add(Theme.Body("This PC has more than one network. If the terminal is on the other one, use: " +
                                         string.Join("  or  ", urls.Skip(1)), ContentWidth));
        }
        wrap.Controls.Add(Theme.Body("Give this PC a fixed IP address on your router so the URL does not change.", ContentWidth));
        return wrap;
    }

    public static string SchoolUrl(StoredCredentials? creds)
    {
        var server = creds?.ApiBaseUrl ?? AppInfo.DefaultServer;
        if (creds?.TenantSlug is { Length: > 0 } slug &&
            Uri.TryCreate(server, UriKind.Absolute, out var uri) &&
            uri.Host.Equals("app.mycampusview.com", StringComparison.OrdinalIgnoreCase))
        {
            return $"https://{slug}.mycampusview.com";
        }
        return server.TrimEnd('/');
    }

    /* ----------------------------------------------------------- actions */

    async Task<bool> Connect()
    {
        string serverUrl;
        try
        {
            serverUrl = Connection.NormalizeServer(server.Text);
        }
        catch (ArgumentException e)
        {
            ShowConnect(e.Message, Theme.Bad);
            return false;
        }

        if (keepPairing.Visible && keepPairing.Checked)
        {
            settings.Server = existing!.ApiBaseUrl;
            return true;
        }

        var normalized = Connection.NormalizeCode(code.Text);
        if (normalized.Length < 6)
        {
            ShowConnect("Enter the pairing code from MyCampusView.", Theme.Bad);
            code.Focus();
            return false;
        }

        SetBusy(true);
        ShowConnect($"Connecting to {new Uri(serverUrl).Host}…", Theme.Muted);
        try
        {
            var creds = await Connection.PairAsync(serverUrl, normalized,
                connectorName.Text.Trim().Length > 0 ? connectorName.Text.Trim() : null, CancellationToken.None);
            settings.Server = serverUrl;
            settings.ConnectorName = creds.ConnectorName ?? settings.ConnectorName;
            ShowConnect($"Connected to {creds.TenantName}.", Theme.Good);
            return true;
        }
        catch (Exception e)
        {
            ShowConnect(e.Message, Theme.Bad);
            return false;
        }
        finally
        {
            SetBusy(false);
        }
    }

    async Task RunInstall()
    {
        SetBusy(true);
        void Step(string s) => BeginInvoke(() =>
        {
            if (currentStep.Text.Length > 0) doneSteps.Items.Add("✓  " + currentStep.Text);
            currentStep.Text = s + "…";
        });

        try
        {
            result = await Task.Run(() => InstallEngine.Install(settings, desktopShortcut.Checked, Step));
            SetBusy(false);
            Go(4);
        }
        catch (Exception e)
        {
            SetupLog.Write($"Install failed: {e}");
            SetBusy(false);
            MessageBox.Show(this, $"Setup could not finish:\n\n{e.Message}\n\nDetails are in {SetupLog.PathOnDisk}",
                AppInfo.Name, MessageBoxButtons.OK, MessageBoxIcon.Error);
            Go(2);
        }
    }

    void ShowConnect(string text, Color color)
    {
        connectStatus.Text = text;
        connectStatus.ForeColor = color;
    }

    void SetBusy(bool on)
    {
        busy = on;
        UseWaitCursor = on;
        next.Enabled = back.Enabled = cancel.Enabled = !on;
    }
}
