using System.Drawing;
using System.Windows.Forms;

namespace MyCampusView.CctvRelay.Ui
{
    /// <summary>First screen when the downloaded exe is opened: install or update.</summary>
    sealed class WelcomeForm : Form
    {
        readonly CheckBox desktop = new CheckBox();

        public bool DesktopShortcut => desktop.Checked;

        public WelcomeForm(string installedVersion)
        {
            var update = installedVersion != null;
            SuspendLayout();
            AutoScaleDimensions = new SizeF(96F, 96F);
            AutoScaleMode = AutoScaleMode.Dpi;
            Text = AppInfo.Name + " Setup";
            Icon = AppInfo.AppIcon;
            BackColor = Color.White;
            Font = Theme.Ui(9.5f);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(560, 400);

            var header = new HeaderBar { Text = AppInfo.Name, Height = 84 };
            header.Subtitle = update ? "Update " + installedVersion + " → " + AppInfo.Version : "Version " + AppInfo.Version;

            var body = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, Padding = new Padding(28, 20, 28, 8) };
            body.Controls.Add(new Label
            {
                Text = update ? "A newer version of the CCTV relay is ready." : "Show your school's CCTV cameras in MyCampusView.",
                AutoSize = true,
                Font = Theme.Semibold(12f),
                ForeColor = Theme.Ink,
                Margin = new Padding(0, 0, 0, 10),
            });
            body.Controls.Add(new Label
            {
                Text = update
                    ? "Your connection key and recorder password are kept. The relay restarts in a few seconds, so live view pauses briefly."
                    : "This small program runs quietly in the background on this PC. It picks up the video from your recorder and passes it securely to MyCampusView, only while someone is watching.\n\n" +
                      "•  Nothing is recorded or stored.\n" +
                      "•  It starts with Windows and fixes itself if it stops.\n" +
                      "•  Camera changes made in MyCampusView reach it automatically.",
                AutoSize = true,
                MaximumSize = new Size(500, 0),
                ForeColor = Theme.Muted,
                Margin = new Padding(0, 0, 0, 14),
            });
            desktop.Text = "Add a shortcut on the desktop";
            desktop.Checked = true;
            desktop.AutoSize = true;
            desktop.Visible = !update;
            body.Controls.Add(desktop);

            var footer = new Panel { Dock = DockStyle.Bottom, Height = 60, BackColor = Color.FromArgb(248, 250, 252) };
            footer.Paint += (_, e) => { using (var p = new Pen(Theme.Line)) e.Graphics.DrawLine(p, 0, 0, footer.Width, 0); };
            var buttons = new FlowLayoutPanel { Dock = DockStyle.Right, AutoSize = true, FlowDirection = FlowDirection.RightToLeft, WrapContents = false, Padding = new Padding(0, 14, 20, 0), BackColor = Color.Transparent };
            var ok = new FlatBtn(update ? "Update" : "Install", primary: true) { Margin = new Padding(0) };
            var cancel = new FlatBtn("Cancel") { Margin = new Padding(0, 0, 8, 0) };
            ok.Click += (_, __) => { DialogResult = DialogResult.OK; Close(); };
            cancel.Click += (_, __) => { DialogResult = DialogResult.Cancel; Close(); };
            buttons.Controls.Add(ok);
            buttons.Controls.Add(cancel);
            footer.Controls.Add(buttons);
            footer.Controls.Add(new Label { Text = "No administrator rights needed.", AutoSize = true, ForeColor = Theme.Muted, Location = new Point(24, 22) });

            Controls.Add(body);
            Controls.Add(footer);
            Controls.Add(header);
            AcceptButton = ok;
            CancelButton = cancel;
            ResumeLayout(false);
            PerformLayout();
        }
    }
}
