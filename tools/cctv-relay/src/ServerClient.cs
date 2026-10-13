using System;
using System.Collections;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;

namespace MyCampusView.CctvRelay
{
    sealed class RelayCamera
    {
        public string Path;
        public string HdPath;
        public string Name;
        public int Channel;
    }

    sealed class SyncResult
    {
        public string SchoolName;
        public string LiveUrl;
        public string StreamBaseUrl;
        public bool Enabled;
        public string NvrHost;
        public int NvrPort = 554;
        public string NvrUsername = "";
        public List<RelayCamera> Cameras = new List<RelayCamera>();
        public string Config;
        public string PasswordPlaceholder;
        public string Message;
        public int PollSeconds = 120;
    }

    sealed class SyncException : Exception
    {
        public readonly bool KeyRejected;
        public SyncException(string message, bool keyRejected = false) : base(message) { KeyRejected = keyRejected; }
    }

    static class ServerClient
    {
        static readonly HttpClient Http;

        static ServerClient()
        {
            ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
            Http = new HttpClient { Timeout = TimeSpan.FromSeconds(20) };
            Http.DefaultRequestHeaders.UserAgent.ParseAdd("MyCampusView-CCTV-Relay/" + AppInfo.Version);
        }

        public static bool LooksLikeKey(string key) =>
            Regex.IsMatch((key ?? "").Trim(), @"^mcvr_[A-Za-z0-9-]{3,64}_[A-Za-z0-9_-]{32,64}$");

        public static async Task<SyncResult> SyncAsync(string server, string key, CancellationToken ct)
        {
            var req = new HttpRequestMessage(HttpMethod.Post, server.TrimEnd('/') + "/api/v1/cctv/relay/sync");
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", key.Trim());
            var body = new JavaScriptSerializer().Serialize(new Dictionary<string, object> { ["appVersion"] = AppInfo.Version });
            req.Content = new StringContent(body, Encoding.UTF8, "application/json");

            HttpResponseMessage res;
            try
            {
                res = await Http.SendAsync(req, ct).ConfigureAwait(false);
            }
            catch (TaskCanceledException) when (!ct.IsCancellationRequested)
            {
                throw new SyncException("MyCampusView did not answer in time. Check this PC's internet connection.");
            }
            catch (HttpRequestException e)
            {
                throw new SyncException("Cannot reach MyCampusView (" + Root(e).Message + "). Check this PC's internet connection.");
            }

            using (res)
            {
                var text = await res.Content.ReadAsStringAsync().ConfigureAwait(false);
                Dictionary<string, object> json = null;
                try { json = new JavaScriptSerializer { MaxJsonLength = 8 * 1024 * 1024 }.Deserialize<Dictionary<string, object>>(text); }
                catch { /* not JSON, e.g. a proxy error page */ }

                if (res.StatusCode == HttpStatusCode.Unauthorized || res.StatusCode == HttpStatusCode.Forbidden)
                    throw new SyncException(ErrorMessage(json) ?? "The connection key was not accepted.", keyRejected: true);
                if (!res.IsSuccessStatusCode || json == null)
                    throw new SyncException(ErrorMessage(json) ?? "MyCampusView answered " + (int)res.StatusCode + ". It will try again shortly.");

                return Parse(json);
            }
        }

        static Exception Root(Exception e)
        {
            while (e.InnerException != null) e = e.InnerException;
            return e;
        }

        static string ErrorMessage(Dictionary<string, object> json)
        {
            if (json != null && json.TryGetValue("error", out var err) && err is Dictionary<string, object> e && e.TryGetValue("message", out var m))
                return m as string;
            return null;
        }

        static SyncResult Parse(Dictionary<string, object> j)
        {
            var r = new SyncResult
            {
                SchoolName = Str(j, "schoolName") ?? "Your school",
                LiveUrl = Str(j, "liveUrl"),
                StreamBaseUrl = Str(j, "streamBaseUrl"),
                Enabled = j.TryGetValue("enabled", out var en) && en is bool b && b,
                Config = Str(j, "config"),
                PasswordPlaceholder = Str(j, "passwordPlaceholder") ?? "__MCV_DVR_PASSWORD__",
                Message = Str(j, "message"),
            };
            if (j.TryGetValue("pollSeconds", out var ps) && ps is int poll) r.PollSeconds = Math.Max(30, Math.Min(900, poll));
            if (j.TryGetValue("nvr", out var nvrObj) && nvrObj is Dictionary<string, object> nvr)
            {
                r.NvrHost = Str(nvr, "host");
                if (nvr.TryGetValue("port", out var port) && port is int p) r.NvrPort = p;
                r.NvrUsername = Str(nvr, "username") ?? "";
            }
            if (j.TryGetValue("cameras", out var camsObj) && camsObj is ArrayList cams)
            {
                foreach (var o in cams)
                {
                    if (!(o is Dictionary<string, object> c)) continue;
                    r.Cameras.Add(new RelayCamera
                    {
                        Path = Str(c, "path"),
                        HdPath = Str(c, "hdPath"),
                        Name = Str(c, "name") ?? "Camera",
                        Channel = c.TryGetValue("channel", out var ch) && ch is int chn ? chn : 0,
                    });
                }
            }
            return r;
        }

        static string Str(Dictionary<string, object> d, string key) => d.TryGetValue(key, out var v) ? v as string : null;

        /// <summary>
        /// Asks the tunnel address for a path that needs a viewing token. A 401
        /// from MediaMTX proves the whole chain works: DNS, Cloudflare, the
        /// tunnel, this PC and the relay.
        /// </summary>
        public static async Task<(bool ok, string message)> CheckTunnelAsync(string streamBaseUrl, CancellationToken ct)
        {
            try
            {
                using (var res = await Http.GetAsync(streamBaseUrl.TrimEnd('/') + "/mcv-health/index.m3u8", ct).ConfigureAwait(false))
                {
                    var code = (int)res.StatusCode;
                    if (code == 401 || code == 403 || code == 404) return (true, "Reachable from the internet");
                    if (code == 502 || code == 504) return (false, "The tunnel reaches this PC, but the relay is not answering");
                    if (code == 530 || code == 1033) return (false, "The Cloudflare tunnel is offline. Check that the cloudflared service is running on this PC");
                    return (false, "Unexpected answer " + code + " from the stream address");
                }
            }
            catch (TaskCanceledException) when (!ct.IsCancellationRequested)
            {
                return (false, "The stream address did not answer in time");
            }
            catch (HttpRequestException e)
            {
                return (false, "Cannot reach the stream address (" + Root(e).Message + ")");
            }
        }
    }
}
