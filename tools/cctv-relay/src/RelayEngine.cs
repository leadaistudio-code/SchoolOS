using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.ServiceProcess;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;

namespace MyCampusView.CctvRelay
{
    enum Health { Unknown, Good, Warning, Bad, Off }

    sealed class StatusItem
    {
        public Health Health = Health.Unknown;
        public string Headline = "Checking…";
        public string Detail = "";

        public void Set(Health health, string headline, string detail = "")
        {
            Health = health;
            Headline = headline;
            Detail = detail ?? "";
        }
    }

    sealed class CameraState
    {
        public RelayCamera Camera;
        public Health Health = Health.Unknown;
        public string State = "Idle – starts when someone watches";
        public string Codec = "";
    }

    /// <summary>
    /// Keeps MediaMTX running with the camera list from MyCampusView. All
    /// state lives on the UI thread: background work posts back to it, so
    /// nothing here needs locking.
    /// </summary>
    sealed class RelayEngine : IDisposable
    {
        public readonly StatusItem Server = new StatusItem();
        public readonly StatusItem Recorder = new StatusItem();
        public readonly StatusItem Relay = new StatusItem();
        public readonly StatusItem Tunnel = new StatusItem();
        public SyncResult LastSync { get; private set; }
        public DateTime? LastSyncAt { get; private set; }
        public bool KeyRejected { get; private set; }
        public List<string> OtherRelays { get; private set; } = new List<string>();
        public readonly List<CameraState> Cameras = new List<CameraState>();
        public int Viewers => sessions.Count;

        public event Action Changed;
        public event Action<string, string, bool> Notify; // title, text, isProblem

        readonly SynchronizationContext ui;
        AppSettings settings;
        CancellationTokenSource cts;
        CancellationTokenSource wake;
        Process mtx;
        bool stopping;
        string runningConfig;
        int restartAttempts;
        DateTime startedAt;
        bool loginRejected;
        DateTime nextProbe = DateTime.MinValue;
        readonly HashSet<string> sessions = new HashSet<string>();
        Health lastOverall = Health.Unknown;

        public RelayEngine(SynchronizationContext uiContext)
        {
            ui = uiContext;
            Recorder.Set(Health.Unknown, "Waiting for camera list");
            Relay.Set(Health.Off, "Not started");
            Tunnel.Set(Health.Unknown, "Waiting");
        }

        public Health Overall
        {
            get
            {
                var all = new[] { Server.Health, Recorder.Health, Relay.Health, Tunnel.Health };
                if (all.Contains(Health.Bad)) return Health.Bad;
                if (all.Contains(Health.Warning) || all.Contains(Health.Off)) return Health.Warning;
                if (all.All(h => h == Health.Good)) return Health.Good;
                return Health.Unknown;
            }
        }

        public async void Start(AppSettings s)
        {
            settings = s;
            Log.SetSecrets(s.RecorderPassword, s.ConnectionKey);
            cts?.Cancel();
            cts = new CancellationTokenSource();
            var ct = cts.Token;
            try
            {
                await Task.Run(() => { EnsureMediaMtx(); KillOwnOrphans(); });
            }
            catch (Exception e)
            {
                Relay.Set(Health.Bad, "Could not prepare the relay", e.Message);
                Log.Error("Preparing MediaMTX failed: " + e.Message);
                Raise();
                return;
            }
            await Loop(ct);
        }

        /// <summary>Apply new settings: new key or password.</summary>
        public void Reconfigure(AppSettings s)
        {
            settings = s;
            Log.SetSecrets(s.RecorderPassword, s.ConnectionKey);
            loginRejected = false;
            KeyRejected = false;
            runningConfig = null;
            nextProbe = DateTime.MinValue;
            if (cts == null) Start(s);
            else SyncNow();
        }

        public void SyncNow() => wake?.Cancel();

        async Task Loop(CancellationToken ct)
        {
            while (!ct.IsCancellationRequested)
            {
                var delay = TimeSpan.FromSeconds(30);
                try
                {
                    var sync = await ServerClient.SyncAsync(settings.ServerUrl, settings.ConnectionKey, ct);
                    KeyRejected = false;
                    Apply(sync);
                    delay = TimeSpan.FromSeconds(sync.PollSeconds);
                }
                catch (SyncException e)
                {
                    if (e.KeyRejected)
                    {
                        KeyRejected = true;
                        Server.Set(Health.Bad, "Connection key not accepted", e.Message);
                        StopRelay("The connection key was not accepted");
                        delay = TimeSpan.FromMinutes(5);
                    }
                    else
                    {
                        Server.Set(Health.Warning, "Cannot reach MyCampusView", e.Message + (IsRunning ? " The relay keeps running with the last camera list." : ""));
                        if (!IsRunning && LastSync == null) TryStartFromCache();
                    }
                    Log.Warn(e.Message);
                }
                catch (OperationCanceledException) when (ct.IsCancellationRequested)
                {
                    return;
                }
                catch (Exception e)
                {
                    Server.Set(Health.Warning, "Sync problem", e.Message);
                    Log.Error("Sync failed: " + e);
                }
                Raise();

                if (IsRunning && LastSync != null)
                {
                    await CheckTunnel(ct);
                    if (!loginRejected && DateTime.Now >= nextProbe) await ProbeRecorder(false);
                }

                wake = CancellationTokenSource.CreateLinkedTokenSource(ct);
                try { await Task.Delay(delay, wake.Token); }
                catch (OperationCanceledException) { if (ct.IsCancellationRequested) return; }
            }
        }

        void Apply(SyncResult sync)
        {
            LastSync = sync;
            LastSyncAt = DateTime.Now;
            var known = Cameras.ToDictionary(c => c.Camera.Path ?? "");
            Cameras.Clear();
            foreach (var cam in sync.Cameras)
            {
                if (known.TryGetValue(cam.Path ?? "", out var existing)) { existing.Camera = cam; Cameras.Add(existing); }
                else Cameras.Add(new CameraState { Camera = cam });
            }

            if (!sync.Enabled) Server.Set(Health.Warning, "Connected – live CCTV is switched off", "Switch it on in MyCampusView → Settings → CCTV.");
            else Server.Set(Health.Good, "Connected", sync.SchoolName + " · checked " + DateTime.Now.ToString("h:mm tt"));

            if (sync.Config == null)
            {
                StopRelay(sync.Message ?? "Nothing to relay yet");
                Recorder.Set(Health.Off, "Not set up", sync.Message ?? "");
                return;
            }
            if (Recorder.Health == Health.Unknown || Recorder.Health == Health.Off)
                Recorder.Set(Health.Unknown, sync.NvrHost, "Login not checked yet");

            var yml = sync.Config.Replace(sync.PasswordPlaceholder, EncodeCredential(settings.RecorderPassword));
            var key = Meaningful(yml);
            if (key != runningConfig || !IsRunning)
            {
                var changed = runningConfig != null && key != runningConfig;
                WriteConfig(yml);
                if (changed) Log.Info("Camera list changed in MyCampusView; restarting the relay with " + sync.Cameras.Count + " cameras.");
                runningConfig = key;
                RestartRelay();
                nextProbe = DateTime.MinValue;
            }
        }

        static string EncodeCredential(string s) => Uri.EscapeDataString(s ?? "").Replace("'", "%27");

        /// <summary>Config without comments, so the generated-at line does not count as a change.</summary>
        static string Meaningful(string yml) =>
            string.Join("\n", yml.Split('\n').Select(l => l.TrimEnd('\r')).Where(l => !l.TrimStart().StartsWith("#")));

        static void WriteConfig(string yml)
        {
            Directory.CreateDirectory(AppInfo.MediaMtxDir);
            var tmp = AppInfo.MediaMtxConfig + ".tmp";
            File.WriteAllText(tmp, yml, new UTF8Encoding(false));
            if (File.Exists(AppInfo.MediaMtxConfig)) File.Delete(AppInfo.MediaMtxConfig);
            File.Move(tmp, AppInfo.MediaMtxConfig);
        }

        /// <summary>No internet at start-up: run with the last config so the school's own network keeps working.</summary>
        void TryStartFromCache()
        {
            if (!File.Exists(AppInfo.MediaMtxConfig)) return;
            Log.Info("Starting with the last saved camera list while MyCampusView is unreachable.");
            runningConfig = Meaningful(File.ReadAllText(AppInfo.MediaMtxConfig));
            RestartRelay();
        }

        // ------------------------------------------------------------------
        // MediaMTX process
        // ------------------------------------------------------------------

        public bool IsRunning => mtx != null && !mtx.HasExited;

        static void EnsureMediaMtx()
        {
            var marker = Path.Combine(AppInfo.MediaMtxDir, "version.txt");
            if (File.Exists(AppInfo.MediaMtxExe) && File.Exists(marker) && File.ReadAllText(marker).Trim() == AppInfo.MediaMtxVersion) return;
            Directory.CreateDirectory(AppInfo.MediaMtxDir);
            using (var zip = new ZipArchive(AppInfo.Resource("mediamtx.zip"), ZipArchiveMode.Read))
            {
                foreach (var entry in zip.Entries)
                {
                    if (entry.Name != "mediamtx.exe" && entry.Name != "LICENSE") continue;
                    var dest = Path.Combine(AppInfo.MediaMtxDir, entry.Name);
                    entry.ExtractToFile(dest, true);
                }
            }
            File.WriteAllText(marker, AppInfo.MediaMtxVersion);
            Log.Info("Prepared MediaMTX " + AppInfo.MediaMtxVersion + ".");
        }

        static void KillOwnOrphans()
        {
            foreach (var p in Process.GetProcessesByName("mediamtx"))
            {
                try
                {
                    if (string.Equals(p.MainModule.FileName, AppInfo.MediaMtxExe, StringComparison.OrdinalIgnoreCase))
                    {
                        p.Kill();
                        p.WaitForExit(3000);
                    }
                }
                catch { /* not ours or already gone */ }
            }
        }

        static List<string> FindOtherRelays()
        {
            var list = new List<string>();
            foreach (var p in Process.GetProcessesByName("mediamtx"))
            {
                try
                {
                    var path = p.MainModule.FileName;
                    if (!string.Equals(path, AppInfo.MediaMtxExe, StringComparison.OrdinalIgnoreCase)) list.Add(path);
                }
                catch { list.Add("mediamtx.exe (process " + p.Id + ")"); }
            }
            return list;
        }

        /// <summary>Startup-folder shortcuts from a manual MediaMTX setup.</summary>
        public static List<string> ManualStartupShortcuts()
        {
            var folder = Environment.GetFolderPath(Environment.SpecialFolder.Startup);
            try
            {
                return Directory.GetFiles(folder, "*.lnk").Where(f => Path.GetFileName(f).IndexOf("mediamtx", StringComparison.OrdinalIgnoreCase) >= 0).ToList();
            }
            catch { return new List<string>(); }
        }

        public void StopOtherRelays(bool removeShortcuts)
        {
            foreach (var p in Process.GetProcessesByName("mediamtx"))
            {
                try
                {
                    if (!string.Equals(p.MainModule.FileName, AppInfo.MediaMtxExe, StringComparison.OrdinalIgnoreCase)) { p.Kill(); p.WaitForExit(3000); }
                }
                catch (Exception e) { Log.Warn("Could not stop " + p.ProcessName + ": " + e.Message); }
            }
            if (removeShortcuts)
            {
                foreach (var lnk in ManualStartupShortcuts())
                {
                    try { File.Delete(lnk); Log.Info("Removed startup shortcut " + Path.GetFileName(lnk)); }
                    catch (Exception e) { Log.Warn("Could not remove " + lnk + ": " + e.Message); }
                }
            }
            Log.Info("Stopped the separately started MediaMTX.");
            OtherRelays = new List<string>();
            RestartRelay();
        }

        static bool PortFree(int port)
        {
            try
            {
                var l = new TcpListener(IPAddress.Loopback, port);
                l.Start();
                l.Stop();
                return true;
            }
            catch (SocketException) { return false; }
        }

        public void RestartRelay()
        {
            StopRelay(null);
            if (runningConfig == null || !File.Exists(AppInfo.MediaMtxConfig)) return;

            if (!PortFree(AppInfo.RelayPort))
            {
                OtherRelays = FindOtherRelays();
                if (OtherRelays.Count > 0)
                    Relay.Set(Health.Bad, "Another MediaMTX is already running", OtherRelays[0] + " is using port " + AppInfo.RelayPort + ". Click “Fix” to stop it so this app can take over.");
                else
                    Relay.Set(Health.Bad, "Port " + AppInfo.RelayPort + " is busy", "Another program on this PC is using port " + AppInfo.RelayPort + ". Close it and click Restart relay.");
                Raise();
                return;
            }
            OtherRelays = new List<string>();

            var psi = new ProcessStartInfo(AppInfo.MediaMtxExe, "\"" + AppInfo.MediaMtxConfig + "\"")
            {
                WorkingDirectory = AppInfo.MediaMtxDir,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                StandardOutputEncoding = Encoding.UTF8,
                StandardErrorEncoding = Encoding.UTF8,
            };
            try
            {
                var p = new Process { StartInfo = psi, EnableRaisingEvents = true };
                p.OutputDataReceived += (_, e) => { if (e.Data != null) ui.Post(__ => OnLine(e.Data), null); };
                p.ErrorDataReceived += (_, e) => { if (e.Data != null) ui.Post(__ => OnLine(e.Data), null); };
                p.Exited += (_, __) => ui.Post(___ => OnExited(p), null);
                p.Start();
                p.BeginOutputReadLine();
                p.BeginErrorReadLine();
                mtx = p;
                startedAt = DateTime.Now;
                sessions.Clear();
                Relay.Set(Health.Good, "Running", RelayDetail());
                Log.Info("Relay started.");
            }
            catch (Exception e)
            {
                Relay.Set(Health.Bad, "Could not start the relay", e.Message);
                Log.Error("Starting MediaMTX failed: " + e.Message);
            }
            Raise();
        }

        string RelayDetail()
        {
            var cams = LastSync?.Cameras.Count ?? 0;
            var watching = sessions.Count;
            return cams + " camera" + (cams == 1 ? "" : "s") + (watching > 0 ? " · " + watching + " watching now" : " · nobody watching");
        }

        void StopRelay(string reason)
        {
            var p = mtx;
            mtx = null;
            if (p != null)
            {
                stopping = true;
                try { if (!p.HasExited) { p.Kill(); p.WaitForExit(3000); } }
                catch { }
                stopping = false;
                p.Dispose();
                Log.Info("Relay stopped" + (reason != null ? ": " + reason : "."));
            }
            if (reason != null)
            {
                Relay.Set(Health.Off, "Stopped", reason);
                runningConfig = null;
            }
            sessions.Clear();
            var idle = reason != null ? "Relay stopped" : "Idle – starts when someone watches";
            foreach (var c in Cameras) { c.Health = Health.Unknown; c.State = idle; }
        }

        async void OnExited(Process p)
        {
            if (p != mtx || stopping) return;
            mtx = null;
            var code = 0;
            try { code = p.ExitCode; } catch { }
            if ((DateTime.Now - startedAt).TotalSeconds > 60) restartAttempts = 0;
            restartAttempts++;
            var wait = Math.Min(60, 5 * restartAttempts);
            Relay.Set(Health.Bad, "Relay stopped unexpectedly", "Restarting in " + wait + " seconds (exit code " + code + "). See View log for details.");
            Log.Error("MediaMTX exited with code " + code + "; restarting in " + wait + "s.");
            Raise();
            await Task.Delay(TimeSpan.FromSeconds(wait));
            if (mtx == null && runningConfig != null && !(cts?.IsCancellationRequested ?? true)) RestartRelay();
        }

        // ------------------------------------------------------------------
        // Reading MediaMTX output
        // ------------------------------------------------------------------

        static readonly Regex PathRx = new Regex(@"\[(?:path|muxer) (cam-[a-z0-9]+?)(-hd)?\]", RegexOptions.Compiled);
        static readonly Regex CodecRx = new Regex(@"online, \d+ tracks? \(([^)]+)\)", RegexOptions.Compiled);
        static readonly Regex SessionRx = new Regex(@"\[HLS\] \[session ([0-9a-f]+)\] (created|closed)", RegexOptions.Compiled);

        void OnLine(string line)
        {
            Log.Relay(line);

            var sm = SessionRx.Match(line);
            if (sm.Success)
            {
                if (sm.Groups[2].Value == "created") sessions.Add(sm.Groups[1].Value);
                else sessions.Remove(sm.Groups[1].Value);
                if (Relay.Health == Health.Good) Relay.Detail = RelayDetail();
                Raise();
                return;
            }

            if (line.Contains("listen tcp") && line.Contains(":" + AppInfo.RelayPort))
            {
                Relay.Set(Health.Bad, "Port " + AppInfo.RelayPort + " is busy", "Another program is using it. Close it and click Restart relay.");
                Raise();
                return;
            }

            var m = PathRx.Match(line);
            if (!m.Success) return;
            var cam = Cameras.FirstOrDefault(c => c.Camera.Path == m.Groups[1].Value);
            var hd = m.Groups[2].Success;
            if (cam == null) return;

            if (line.Contains("stream is available and online"))
            {
                var codec = Friendly(CodecRx.Match(line).Groups[1].Value);
                if (!hd) cam.Codec = codec;
                var h265 = codec.Contains("H.265");
                cam.Health = h265 ? Health.Warning : Health.Good;
                cam.State = (hd ? "Live in HD" : "Live") + (h265 ? " – H.265 may not play in some browsers" : "");
                if (Recorder.Health != Health.Warning || !h265)
                    Recorder.Set(h265 ? Health.Warning : Health.Good, h265 ? "Login OK – switch cameras to H.264" : "Login OK", LastSync?.NvrHost + (h265 ? " · set Sub Stream compression to H.264 on the recorder" : ""));
                loginRejected = false;
            }
            else if (line.Contains("bad status code: 401") || line.Contains("bad status code: 403"))
            {
                cam.Health = Health.Bad;
                cam.State = "Wrong recorder username or password";
                SetLoginRejected();
            }
            else if (line.Contains("bad status code: 404"))
            {
                cam.Health = Health.Bad;
                cam.State = "The recorder has no channel " + cam.Camera.Channel;
            }
            else if (line.Contains("forcibly closed") || line.Contains("connection reset"))
            {
                cam.Health = Health.Bad;
                cam.State = "The recorder closed the connection";
                Recorder.Set(Health.Bad, "Recorder refused the video request", "Turn off “RTSP over TLS” and allow this PC in the recorder's firewall.");
            }
            else if (line.Contains("connectex") || line.Contains("i/o timeout") || line.Contains("no route to host"))
            {
                cam.Health = Health.Bad;
                cam.State = "Cannot reach the recorder";
                Recorder.Set(Health.Bad, "Recorder not reachable", "Check that " + LastSync?.NvrHost + " is right and this PC is on the same network.");
            }
            else if (line.Contains("[RTSP source] started"))
            {
                cam.Health = Health.Unknown;
                cam.State = "Connecting…";
            }
            else if (line.Contains("[RTSP source] stopped") && !hd && cam.Health != Health.Bad)
            {
                cam.Health = Health.Unknown;
                cam.State = "Idle – starts when someone watches";
            }
            Raise();
        }

        void SetLoginRejected()
        {
            loginRejected = true;
            var user = LastSync?.NvrUsername;
            Recorder.Set(Health.Bad, "Wrong recorder username or password",
                "The recorder rejected the login" + (string.IsNullOrEmpty(user) ? "" : " for “" + user + "”") + ". Fix the password in Settings, or the username in MyCampusView.");
        }

        static string Friendly(string codec)
        {
            var c = (codec ?? "").ToUpperInvariant();
            if (c.Contains("H265") || c.Contains("HEVC")) return "H.265";
            if (c.Contains("H264")) return "H.264";
            return codec ?? "";
        }

        // ------------------------------------------------------------------
        // Checks
        // ------------------------------------------------------------------

        public async Task ProbeRecorder(bool allCameras)
        {
            var sync = LastSync;
            if (sync?.NvrHost == null || sync.Cameras.Count == 0) return;
            nextProbe = DateTime.Now.AddMinutes(15);
            var targets = allCameras ? Cameras.ToList() : Cameras.Take(1).ToList();
            var h265 = 0;
            foreach (var cam in targets)
            {
                var r = await RtspProbe.DescribeAsync(sync.NvrHost, sync.NvrPort, sync.NvrUsername, settings.RecorderPassword, cam.Camera.Channel);
                switch (r.Outcome)
                {
                    case ProbeOutcome.Ok:
                        cam.Codec = r.Codec;
                        if (r.Codec == "H.265") h265++;
                        if (cam.State.StartsWith("Idle") || cam.Health == Health.Bad)
                        {
                            cam.Health = r.CodecPlaysEverywhere ? Health.Good : Health.Warning;
                            cam.State = r.CodecPlaysEverywhere ? "Ready" : "Ready – H.265 may not play in some browsers";
                        }
                        break;
                    case ProbeOutcome.NoSuchChannel:
                        cam.Health = Health.Bad;
                        cam.State = "The recorder has no channel " + cam.Camera.Channel;
                        break;
                    case ProbeOutcome.WrongLogin:
                        cam.Health = Health.Bad;
                        cam.State = "Wrong recorder username or password";
                        SetLoginRejected();
                        Raise();
                        return; // stop here: repeated failures can lock the recorder account
                    case ProbeOutcome.Refused:
                        Recorder.Set(Health.Bad, "RTSP is switched off on the recorder", "Turn on RTSP (port " + sync.NvrPort + ") in the recorder's Network → Port settings.");
                        Raise();
                        return;
                    case ProbeOutcome.Blocked:
                        Recorder.Set(Health.Bad, "Recorder refused the video request", "Turn off “RTSP over TLS” and allow this PC in the recorder's firewall.");
                        Raise();
                        return;
                    case ProbeOutcome.Unreachable:
                        Recorder.Set(Health.Bad, "Recorder not reachable", "Check that " + sync.NvrHost + " is right and this PC is on the same network.");
                        Raise();
                        return;
                    default:
                        Recorder.Set(Health.Warning, "Recorder check failed", r.Detail);
                        Raise();
                        return;
                }
                Raise();
            }
            loginRejected = false;
            if (h265 > 0)
                Recorder.Set(Health.Warning, "Login OK – switch cameras to H.264", h265 + " camera" + (h265 == 1 ? "" : "s") + " send H.265, which many browsers and phones cannot play. Set Sub Stream compression to H.264 on the recorder.");
            else
                Recorder.Set(Health.Good, "Login OK", sync.NvrHost + (allCameras ? " · all cameras checked" : ""));
            Raise();
        }

        async Task CheckTunnel(CancellationToken ct)
        {
            var url = LastSync?.StreamBaseUrl;
            if (string.IsNullOrEmpty(url))
            {
                Tunnel.Set(Health.Warning, "Stream address not set", "Add your Cloudflare tunnel address in MyCampusView → Settings → CCTV.");
                Raise();
                return;
            }
            var host = Uri.TryCreate(url, UriKind.Absolute, out var u) ? u.Host : url;
            if (host == "localhost" || host == "127.0.0.1")
            {
                Tunnel.Set(Health.Good, "Local test address", url);
                Raise();
                return;
            }
            var (ok, message) = await ServerClient.CheckTunnelAsync(url, ct);
            if (ok) Tunnel.Set(Health.Good, "Reachable", host);
            else
            {
                var svc = CloudflaredService();
                if (svc == null) message += ". cloudflared is not installed as a service on this PC.";
                else if (svc != ServiceControllerStatus.Running) message += ". The cloudflared service is " + svc.ToString().ToLowerInvariant() + ".";
                Tunnel.Set(Health.Bad, "Not reachable", message);
            }
            Raise();
        }

        static ServiceControllerStatus? CloudflaredService()
        {
            try
            {
                var s = ServiceController.GetServices().FirstOrDefault(x => x.ServiceName.IndexOf("cloudflared", StringComparison.OrdinalIgnoreCase) >= 0);
                return s?.Status;
            }
            catch { return null; }
        }

        void Raise()
        {
            Changed?.Invoke();
            var overall = Overall;
            if (overall != lastOverall)
            {
                if (overall == Health.Bad && lastOverall != Health.Unknown) Notify?.Invoke("CCTV relay needs attention", FirstProblem(), true);
                else if (overall == Health.Good && lastOverall == Health.Bad) Notify?.Invoke("CCTV relay is working again", "All checks are green.", false);
                lastOverall = overall;
            }
        }

        public string FirstProblem()
        {
            foreach (var s in new[] { Server, Relay, Recorder, Tunnel })
                if (s.Health == Health.Bad) return s.Headline + (s.Detail.Length > 0 ? ". " + s.Detail : "");
            return "";
        }

        public void Dispose()
        {
            cts?.Cancel();
            StopRelay(null);
        }
    }
}
