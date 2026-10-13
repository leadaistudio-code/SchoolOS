using System;
using System.Drawing;
using System.Linq;
using System.Threading;
using System.Windows.Forms;

namespace MyCampusView.CctvRelay.Ui
{
    /// <summary>
    /// Connect to MyCampusView: paste the connection key, type the recorder
    /// password. Both are checked live before anything is saved.
    /// </summary>
    sealed class SetupForm : Form
    {
        readonly AppSettings current;
        readonly bool firstRun;
        readonly TextBox keyBox = new TextBox();
        readonly TextBox passBox = new TextBox();
        readonly CheckBox showPass = new CheckBox();
        readonly CheckBox startup = new CheckBox();
        readonly LinkLabel advancedLink = new LinkLabel();
        readonly TextBox serverBox = new TextBox();
        readonly Label status = new Label();
        readonly FlatBtn connectBtn = new FlatBtn("Connect", primary: true);
        readonly FlatBtn cancelBtn = new FlatBtn("Cancel");
        readonly LinkLabel uninstallLink = new LinkLabel();
        bool saveAnyway;
        AppSettings pending;

        public AppSettings Result { get; private set; }
        public bool Uninstalled { get; private set; }

        public SetupForm(AppSettings settings, bool firstRun)
        {
            current = settings;
            this.firstRun = firstRun;
            SuspendLayout();
            AutoScaleDimensions = new SizeF(96F, 96F);
            AutoScaleMode = AutoScaleMode.Dpi;
            Text = firstRun ? "Connect to MyCampusView" : "Settings";
            Icon = AppInfo.AppIcon;
            BackColor = Color.White;
            Font = Theme.Ui(9.5f);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            ShowInTaskbar = false;
            StartPosition = FormStartPosition.CenterParent;
            ClientSize = new Size(560, 560);

            var header = new HeaderBar { Text = firstRun ? "Connect to MyCampusView" : "Relay settings", Height = 72 };
            header.TitleFont = Theme.Semibold(13f);
            header.Subtitle = "Two things from your MyCampusView account, then you're done.";

            var body = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, Padding = new Padding(28, 18, 28, 8), AutoScroll = false };
            body.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));

            body.Controls.Add(Heading("1.  Connection key"));
            body.Controls.Add(Hint(settings.IsConfigured
                ? "Saved. To replace it, paste a new key from MyCampusView → Settings → CCTV."
                : "In MyCampusView, open Settings → CCTV and click “Create connection key”, then paste it here."));
            keyBox.Font = new Font("Consolas", 9.5f);
            keyBox.Dock = DockStyle.Fill;
            keyBox.Margin = new Padding(0, 4, 0, 14);
            keyBox.BorderStyle = BorderStyle.FixedSingle;
            SetCue(keyBox, settings.IsConfigured ? "•••••••• saved – leave empty to keep" : "mcvr_…");
            body.Controls.Add(keyBox);

            body.Controls.Add(Heading("2.  Recorder password"));
            body.Controls.Add(Hint("The password of the recorder (DVR/NVR) user named in MyCampusView. It stays on this PC, encrypted, and is never sent to MyCampusView."));
            var passRow = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, AutoSize = true, Margin = new Padding(0, 4, 0, 14) };
            passRow.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            passRow.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            passBox.UseSystemPasswordChar = true;
            passBox.Dock = DockStyle.Fill;
            passBox.BorderStyle = BorderStyle.FixedSingle;
            passBox.Margin = new Padding(0);
            SetCue(passBox, !string.IsNullOrEmpty(settings.RecorderPassword) ? "•••••••• saved – leave empty to keep" : "");
            showPass.Text = "Show";
            showPass.AutoSize = true;
            showPass.Margin = new Padding(10, 3, 0, 0);
            showPass.CheckedChanged += (_, __) => passBox.UseSystemPasswordChar = !showPass.Checked;
            passRow.Controls.Add(passBox, 0, 0);
            passRow.Controls.Add(showPass, 1, 0);
            body.Controls.Add(passRow);

            startup.Text = "Start automatically when Windows starts (recommended)";
            startup.Checked = settings.StartWithWindows;
            startup.AutoSize = true;
            startup.Margin = new Padding(0, 0, 0, 8);
            body.Controls.Add(startup);

            advancedLink.Text = "Advanced: server address";
            advancedLink.AutoSize = true;
            advancedLink.LinkColor = Theme.Muted;
            advancedLink.Margin = new Padding(0, 2, 0, 4);
            advancedLink.LinkClicked += (_, __) => serverBox.Visible = !serverBox.Visible;
            body.Controls.Add(advancedLink);
            serverBox.Text = settings.ServerUrl;
            serverBox.Dock = DockStyle.Fill;
            serverBox.BorderStyle = BorderStyle.FixedSingle;
            serverBox.Visible = settings.ServerUrl != AppInfo.DefaultServer;
            SetCue(serverBox, AppInfo.DefaultServer);
            body.Controls.Add(serverBox);

            status.AutoSize = false;
            status.Anchor = AnchorStyles.Left | AnchorStyles.Right | AnchorStyles.Top;
            status.Height = 64;
            status.Margin = new Padding(0, 10, 0, 0);
            status.Font = Theme.Ui(9.25f);
            body.Controls.Add(status);

            var footer = new Panel { Dock = DockStyle.Bottom, Height = 60, BackColor = Color.FromArgb(248, 250, 252) };
            footer.Paint += (_, e) => { using (var p = new Pen(Theme.Line)) e.Graphics.DrawLine(p, 0, 0, footer.Width, 0); };
            var buttons = new FlowLayoutPanel { Dock = DockStyle.Right, AutoSize = true, FlowDirection = FlowDirection.RightToLeft, WrapContents = false, Padding = new Padding(0, 14, 20, 0), BackColor = Color.Transparent };
            connectBtn.Margin = new Padding(0);
            cancelBtn.Margin = new Padding(0, 0, 8, 0);
            buttons.Controls.Add(connectBtn);
            buttons.Controls.Add(cancelBtn);
            footer.Controls.Add(buttons);
            if (!firstRun && Installer.RunningInstalled)
            {
                uninstallLink.Text = "Uninstall…";
                uninstallLink.AutoSize = true;
                uninstallLink.LinkColor = Theme.Bad;
                uninstallLink.Location = new Point(24, 22);
                uninstallLink.LinkClicked += (_, __) => DoUninstall();
                footer.Controls.Add(uninstallLink);
            }

            Controls.Add(body);
            Controls.Add(footer);
            Controls.Add(header);
            AcceptButton = connectBtn;
            CancelButton = cancelBtn;
            ResumeLayout(false);
            PerformLayout();

            connectBtn.Text = firstRun ? "Connect" : "Save";
            connectBtn.Click += async (_, __) => await Connect();
            cancelBtn.Click += (_, __) => { DialogResult = DialogResult.Cancel; Close(); };
            keyBox.TextChanged += (_, __) => ResetAnyway();
            passBox.TextChanged += (_, __) => ResetAnyway();
        }

        void ResetAnyway()
        {
            if (!saveAnyway) return;
            saveAnyway = false;
            connectBtn.Text = firstRun ? "Connect" : "Save";
        }

        static Label Heading(string text) => new Label { Text = text, AutoSize = true, Font = Theme.Semibold(10.5f), ForeColor = Theme.Ink, Margin = new Padding(0, 0, 0, 2) };

        static Label Hint(string text) => new Label { Text = text, AutoSize = true, MaximumSize = new Size(500, 0), ForeColor = Theme.Muted, Font = Theme.Ui(8.75f), Margin = new Padding(0, 0, 0, 2) };

        [System.Runtime.InteropServices.DllImport("user32.dll", CharSet = System.Runtime.InteropServices.CharSet.Unicode)]
        static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, string lParam);

        static void SetCue(TextBox box, string cue)
        {
            if (string.IsNullOrEmpty(cue)) return;
            box.HandleCreated += (_, __) => SendMessage(box.Handle, 0x1501, (IntPtr)1, cue);
        }

        void Say(string text, Color color)
        {
            status.Text = text;
            status.ForeColor = color;
        }

        async System.Threading.Tasks.Task Connect()
        {
            if (saveAnyway && pending != null) { Finish(pending); return; }

            var key = keyBox.Text.Trim();
            if (key.Length == 0) key = current.ConnectionKey;
            var password = passBox.Text.Length > 0 ? passBox.Text : current.RecorderPassword;
            var server = AppSettings.NormaliseServer(serverBox.Text);

            if (server == null) { Say("The server address must start with https://", Theme.Bad); return; }
            if (string.IsNullOrEmpty(key)) { Say("Paste the connection key from MyCampusView → Settings → CCTV.", Theme.Bad); keyBox.Focus(); return; }
            if (!ServerClient.LooksLikeKey(key)) { Say("That doesn't look like a connection key. It starts with mcvr_ – copy it again from MyCampusView.", Theme.Bad); keyBox.Focus(); return; }

            SetBusy(true);
            try
            {
                Say("Checking the connection key…", Theme.Muted);
                SyncResult sync;
                try
                {
                    sync = await ServerClient.SyncAsync(server, key, CancellationToken.None);
                }
                catch (SyncException e)
                {
                    Say(e.Message, Theme.Bad);
                    return;
                }

                pending = new AppSettings { ServerUrl = server, ConnectionKey = key, RecorderPassword = password, StartWithWindows = startup.Checked };

                if (sync.NvrHost == null || sync.Cameras.Count == 0)
                {
                    Finish(pending);
                    return;
                }

                Say("Connected to " + sync.SchoolName + ". Checking the recorder login at " + sync.NvrHost + "…", Theme.Muted);
                var cam = sync.Cameras.First();
                var r = await RtspProbe.DescribeAsync(sync.NvrHost, sync.NvrPort, sync.NvrUsername, password, cam.Channel);
                switch (r.Outcome)
                {
                    case ProbeOutcome.Ok:
                        Finish(pending);
                        return;
                    case ProbeOutcome.WrongLogin:
                        Say("The recorder rejected the password for user “" + sync.NvrUsername + "”. Check the password (and the username in MyCampusView), then try again.", Theme.Bad);
                        passBox.Focus();
                        passBox.SelectAll();
                        return;
                    default:
                        var why = r.Outcome == ProbeOutcome.Unreachable ? "Could not reach the recorder at " + sync.NvrHost + ". Is this PC on the school network?"
                            : r.Outcome == ProbeOutcome.Refused ? "RTSP (port " + sync.NvrPort + ") is switched off on the recorder."
                            : r.Outcome == ProbeOutcome.Blocked ? "The recorder refused the video request. Turn off “RTSP over TLS” and allow this PC in its firewall."
                            : r.Detail;
                        Say(why + " You can save now and fix this afterwards.", Theme.Warn);
                        saveAnyway = true;
                        connectBtn.Text = "Save anyway";
                        return;
                }
            }
            finally
            {
                SetBusy(false);
            }
        }

        void SetBusy(bool busy)
        {
            connectBtn.Enabled = !busy;
            keyBox.Enabled = passBox.Enabled = serverBox.Enabled = !busy;
            UseWaitCursor = busy;
        }

        void Finish(AppSettings s)
        {
            try
            {
                s.Save();
            }
            catch (Exception e)
            {
                Say("Could not save the settings: " + e.Message, Theme.Bad);
                return;
            }
            Result = s;
            Log.Info("Settings saved.");
            DialogResult = DialogResult.OK;
            Close();
        }

        void DoUninstall()
        {
            if (MessageBox.Show(this, "Remove the CCTV relay from this PC?\n\nLive CCTV in MyCampusView stops working until it is installed again.", AppInfo.Name, MessageBoxButtons.YesNo, MessageBoxIcon.Warning, MessageBoxDefaultButton.Button2) != DialogResult.Yes) return;
            Installer.Uninstall(removeSettings: true);
            Uninstalled = true;
            DialogResult = DialogResult.Abort;
            Close();
        }
    }
}
