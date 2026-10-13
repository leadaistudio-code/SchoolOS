using System;
using System.Diagnostics;
using System.Drawing;
using System.Linq;
using System.Threading;
using System.Windows.Forms;

namespace MyCampusView.CctvRelay.Ui
{
    sealed class MainForm : Form
    {
        readonly bool startHidden;
        AppSettings settings;
        readonly RelayEngine engine;
        readonly HeaderBar header = new HeaderBar();
        readonly StatusCard serverCard = new StatusCard { Title = "MyCampusView" };
        readonly StatusCard recorderCard = new StatusCard { Title = "Recorder" };
        readonly StatusCard relayCard = new StatusCard { Title = "Video relay" };
        readonly StatusCard tunnelCard = new StatusCard { Title = "Internet tunnel" };
        readonly ListView list = new ListView();
        readonly ImageList dots = new ImageList();
        readonly Label camerasLabel = new Label();
        readonly Label emptyLabel = new Label();
        readonly FlatBtn liveBtn = new FlatBtn("Open live view", primary: true);
        readonly FlatBtn checkBtn = new FlatBtn("Check cameras");
        readonly FlatBtn restartBtn = new FlatBtn("Restart relay");
        readonly FlatBtn fixBtn = new FlatBtn("Fix: stop the other MediaMTX");
        readonly FlatBtn logBtn = new FlatBtn("View log");
        readonly FlatBtn settingsBtn = new FlatBtn("Settings");
        readonly NotifyIcon tray = new NotifyIcon();
        readonly ToolStripMenuItem trayStatus = new ToolStripMenuItem { Enabled = false };
        bool reallyExit;
        bool hintShown;
        LogForm logForm;

        public MainForm(bool startHidden)
        {
            this.startHidden = startHidden;
            SuspendLayout();
            AutoScaleDimensions = new SizeF(96F, 96F);
            AutoScaleMode = AutoScaleMode.Dpi;
            Text = AppInfo.Name;
            Icon = AppInfo.AppIcon;
            BackColor = Theme.Page;
            Font = Theme.Ui(9f);
            ClientSize = new Size(940, 640);
            MinimumSize = new Size(820, 560);
            StartPosition = FormStartPosition.CenterScreen;

            header.Text = AppInfo.Name;
            header.Subtitle = "Version " + AppInfo.Version;

            var cards = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 4, RowCount = 1, Margin = new Padding(0), BackColor = Theme.Page };
            for (int i = 0; i < 4; i++) cards.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 25));
            cards.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            foreach (var c in new[] { serverCard, recorderCard, relayCard, tunnelCard }) { c.Dock = DockStyle.Fill; cards.Controls.Add(c); }

            camerasLabel.Text = "Cameras";
            camerasLabel.Font = Theme.Semibold(11f);
            camerasLabel.ForeColor = Theme.Ink;
            camerasLabel.Dock = DockStyle.Fill;
            camerasLabel.TextAlign = ContentAlignment.BottomLeft;
            camerasLabel.Padding = new Padding(4, 0, 0, 4);

            dots.ColorDepth = ColorDepth.Depth32Bit;
            dots.ImageSize = new Size(Scale(22), Scale(30));
            foreach (Health h in Enum.GetValues(typeof(Health))) dots.Images.Add(h.ToString(), Dot(Theme.Of(h)));

            list.View = View.Details;
            list.FullRowSelect = true;
            list.HeaderStyle = ColumnHeaderStyle.Nonclickable;
            list.BorderStyle = BorderStyle.None;
            list.Font = Theme.Ui(9.5f);
            list.ForeColor = Theme.Ink;
            list.SmallImageList = dots;
            list.Dock = DockStyle.Fill;
            list.MultiSelect = false;
            list.Columns.Add("Channel", Scale(90));
            list.Columns.Add("Camera", Scale(220));
            list.Columns.Add("Status", Scale(380));
            list.Columns.Add("Video", Scale(90));
            list.Resize += (_, __) => FitColumns();

            emptyLabel.Dock = DockStyle.Fill;
            emptyLabel.TextAlign = ContentAlignment.MiddleCenter;
            emptyLabel.ForeColor = Theme.Muted;
            emptyLabel.Font = Theme.Ui(10f);
            emptyLabel.BackColor = Color.White;
            emptyLabel.Visible = false;

            var listFrame = new Panel { Dock = DockStyle.Fill, Padding = new Padding(1), BackColor = Theme.Line, Margin = new Padding(6) };
            var listInner = new Panel { Dock = DockStyle.Fill, BackColor = Color.White, Padding = new Padding(6, 4, 6, 4) };
            listInner.Controls.Add(list);
            listInner.Controls.Add(emptyLabel);
            listFrame.Controls.Add(listInner);

            var body = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 3, Padding = new Padding(14, 12, 14, 8), BackColor = Theme.Page };
            body.RowStyles.Add(new RowStyle(SizeType.Absolute, 150));
            body.RowStyles.Add(new RowStyle(SizeType.Absolute, 36));
            body.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            body.Controls.Add(cards, 0, 0);
            body.Controls.Add(camerasLabel, 0, 1);
            body.Controls.Add(listFrame, 0, 2);

            var footer = new Panel { Dock = DockStyle.Bottom, Height = 62, BackColor = Color.White };
            footer.Paint += (_, e) => { using (var p = new Pen(Theme.Line)) e.Graphics.DrawLine(p, 0, 0, footer.Width, 0); };
            var left = new FlowLayoutPanel { Dock = DockStyle.Left, AutoSize = true, WrapContents = false, Padding = new Padding(20, 14, 0, 0), BackColor = Color.White };
            left.Controls.AddRange(new Control[] { liveBtn, checkBtn, restartBtn, fixBtn });
            var right = new FlowLayoutPanel { Dock = DockStyle.Right, AutoSize = true, WrapContents = false, Padding = new Padding(0, 14, 12, 0), BackColor = Color.White };
            right.Controls.AddRange(new Control[] { logBtn, settingsBtn });
            footer.Controls.Add(left);
            footer.Controls.Add(right);
            fixBtn.Visible = false;

            Controls.Add(body);
            Controls.Add(footer);
            Controls.Add(header);
            ResumeLayout(false);
            PerformLayout();

            liveBtn.Click += (_, __) => OpenLive();
            checkBtn.Click += async (_, __) =>
            {
                checkBtn.Enabled = false;
                checkBtn.Text = "Checking…";
                try { await engine.ProbeRecorder(true); }
                finally { checkBtn.Text = "Check cameras"; checkBtn.Enabled = true; }
            };
            restartBtn.Click += (_, __) => { engine.RestartRelay(); engine.SyncNow(); };
            fixBtn.Click += (_, __) => FixOtherRelay();
            logBtn.Click += (_, __) => ShowLog();
            settingsBtn.Click += (_, __) => OpenSettings(false);

            BuildTray();

            settings = AppSettings.Load();
            engine = new RelayEngine(SynchronizationContext.Current ?? new WindowsFormsSynchronizationContext());
            engine.Changed += Render;
            engine.Notify += (title, text, problem) => tray.ShowBalloonTip(8000, title, text.Length > 250 ? text.Substring(0, 250) + "…" : text, problem ? ToolTipIcon.Warning : ToolTipIcon.Info);
            Render();
        }

        int Scale(int px) => (int)Math.Round(px * DeviceDpi / 96.0);

        Bitmap Dot(Color c)
        {
            var bmp = new Bitmap(dots.ImageSize.Width, dots.ImageSize.Height);
            using (var g = Graphics.FromImage(bmp))
            {
                Theme.Smooth(g);
                var d = Scale(10);
                using (var b = new SolidBrush(c)) g.FillEllipse(b, Scale(6), (bmp.Height - d) / 2f, d, d);
            }
            return bmp;
        }

        void FitColumns()
        {
            if (list.Columns.Count < 4) return;
            var rest = list.ClientSize.Width - list.Columns[0].Width - list.Columns[1].Width - list.Columns[3].Width;
            list.Columns[2].Width = Math.Max(Scale(200), rest);
        }

        protected override void SetVisibleCore(bool value)
        {
            if (startHidden && !IsHandleCreated && settingsExist())
            {
                CreateHandle();
                value = false;
                OnStart();
            }
            base.SetVisibleCore(value);
        }

        static bool settingsExist() => System.IO.File.Exists(AppInfo.SettingsFile);

        bool started;
        protected override void OnShown(EventArgs e)
        {
            base.OnShown(e);
            OnStart();
        }

        void OnStart()
        {
            if (started) return;
            started = true;
            FitColumns();
            if (settings.IsConfigured)
            {
                engine.Start(settings);
            }
            else
            {
                BeginInvoke(new Action(() => OpenSettings(true)));
            }
        }

        void BuildTray()
        {
            tray.Icon = AppInfo.SizedIcon(16);
            tray.Text = AppInfo.Name;
            var menu = new ContextMenuStrip { Font = Theme.Ui(9f) };
            menu.Items.Add(trayStatus);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("Open", null, (_, __) => ShowWindow()).Font = Theme.Semibold(9f);
            menu.Items.Add("Open live view", null, (_, __) => OpenLive());
            menu.Items.Add("Restart relay", null, (_, __) => { engine.RestartRelay(); engine.SyncNow(); });
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("Exit", null, (_, __) => ExitApp());
            tray.ContextMenuStrip = menu;
            tray.DoubleClick += (_, __) => ShowWindow();
            tray.BalloonTipClicked += (_, __) => ShowWindow();
            tray.Visible = true;
        }

        public void ShowWindow()
        {
            if (!Visible) Show();
            if (WindowState == FormWindowState.Minimized) WindowState = FormWindowState.Normal;
            Activate();
            BringToFront();
        }

        void Render()
        {
            var sync = engine.LastSync;
            header.Subtitle = (sync?.SchoolName != null ? sync.SchoolName + "  ·  " : "") + "Version " + AppInfo.Version;

            if (!settings.IsConfigured)
            {
                engine.Server.Set(Health.Off, "Not connected", "Click Settings and paste the connection key from MyCampusView.");
            }
            serverCard.Bind(engine.Server);
            recorderCard.Bind(engine.Recorder);
            relayCard.Bind(engine.Relay);
            tunnelCard.Bind(engine.Tunnel);

            string pill;
            switch (engine.Overall)
            {
                case Health.Good: pill = "Everything is working"; break;
                case Health.Warning: pill = "Working, with warnings"; break;
                case Health.Bad: pill = "Needs attention"; break;
                default: pill = "Checking…"; break;
            }
            header.SetPill(pill, Theme.Of(engine.Overall == Health.Unknown ? Health.Off : engine.Overall));
            var tip = AppInfo.Name + " – " + pill;
            tray.Text = tip.Length > 63 ? tip.Substring(0, 63) : tip;
            trayStatus.Text = pill;

            fixBtn.Visible = engine.OtherRelays.Count > 0;
            liveBtn.Enabled = !string.IsNullOrEmpty(sync?.LiveUrl);
            checkBtn.Enabled = sync?.NvrHost != null && engine.Cameras.Count > 0 && checkBtn.Text == "Check cameras";

            camerasLabel.Text = engine.Cameras.Count > 0 ? "Cameras (" + engine.Cameras.Count + ")" : "Cameras";
            list.BeginUpdate();
            while (list.Items.Count > engine.Cameras.Count) list.Items.RemoveAt(list.Items.Count - 1);
            for (int i = 0; i < engine.Cameras.Count; i++)
            {
                var c = engine.Cameras[i];
                var values = new[] { "CH " + c.Camera.Channel, c.Camera.Name, c.State, c.Codec };
                ListViewItem item;
                if (i < list.Items.Count) item = list.Items[i];
                else
                {
                    item = new ListViewItem(values[0]);
                    for (int k = 1; k < values.Length; k++) item.SubItems.Add("");
                    item.UseItemStyleForSubItems = false;
                    list.Items.Add(item);
                }
                item.ImageKey = c.Health.ToString();
                for (int k = 0; k < values.Length; k++)
                    if (item.SubItems[k].Text != values[k]) item.SubItems[k].Text = values[k];
                item.SubItems[2].ForeColor = c.Health == Health.Bad ? Theme.Bad : c.Health == Health.Warning ? Theme.Warn : Theme.Ink;
                item.SubItems[3].ForeColor = c.Codec == "H.265" ? Theme.Warn : Theme.Muted;
            }
            list.EndUpdate();

            emptyLabel.Visible = engine.Cameras.Count == 0;
            emptyLabel.Text = !settings.IsConfigured
                ? "Connect this PC to MyCampusView to see your cameras here."
                : sync == null ? "Fetching your camera list…" : sync.Message ?? "No cameras yet. Add them in MyCampusView → Settings → CCTV.";
            if (emptyLabel.Visible) emptyLabel.BringToFront();
        }

        void OpenLive()
        {
            var url = engine.LastSync?.LiveUrl;
            if (string.IsNullOrEmpty(url)) return;
            try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); } catch { }
        }

        void FixOtherRelay()
        {
            var shortcuts = RelayEngine.ManualStartupShortcuts();
            var msg = "Another copy of MediaMTX is running:\n\n" + string.Join("\n", engine.OtherRelays) +
                      "\n\nThis app replaces it. Stop it now?";
            if (shortcuts.Count > 0) msg += "\n\nIts Startup shortcut will also be removed so it does not come back after a restart.";
            if (MessageBox.Show(this, msg, AppInfo.Name, MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
            engine.StopOtherRelays(removeShortcuts: shortcuts.Count > 0);
        }

        void ShowLog()
        {
            if (logForm == null || logForm.IsDisposed) logForm = new LogForm();
            logForm.Show();
            logForm.Activate();
        }

        void OpenSettings(bool firstRun)
        {
            ShowWindow();
            using (var f = new SetupForm(settings, firstRun))
            {
                if (f.ShowDialog(this) == DialogResult.OK)
                {
                    settings = f.Result;
                    try { Installer.SetStartWithWindows(settings.StartWithWindows && Installer.RunningInstalled); }
                    catch (Exception e) { Log.Warn("Could not update start-up setting: " + e.Message); }
                    engine.Reconfigure(settings);
                    Render();
                }
                else if (f.Uninstalled)
                {
                    reallyExit = true;
                    Close();
                }
            }
        }

        void ExitApp()
        {
            var r = MessageBox.Show(this, "Live CCTV stops for everyone until the relay is started again.\n\nExit the CCTV relay?", AppInfo.Name, MessageBoxButtons.YesNo, MessageBoxIcon.Warning, MessageBoxDefaultButton.Button2);
            if (r != DialogResult.Yes) return;
            reallyExit = true;
            Close();
        }

        public void ExitForUpdate()
        {
            reallyExit = true;
            Close();
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            if (!reallyExit && e.CloseReason == CloseReason.UserClosing)
            {
                e.Cancel = true;
                Hide();
                if (!hintShown)
                {
                    hintShown = true;
                    tray.ShowBalloonTip(5000, "Still running", "The CCTV relay keeps working in the background. Double-click this icon to open it.", ToolTipIcon.Info);
                }
                return;
            }
            base.OnFormClosing(e);
        }

        protected override void OnFormClosed(FormClosedEventArgs e)
        {
            tray.Visible = false;
            tray.Dispose();
            engine.Dispose();
            Log.Info("App closed.");
            base.OnFormClosed(e);
        }
    }
}
