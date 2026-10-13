using System;
using System.Collections.Generic;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Web.Script.Serialization;

namespace MyCampusView.CctvRelay
{
    /// <summary>
    /// Saved on this PC only. The connection key and recorder password are
    /// encrypted with Windows DPAPI for the signed-in user, so the file is
    /// useless if copied to another PC or account.
    /// </summary>
    sealed class AppSettings
    {
        static readonly byte[] Entropy = Encoding.UTF8.GetBytes("MyCampusView.CctvRelay.v1");

        public string ServerUrl { get; set; } = AppInfo.DefaultServer;
        public string ConnectionKey { get; set; } = "";
        public string RecorderPassword { get; set; } = "";
        public bool StartWithWindows { get; set; } = true;

        public bool IsConfigured => !string.IsNullOrEmpty(ConnectionKey);

        public static AppSettings Load()
        {
            var s = new AppSettings();
            try
            {
                if (!File.Exists(AppInfo.SettingsFile)) return s;
                var json = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(File.ReadAllText(AppInfo.SettingsFile));
                if (json.TryGetValue("serverUrl", out var url) && url is string u && u.Length > 0) s.ServerUrl = u;
                if (json.TryGetValue("key", out var k) && k is string ks) s.ConnectionKey = Unprotect(ks);
                if (json.TryGetValue("password", out var p) && p is string ps) s.RecorderPassword = Unprotect(ps);
                if (json.TryGetValue("startWithWindows", out var sw) && sw is bool b) s.StartWithWindows = b;
            }
            catch (Exception e)
            {
                Log.Warn("Could not read saved settings: " + e.Message);
            }
            return s;
        }

        public void Save()
        {
            Directory.CreateDirectory(AppInfo.DataDir);
            var json = new JavaScriptSerializer().Serialize(new Dictionary<string, object>
            {
                ["serverUrl"] = ServerUrl,
                ["key"] = Protect(ConnectionKey),
                ["password"] = Protect(RecorderPassword),
                ["startWithWindows"] = StartWithWindows,
            });
            var tmp = AppInfo.SettingsFile + ".tmp";
            File.WriteAllText(tmp, json, Encoding.UTF8);
            if (File.Exists(AppInfo.SettingsFile)) File.Replace(tmp, AppInfo.SettingsFile, null);
            else File.Move(tmp, AppInfo.SettingsFile);
        }

        static string Protect(string plain)
        {
            if (string.IsNullOrEmpty(plain)) return "";
            var bytes = ProtectedData.Protect(Encoding.UTF8.GetBytes(plain), Entropy, DataProtectionScope.CurrentUser);
            return Convert.ToBase64String(bytes);
        }

        static string Unprotect(string stored)
        {
            if (string.IsNullOrEmpty(stored)) return "";
            var bytes = ProtectedData.Unprotect(Convert.FromBase64String(stored), Entropy, DataProtectionScope.CurrentUser);
            return Encoding.UTF8.GetString(bytes);
        }

        /// <summary>https anywhere; plain http only for local testing.</summary>
        public static string NormaliseServer(string raw)
        {
            var value = (raw ?? "").Trim().TrimEnd('/');
            if (value.Length == 0) return AppInfo.DefaultServer;
            if (!value.Contains("://")) value = "https://" + value;
            if (!Uri.TryCreate(value, UriKind.Absolute, out var uri)) return null;
            var local = uri.Host == "localhost" || uri.Host == "127.0.0.1" || uri.Host.EndsWith(".lvh.me", StringComparison.OrdinalIgnoreCase) || uri.Host == "lvh.me";
            if (uri.Scheme != "https" && !(local && uri.Scheme == "http")) return null;
            return uri.GetLeftPart(UriPartial.Authority);
        }
    }
}
