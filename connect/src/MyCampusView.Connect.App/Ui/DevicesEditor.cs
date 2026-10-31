using MyCampusView.Connect.App.Install;
using MyCampusView.Connect.Core.Config;

namespace MyCampusView.Connect.App.Ui;

/// <summary>The terminal list plus the listening port.</summary>
sealed class DevicesEditor : UserControl
{
    readonly ListView list = new()
    {
        View = View.Details,
        FullRowSelect = true,
        HideSelection = false,
        MultiSelect = false,
        Width = 560,
        Height = 170,
        BorderStyle = BorderStyle.FixedSingle,
        Font = Theme.Ui(9.5f),
    };
    readonly NumericUpDown port = new() { Minimum = 1, Maximum = 65535, Width = 90, Value = AppInfo.DefaultPort };
    readonly FlatBtn edit = new("Edit…");
    readonly FlatBtn remove = new("Remove");
    readonly List<DeviceConfigEntry> devices;

    public DevicesEditor(Settings settings)
    {
        devices = settings.Devices.Select(Settings.Clone).ToList();
        port.Value = Math.Clamp(settings.Port, 1, 65535);
        AutoSize = true;
        AutoSizeMode = AutoSizeMode.GrowAndShrink;
        Font = Theme.Ui(9.5f);

        list.Columns.Add("Name", 170);
        list.Columns.Add("Cloud ID", 140);
        list.Columns.Add("IP address", 110);
        list.Columns.Add("Used for", 120);
        list.SelectedIndexChanged += (_, _) => SyncButtons();
        list.DoubleClick += (_, _) => EditSelected();

        var add = new FlatBtn("Add terminal…", primary: true) { Margin = new Padding(0, 0, 8, 0) };
        add.Click += (_, _) => Add();
        edit.Margin = remove.Margin = new Padding(0, 0, 8, 0);
        edit.Click += (_, _) => EditSelected();
        remove.Click += (_, _) => RemoveSelected();

        var buttons = new FlowLayoutPanel { AutoSize = true, Margin = new Padding(0, 8, 0, 0) };
        buttons.Controls.AddRange(new Control[] { add, edit, remove });

        var portRow = new FlowLayoutPanel { AutoSize = true, Margin = new Padding(0, 14, 0, 0) };
        portRow.Controls.Add(new Label
        {
            Text = "Listen for terminals on port",
            AutoSize = true,
            Font = Theme.Semibold(9.5f),
            Margin = new Padding(0, 6, 8, 0),
        });
        portRow.Controls.Add(port);
        portRow.Controls.Add(new Label
        {
            Text = "Use 8080 unless another program already uses it.",
            AutoSize = true,
            ForeColor = Theme.Muted,
            Margin = new Padding(8, 6, 0, 0),
        });

        var stack = new FlowLayoutPanel
        {
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            AutoSize = true,
            Dock = DockStyle.Fill,
        };
        stack.Controls.AddRange(new Control[] { list, buttons, portRow });
        Controls.Add(stack);
        Refill();
    }

    public void ApplyTo(Settings settings)
    {
        settings.Devices = devices.Select(Settings.Clone).ToList();
        settings.Port = (int)port.Value;
    }

    void Add()
    {
        using var dlg = new DeviceDialog(null, devices);
        if (dlg.ShowDialog(FindForm()) == DialogResult.OK && dlg.Result is not null)
        {
            devices.Add(dlg.Result);
            Refill();
        }
    }

    void EditSelected()
    {
        if (list.SelectedIndices.Count == 0) return;
        var i = list.SelectedIndices[0];
        using var dlg = new DeviceDialog(devices[i], devices.Where((_, j) => j != i).ToList());
        if (dlg.ShowDialog(FindForm()) == DialogResult.OK && dlg.Result is not null)
        {
            devices[i] = dlg.Result;
            Refill();
        }
    }

    void RemoveSelected()
    {
        if (list.SelectedIndices.Count == 0) return;
        var i = list.SelectedIndices[0];
        if (MessageBox.Show(FindForm(), $"Stop receiving punches from \"{devices[i].Name}\"?", AppInfo.Name,
                MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes)
        {
            return;
        }
        devices.RemoveAt(i);
        Refill();
    }

    void Refill()
    {
        list.Items.Clear();
        foreach (var d in devices)
        {
            var item = new ListViewItem(d.Name);
            item.SubItems.Add(d.PushDeviceId ?? (d.IsFkWebPush() ? "—" : $"{d.ConnectionMode} mode"));
            item.SubItems.Add(d.NetworkAddress ?? "any");
            item.SubItems.Add(d.Purpose switch
            {
                "STUDENT" => "Students",
                "STAFF" => "Staff",
                "ACCESS_ONLY" => "Door access",
                _ => "Students and staff",
            });
            list.Items.Add(item);
        }
        SyncButtons();
    }

    void SyncButtons() => edit.Enabled = remove.Enabled = list.SelectedIndices.Count > 0;
}
