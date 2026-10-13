using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.Windows.Forms;

namespace MyCampusView.CctvRelay.Ui
{
    static class Theme
    {
        public static readonly Color Navy = Color.FromArgb(0, 32, 70);
        public static readonly Color Navy2 = Color.FromArgb(30, 44, 92);
        public static readonly Color Accent = Color.FromArgb(234, 88, 12);
        public static readonly Color AccentHover = Color.FromArgb(194, 65, 12);
        public static readonly Color Page = Color.FromArgb(244, 246, 251);
        public static readonly Color Card = Color.White;
        public static readonly Color Ink = Color.FromArgb(15, 23, 42);
        public static readonly Color Muted = Color.FromArgb(100, 116, 139);
        public static readonly Color Line = Color.FromArgb(226, 232, 240);
        public static readonly Color Good = Color.FromArgb(22, 163, 74);
        public static readonly Color Warn = Color.FromArgb(217, 119, 6);
        public static readonly Color Bad = Color.FromArgb(220, 38, 38);
        public static readonly Color Neutral = Color.FromArgb(148, 163, 184);

        public static Font Ui(float size, FontStyle style = FontStyle.Regular) => new Font("Segoe UI", size, style, GraphicsUnit.Point);
        public static Font Semibold(float size) => new Font("Segoe UI Semibold", size, FontStyle.Regular, GraphicsUnit.Point);

        public static Color Of(Health h)
        {
            switch (h)
            {
                case Health.Good: return Good;
                case Health.Warning: return Warn;
                case Health.Bad: return Bad;
                default: return Neutral;
            }
        }

        public static GraphicsPath Rounded(RectangleF r, float radius)
        {
            var d = radius * 2;
            var p = new GraphicsPath();
            p.AddArc(r.X, r.Y, d, d, 180, 90);
            p.AddArc(r.Right - d, r.Y, d, d, 270, 90);
            p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
            p.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
            p.CloseFigure();
            return p;
        }

        public static void Smooth(Graphics g)
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.PixelOffsetMode = PixelOffsetMode.HighQuality;
        }
    }

    /// <summary>Navy band with the logo, a title, a subtitle and an optional status pill.</summary>
    sealed class HeaderBar : Control
    {
        string subtitle = "";
        string pill;
        Color pillColor = Theme.Neutral;

        public HeaderBar()
        {
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint | ControlStyles.ResizeRedraw, true);
            Dock = DockStyle.Top;
            Height = 84;
            TitleFont = Theme.Semibold(15f);
        }

        public Font TitleFont { get; set; }
        public string Subtitle { get => subtitle; set { subtitle = value ?? ""; Invalidate(); } }

        public void SetPill(string text, Color color)
        {
            pill = text;
            pillColor = color;
            Invalidate();
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics;
            Theme.Smooth(g);
            using (var bg = new LinearGradientBrush(ClientRectangle, Theme.Navy, Theme.Navy2, LinearGradientMode.Horizontal))
                g.FillRectangle(bg, ClientRectangle);
            using (var accent = new SolidBrush(Theme.Accent))
                g.FillRectangle(accent, 0, Height - 3, Width, 3);

            var pad = Height * 0.2f;
            var logo = Height - pad * 2 - 3;
            g.DrawImage(AppInfo.Logo, new RectangleF(pad, pad, logo, logo));

            var textX = (int)(pad * 2 + logo);
            using (var sub = Theme.Ui(9.5f))
            {
                var titleH = TextRenderer.MeasureText(g, Text, TitleFont).Height;
                var subH = string.IsNullOrEmpty(subtitle) ? 0 : TextRenderer.MeasureText(g, subtitle, sub).Height;
                var top = (Height - 3 - titleH - subH) / 2;
                TextRenderer.DrawText(g, Text, TitleFont, new Point(textX, top), Color.White, TextFormatFlags.NoPadding);
                if (subH > 0) TextRenderer.DrawText(g, subtitle, sub, new Point(textX + 1, top + titleH), Color.FromArgb(203, 213, 225), TextFormatFlags.NoPadding);
            }

            if (!string.IsNullOrEmpty(pill))
            {
                using (var f = Theme.Semibold(9.5f))
                {
                    var size = TextRenderer.MeasureText(g, pill, f);
                    var dot = size.Height * 0.55f;
                    var w = size.Width + dot + size.Height * 1.4f;
                    var h = size.Height * 1.7f;
                    var r = new RectangleF(Width - pad - w, (Height - 3 - h) / 2, w, h);
                    using (var path = Theme.Rounded(r, h / 2))
                    using (var b = new SolidBrush(Color.FromArgb(40, 255, 255, 255)))
                        g.FillPath(b, path);
                    using (var b = new SolidBrush(pillColor))
                        g.FillEllipse(b, r.X + h * 0.4f, r.Y + (h - dot) / 2, dot, dot);
                    TextRenderer.DrawText(g, pill, f, new Point((int)(r.X + h * 0.4f + dot * 1.6f), (int)(r.Y + (h - size.Height) / 2)), Color.White, TextFormatFlags.NoPadding);
                }
            }
        }
    }

    /// <summary>One check: a coloured bar, a title, a headline with a dot and a wrapped detail line.</summary>
    sealed class StatusCard : Control
    {
        string title = "", headline = "", detail = "";
        Health health = Health.Unknown;
        readonly Font titleFont = Theme.Semibold(8.25f);
        readonly Font headFont = Theme.Semibold(10.5f);
        readonly Font detailFont = Theme.Ui(8.75f);
        readonly ToolTip tip = new ToolTip();

        public StatusCard()
        {
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint | ControlStyles.ResizeRedraw | ControlStyles.SupportsTransparentBackColor, true);
            BackColor = Theme.Page;
            Margin = new Padding(6);
        }

        public string Title { get => title; set { title = value; Invalidate(); } }

        public void Bind(StatusItem s)
        {
            if (headline == s.Headline && detail == s.Detail && health == s.Health) return;
            headline = s.Headline;
            detail = s.Detail;
            health = s.Health;
            tip.SetToolTip(this, headline + (detail.Length > 0 ? Environment.NewLine + detail : ""));
            Invalidate();
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics;
            Theme.Smooth(g);
            var r = new RectangleF(0.5f, 0.5f, Width - 1.5f, Height - 1.5f);
            var radius = 8f * DeviceDpi / 96f;
            using (var path = Theme.Rounded(r, radius))
            {
                using (var b = new SolidBrush(Theme.Card)) g.FillPath(b, path);
                var clip = g.Clip;
                g.SetClip(path);
                using (var b = new SolidBrush(Theme.Of(health))) g.FillRectangle(b, 0, 0, 4f * DeviceDpi / 96f, Height);
                g.Clip = clip;
                using (var pen = new Pen(Theme.Line)) g.DrawPath(pen, path);
            }

            var s = DeviceDpi / 96f;
            int x = (int)(16 * s), y = (int)(12 * s), w = Width - (int)(26 * s);
            TextRenderer.DrawText(g, title.ToUpperInvariant(), titleFont, new Point(x, y), Theme.Muted, TextFormatFlags.NoPadding);
            y += TextRenderer.MeasureText(g, "A", titleFont).Height + (int)(8 * s);

            var dot = 9 * s;
            var headH = TextRenderer.MeasureText(g, "A", headFont).Height;
            using (var b = new SolidBrush(Theme.Of(health))) g.FillEllipse(b, x, y + (headH - dot) / 2, dot, dot);
            var headRect = new Rectangle(x + (int)(dot + 7 * s), y, w - (int)(dot + 7 * s), headH * 2);
            var flags = TextFormatFlags.NoPadding | TextFormatFlags.WordBreak | TextFormatFlags.EndEllipsis;
            var used = TextRenderer.MeasureText(g, headline, headFont, new Size(headRect.Width, headRect.Height), flags).Height;
            TextRenderer.DrawText(g, headline, headFont, headRect, Theme.Ink, flags);
            y += Math.Min(used, headH * 2) + (int)(5 * s);

            var detailRect = new Rectangle(x, y, w, Height - y - (int)(8 * s));
            TextRenderer.DrawText(g, detail, detailFont, detailRect, Theme.Muted, flags);
        }
    }

    /// <summary>Flat button in the app's style. Primary is filled orange; others are outlined.</summary>
    sealed class FlatBtn : Button
    {
        public FlatBtn(string text, bool primary = false)
        {
            Text = text;
            Primary = primary;
            FlatStyle = FlatStyle.Flat;
            Font = Theme.Semibold(9.5f);
            Cursor = Cursors.Hand;
            AutoSize = true;
            AutoSizeMode = AutoSizeMode.GrowAndShrink;
            Padding = new Padding(12, 5, 12, 5);
            Margin = new Padding(0, 0, 8, 0);
            UseVisualStyleBackColor = false;
            Apply();
        }

        public bool Primary { get; }

        void Apply()
        {
            if (Primary)
            {
                BackColor = Theme.Accent;
                ForeColor = Color.White;
                FlatAppearance.BorderColor = Theme.Accent;
                FlatAppearance.MouseOverBackColor = Theme.AccentHover;
                FlatAppearance.MouseDownBackColor = Theme.AccentHover;
            }
            else
            {
                BackColor = Color.White;
                ForeColor = Theme.Ink;
                FlatAppearance.BorderColor = Color.FromArgb(203, 213, 225);
                FlatAppearance.MouseOverBackColor = Color.FromArgb(241, 245, 249);
                FlatAppearance.MouseDownBackColor = Color.FromArgb(226, 232, 240);
            }
            FlatAppearance.BorderSize = 1;
        }

        protected override void OnEnabledChanged(EventArgs e)
        {
            base.OnEnabledChanged(e);
            if (!Enabled) { BackColor = Color.FromArgb(241, 245, 249); ForeColor = Theme.Neutral; }
            else Apply();
        }
    }
}
