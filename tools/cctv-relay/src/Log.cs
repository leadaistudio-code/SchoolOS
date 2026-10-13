using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;

namespace MyCampusView.CctvRelay
{
    /// <summary>
    /// Rolling log in the data folder plus an in-memory tail for the log
    /// window. Every line passes through <see cref="Redact"/> first, so
    /// recorder passwords and the connection key never reach the disk.
    /// </summary>
    static class Log
    {
        const long MaxBytes = 5 * 1024 * 1024;
        const int TailLines = 3000;
        static readonly object Gate = new object();
        static readonly LinkedList<string> Tail = new LinkedList<string>();
        static readonly Regex RtspCredentials = new Regex(@"(rtsps?://)[^\s/@']+@", RegexOptions.Compiled);
        static readonly Regex RelayKey = new Regex(@"mcvr_[A-Za-z0-9-]+_[A-Za-z0-9_-]{8,}", RegexOptions.Compiled);
        static readonly List<string> Secrets = new List<string>();

        public static event Action<string> Line;

        static string FilePath => Path.Combine(AppInfo.LogDir, "relay.log");

        /// <summary>Strings that must never appear in the log, in plain and URL-encoded form.</summary>
        public static void SetSecrets(params string[] secrets)
        {
            lock (Gate)
            {
                Secrets.Clear();
                foreach (var s in secrets)
                {
                    if (string.IsNullOrEmpty(s) || s.Length < 3) continue;
                    Secrets.Add(s);
                    var enc = Uri.EscapeDataString(s);
                    if (enc != s) Secrets.Add(enc);
                }
                Secrets.Sort((a, b) => b.Length.CompareTo(a.Length));
            }
        }

        public static string Redact(string text)
        {
            if (string.IsNullOrEmpty(text)) return text;
            text = RtspCredentials.Replace(text, "$1***@");
            text = RelayKey.Replace(text, "mcvr_***");
            lock (Gate)
            {
                foreach (var s in Secrets) text = text.Replace(s, "***");
            }
            return text;
        }

        public static void Info(string message) => Write("INF", message);
        public static void Warn(string message) => Write("WAR", message);
        public static void Error(string message) => Write("ERR", message);

        /// <summary>MediaMTX output, which already carries its own timestamp and level.</summary>
        public static void Relay(string line) => WriteRaw(line);

        static void Write(string level, string message) =>
            WriteRaw(DateTime.Now.ToString("yyyy/MM/dd HH:mm:ss") + " " + level + " [app] " + message);

        static void WriteRaw(string line)
        {
            line = Redact(line);
            lock (Gate)
            {
                Tail.AddLast(line);
                while (Tail.Count > TailLines) Tail.RemoveFirst();
                try
                {
                    Directory.CreateDirectory(AppInfo.LogDir);
                    var fi = new FileInfo(FilePath);
                    if (fi.Exists && fi.Length > MaxBytes)
                    {
                        var old = Path.Combine(AppInfo.LogDir, "relay.1.log");
                        if (File.Exists(old)) File.Delete(old);
                        File.Move(FilePath, old);
                    }
                    File.AppendAllText(FilePath, line + Environment.NewLine, Encoding.UTF8);
                }
                catch
                {
                    // A full disk or locked file must not take the relay down.
                }
            }
            Line?.Invoke(line);
        }

        public static string[] Snapshot()
        {
            lock (Gate)
            {
                var arr = new string[Tail.Count];
                Tail.CopyTo(arr, 0);
                return arr;
            }
        }
    }
}
