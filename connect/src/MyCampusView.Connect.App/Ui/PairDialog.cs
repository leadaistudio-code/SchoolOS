using MyCampusView.Connect.App.Install;

namespace MyCampusView.Connect.App.Ui;

/// <summary>Re-pair with a fresh code (moved to another school, or the connector was revoked).</summary>
sealed class PairDialog : Form
{
    readonly TextBox code = new()
    {
        Width = 300,
        Font = new Font("Consolas", 16f, FontStyle.Bold),
        CharacterCasing = CharacterCasing.Upper,
        PlaceholderText = "MCV-XXXX-XXXX",
    };
    readonly TextBox name = new() { Width = 300, PlaceholderText = "Use the name set in MyCampusView" };
    readonly TextBox server = new() { Width = 300 };
    readonly Label status = new() { AutoSize = true, MaximumSize = new Size(380, 0), Margin = new Padding(0, 10, 0, 0) };
    readonly FlatBtn ok = new("Connect", primary: true);
    readonly FlatBtn cancel = new("Cancel") { DialogResult = DialogResult.Cancel };

    public PairDialog(string currentServer)
    {
        Text = "Pair with a new code";
        Icon = AppInfo.AppIcon;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = MinimizeBox = false;
        StartPosition = FormStartPosition.CenterParent;
        AutoSize = true;
        AutoSizeMode = AutoSizeMode.GrowAndShrink;
        BackColor = Color.White;
        Font = Theme.Ui(9.5f);
        Padding = new Padding(20);
        server.Text = currentServer;

        var body = new FlowLayoutPanel { FlowDirection = FlowDirection.TopDown, AutoSize = true, WrapContents = false };
        body.Controls.Add(Theme.Body(
            "Generate a pairing code in MyCampusView under Settings → Biometric attendance → Connectors, then type it here. Terminals and queued punches are kept.",
            380));
        body.Controls.Add(Theme.FieldLabel("Pairing code"));
        body.Controls.Add(code);
        body.Controls.Add(Theme.FieldLabel("Name for this PC (optional)"));
        body.Controls.Add(name);
        body.Controls.Add(Theme.FieldLabel("Server address"));
        body.Controls.Add(server);
        body.Controls.Add(status);

        var buttons = new FlowLayoutPanel { FlowDirection = FlowDirection.RightToLeft, AutoSize = true, Dock = DockStyle.Fill, Margin = new Padding(0, 16, 0, 0) };
        buttons.Controls.Add(ok);
        buttons.Controls.Add(cancel);
        body.Controls.Add(buttons);
        Controls.Add(body);
        AcceptButton = ok;
        CancelButton = cancel;
        ok.Click += async (_, _) => await Submit();
    }

    async Task Submit()
    {
        var normalized = Connection.NormalizeCode(code.Text);
        if (normalized.Length < 6)
        {
            Show("Enter the pairing code from MyCampusView.", Theme.Bad);
            return;
        }

        string serverUrl;
        try { serverUrl = Connection.NormalizeServer(server.Text); }
        catch (ArgumentException e) { Show(e.Message, Theme.Bad); return; }

        ok.Enabled = cancel.Enabled = false;
        UseWaitCursor = true;
        Show("Connecting…", Theme.Muted);
        try
        {
            var creds = await Connection.PairAsync(serverUrl, normalized,
                name.Text.Trim().Length > 0 ? name.Text.Trim() : null, CancellationToken.None);
            var settings = Settings.Load();
            settings.Server = serverUrl;
            settings.ConnectorName = creds.ConnectorName ?? settings.ConnectorName;
            settings.Save();
            await Task.Run(SystemOps.RestartService);
            DialogResult = DialogResult.OK;
            Close();
        }
        catch (Exception e)
        {
            Show(e.Message, Theme.Bad);
        }
        finally
        {
            ok.Enabled = cancel.Enabled = true;
            UseWaitCursor = false;
        }
    }

    void Show(string text, Color color)
    {
        status.Text = text;
        status.ForeColor = color;
    }
}
