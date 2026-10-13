using System;
using System.Diagnostics;
using System.Drawing;
using System.Windows.Forms;

namespace MyCampusView.CctvRelay.Ui
{
    /// <summary>Live tail of the (already redacted) log.</summary>
    sealed class LogForm : Form
    {
        readonly TextBox box = new TextBox();

        public LogForm()
        {
            SuspendLayout();
            AutoScaleDimensions = new SizeF(96F, 96F);
            AutoScaleMode = AutoScaleMode.Dpi;
            Text = "Relay log – " + AppInfo.Name;
            Icon = AppInfo.AppIcon;
            ClientSize = new Size(980, 560);
            StartPosition = FormStartPosition.CenterScreen;
            Font = Theme.Ui(9f);

            box.Multiline = true;
            box.ReadOnly = true;
            box.ScrollBars = ScrollBars.Both;
            box.WordWrap = false;
            box.Dock = DockStyle.Fill;
            box.Font = new Font("Consolas", 9f);
            box.BackColor = Color.FromArgb(15, 23, 42);
            box.ForeColor = Color.FromArgb(226, 232, 240);
            box.BorderStyle = BorderStyle.None;

            var footer = new FlowLayoutPanel { Dock = DockStyle.Bottom, Height = 52, Padding = new Padding(12, 11, 0, 0), BackColor = Color.White };
            var copy = new FlatBtn("Copy all");
            var folder = new FlatBtn("Open log folder");
            var note = new Label { Text = "Passwords and keys are hidden in this log.", AutoSize = true, ForeColor = Theme.Muted, Margin = new Padding(8, 8, 0, 0) };
            copy.Click += (_, __) => { if (box.TextLength > 0) Clipboard.SetText(box.Text); };
            folder.Click += (_, __) => { try { Process.Start("explorer.exe", "\"" + AppInfo.LogDir + "\""); } catch { } };
            footer.Controls.AddRange(new Control[] { copy, folder, note });

            Controls.Add(box);
            Controls.Add(footer);
            ResumeLayout(false);

            box.Text = string.Join(Environment.NewLine, Log.Snapshot()) + Environment.NewLine;
            Log.Line += OnLine;
        }

        protected override void OnShown(EventArgs e)
        {
            base.OnShown(e);
            box.SelectionStart = box.TextLength;
            box.ScrollToCaret();
        }

        void OnLine(string line)
        {
            if (IsDisposed || !IsHandleCreated) return;
            BeginInvoke(new Action(() =>
            {
                if (box.TextLength > 2_000_000) box.Text = box.Text.Substring(box.TextLength - 1_000_000);
                box.AppendText(line + Environment.NewLine);
            }));
        }

        protected override void OnFormClosed(FormClosedEventArgs e)
        {
            Log.Line -= OnLine;
            base.OnFormClosed(e);
        }
    }
}
