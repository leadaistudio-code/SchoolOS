using System.Net;
using System.Text.RegularExpressions;
using MyCampusView.Connect.App.Install;
using MyCampusView.Connect.Core.Config;

namespace MyCampusView.Connect.App.Ui;

/// <summary>Add or edit one terminal. Only the fields a school actually has to know.</summary>
sealed class DeviceDialog : Form
{
    static readonly (string Value, string Label)[] Purposes =
    {
        ("BOTH", "Students and staff"),
        ("STUDENT", "Students only"),
        ("STAFF", "Staff only"),
        ("ACCESS_ONLY", "Door access only (no attendance)"),
    };

    readonly TextBox name = new() { Width = 360 };
    readonly TextBox cloudId = new() { Width = 360 };
    readonly TextBox ip = new() { Width = 200 };
    readonly TextBox model = new() { Width = 200, Text = "RS9W" };
    readonly ComboBox purpose = new() { Width = 260, DropDownStyle = ComboBoxStyle.DropDownList };
    readonly Label error = new() { AutoSize = true, ForeColor = Theme.Bad, Font = Theme.Ui(9f), Margin = new Padding(0, 8, 0, 0) };
    readonly DeviceConfigEntry? original;
    readonly IReadOnlyCollection<DeviceConfigEntry> others;

    public DeviceConfigEntry? Result { get; private set; }

    public DeviceDialog(DeviceConfigEntry? existing, IReadOnlyCollection<DeviceConfigEntry> otherDevices)
    {
        original = existing;
        others = otherDevices;
        Text = existing is null ? "Add a terminal" : "Edit terminal";
        Icon = AppInfo.AppIcon;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = MinimizeBox = false;
        StartPosition = FormStartPosition.CenterParent;
        AutoSize = true;
        AutoSizeMode = AutoSizeMode.GrowAndShrink;
        BackColor = Color.White;
        Font = Theme.Ui(9.5f);
        Padding = new Padding(20);

        foreach (var p in Purposes) purpose.Items.Add(p.Label);
        purpose.SelectedIndex = 0;

        var body = new FlowLayoutPanel
        {
            FlowDirection = FlowDirection.TopDown,
            AutoSize = true,
            WrapContents = false,
            Dock = DockStyle.Fill,
        };
        body.Controls.Add(Theme.FieldLabel("Name"));
        body.Controls.Add(Hint("Where it is, so staff recognise it — e.g. Main gate."));
        body.Controls.Add(name);
        body.Controls.Add(Theme.FieldLabel("Terminal Cloud ID"));
        body.Controls.Add(Hint("On the terminal: Menu → Comm → Cloud server (shown as Cloud ID or Device ID)."));
        body.Controls.Add(cloudId);
        body.Controls.Add(Theme.FieldLabel("Terminal IP address (optional)"));
        body.Controls.Add(Hint("Only punches from this address are accepted. Leave blank if the IP changes."));
        body.Controls.Add(ip);
        body.Controls.Add(Theme.FieldLabel("Used for"));
        body.Controls.Add(purpose);
        body.Controls.Add(Theme.FieldLabel("Model"));
        body.Controls.Add(model);
        body.Controls.Add(error);

        var ok = new FlatBtn(existing is null ? "Add terminal" : "Save", primary: true);
        var cancel = new FlatBtn("Cancel") { DialogResult = DialogResult.Cancel };
        ok.Click += (_, _) => Submit();
        var buttons = new FlowLayoutPanel
        {
            FlowDirection = FlowDirection.RightToLeft,
            AutoSize = true,
            Dock = DockStyle.Fill,
            Margin = new Padding(0, 16, 0, 0),
        };
        buttons.Controls.Add(ok);
        buttons.Controls.Add(cancel);
        body.Controls.Add(buttons);
        Controls.Add(body);
        AcceptButton = ok;
        CancelButton = cancel;

        if (existing is not null)
        {
            name.Text = existing.Name;
            cloudId.Text = existing.PushDeviceId ?? "";
            ip.Text = existing.NetworkAddress ?? "";
            model.Text = string.IsNullOrWhiteSpace(existing.Model) ? "RS9W" : existing.Model;
            var idx = Array.FindIndex(Purposes, p => p.Value.Equals(existing.Purpose, StringComparison.OrdinalIgnoreCase));
            purpose.SelectedIndex = idx < 0 ? 0 : idx;
        }
    }

    static Label Hint(string text) => new()
    {
        Text = text,
        AutoSize = true,
        MaximumSize = new Size(380, 0),
        ForeColor = Theme.Muted,
        Font = Theme.Ui(8.5f),
        Margin = new Padding(0, 0, 0, 4),
    };

    void Submit()
    {
        var n = name.Text.Trim();
        var id = cloudId.Text.Trim();
        var addr = ip.Text.Trim();
        if (n.Length == 0) { Fail("Give the terminal a name."); return; }
        if (id.Length == 0) { Fail("Enter the terminal's Cloud ID. Punches are matched to it."); return; }
        if (others.Any(o => string.Equals(o.PushDeviceId?.Trim(), id, StringComparison.OrdinalIgnoreCase)))
        {
            Fail("Another terminal already uses that Cloud ID.");
            return;
        }
        if (addr.Length > 0 && !IPAddress.TryParse(addr, out _))
        {
            Fail("That IP address is not valid. Use the form 192.168.1.50 or leave it blank.");
            return;
        }

        var result = original is null ? new DeviceConfigEntry() : Settings.Clone(original);
        if (string.IsNullOrWhiteSpace(result.LocalDeviceId)) result.LocalDeviceId = NewLocalId(n);
        result.Name = n;
        result.Brand = "Realtime";
        result.Model = string.IsNullOrWhiteSpace(model.Text) ? "RS9W" : model.Text.Trim();
        result.ConnectionMode = "FKWEB_PUSH";
        result.PushDeviceId = id;
        result.NetworkAddress = addr.Length > 0 ? addr : null;
        result.Purpose = Purposes[purpose.SelectedIndex].Value;
        result.SyncEnabled = true;
        Result = result;
        DialogResult = DialogResult.OK;
        Close();
    }

    string NewLocalId(string label)
    {
        var slug = Regex.Replace(label.ToLowerInvariant(), "[^a-z0-9]+", "-").Trim('-');
        if (slug.Length == 0) slug = "terminal";
        if (slug.Length > 32) slug = slug[..32];
        var candidate = slug;
        for (var i = 2; others.Any(o => o.LocalDeviceId.Equals(candidate, StringComparison.OrdinalIgnoreCase)); i++)
        {
            candidate = $"{slug}-{i}";
        }
        return candidate;
    }

    void Fail(string message) => error.Text = message;
}
