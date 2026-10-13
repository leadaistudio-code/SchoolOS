using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

namespace MyCampusView.CctvRelay
{
    enum ProbeOutcome { Ok, WrongLogin, NoSuchChannel, Refused, Unreachable, Blocked, Failed }

    sealed class ProbeResult
    {
        public ProbeOutcome Outcome;
        public string Codec;   // "H.264", "H.265" or the raw name
        public string Detail;

        public bool CodecPlaysEverywhere => Codec == "H.264";
    }

    /// <summary>
    /// One RTSP DESCRIBE against the recorder, with Digest (or Basic) login.
    /// Tells apart a wrong password, RTSP switched off, an unreachable
    /// recorder and an H.265 stream without pulling any video.
    /// </summary>
    static class RtspProbe
    {
        const int TimeoutMs = 6000;

        public static string StreamUri(string host, int port, int channel, bool hd) =>
            "rtsp://" + host + ":" + port + "/cam/realmonitor?channel=" + channel + "&subtype=" + (hd ? 0 : 1);

        public static async Task<ProbeResult> DescribeAsync(string host, int port, string user, string password, int channel, bool hd = false)
        {
            var uri = StreamUri(host, port, channel, hd);
            try
            {
                using (var client = new TcpClient())
                {
                    var connect = client.ConnectAsync(host, port);
                    if (await Task.WhenAny(connect, Task.Delay(TimeoutMs)).ConfigureAwait(false) != connect)
                        return new ProbeResult { Outcome = ProbeOutcome.Unreachable, Detail = "No answer from " + host + ":" + port };
                    await connect.ConfigureAwait(false);

                    var stream = client.GetStream();
                    stream.ReadTimeout = TimeoutMs;
                    stream.WriteTimeout = TimeoutMs;

                    var first = await SendAsync(stream, uri, 1, null).ConfigureAwait(false);
                    if (first.Status == 401 && !string.IsNullOrEmpty(user))
                    {
                        var auth = BuildAuthorization(first.Headers, "DESCRIBE", uri, user, password ?? "");
                        if (auth == null) return new ProbeResult { Outcome = ProbeOutcome.Failed, Detail = "The recorder asked for an unknown login type" };
                        var second = await SendAsync(stream, uri, 2, auth).ConfigureAwait(false);
                        return Interpret(second);
                    }
                    return Interpret(first);
                }
            }
            catch (SocketException e) when (e.SocketErrorCode == SocketError.ConnectionRefused)
            {
                return new ProbeResult { Outcome = ProbeOutcome.Refused, Detail = "Port " + port + " is closed on the recorder" };
            }
            catch (SocketException e) when (e.SocketErrorCode == SocketError.HostUnreachable || e.SocketErrorCode == SocketError.NetworkUnreachable || e.SocketErrorCode == SocketError.TimedOut || e.SocketErrorCode == SocketError.HostNotFound)
            {
                return new ProbeResult { Outcome = ProbeOutcome.Unreachable, Detail = e.Message };
            }
            catch (IOException e) when (e.InnerException is SocketException se && (se.SocketErrorCode == SocketError.ConnectionReset || se.SocketErrorCode == SocketError.ConnectionAborted))
            {
                return new ProbeResult { Outcome = ProbeOutcome.Blocked, Detail = "The recorder closed the connection" };
            }
            catch (EndOfStreamException)
            {
                return new ProbeResult { Outcome = ProbeOutcome.Blocked, Detail = "The recorder closed the connection" };
            }
            catch (Exception e)
            {
                return new ProbeResult { Outcome = ProbeOutcome.Failed, Detail = e.Message };
            }
        }

        static ProbeResult Interpret(Response r)
        {
            switch (r.Status)
            {
                case 200:
                    return new ProbeResult { Outcome = ProbeOutcome.Ok, Codec = CodecFromSdp(r.Body) };
                case 401:
                case 403:
                    return new ProbeResult { Outcome = ProbeOutcome.WrongLogin, Detail = "The recorder rejected the username or password" };
                case 404:
                    return new ProbeResult { Outcome = ProbeOutcome.NoSuchChannel, Detail = "The recorder has no such channel" };
                default:
                    return new ProbeResult { Outcome = ProbeOutcome.Failed, Detail = "The recorder answered " + r.Status + " " + r.Reason };
            }
        }

        static string CodecFromSdp(string sdp)
        {
            var m = Regex.Match(sdp ?? "", @"a=rtpmap:\d+\s+([A-Za-z0-9-]+)/90000", RegexOptions.IgnoreCase);
            if (!m.Success) return "Unknown";
            var name = m.Groups[1].Value.ToUpperInvariant();
            if (name == "H264") return "H.264";
            if (name == "H265" || name == "HEVC") return "H.265";
            return name;
        }

        sealed class Response
        {
            public int Status;
            public string Reason = "";
            public List<KeyValuePair<string, string>> Headers = new List<KeyValuePair<string, string>>();
            public string Body = "";
        }

        static async Task<Response> SendAsync(NetworkStream stream, string uri, int cseq, string authorization)
        {
            var sb = new StringBuilder();
            sb.Append("DESCRIBE ").Append(uri).Append(" RTSP/1.0\r\n");
            sb.Append("CSeq: ").Append(cseq).Append("\r\n");
            sb.Append("Accept: application/sdp\r\n");
            sb.Append("User-Agent: MyCampusView-CCTV-Relay/").Append(AppInfo.Version).Append("\r\n");
            if (authorization != null) sb.Append("Authorization: ").Append(authorization).Append("\r\n");
            sb.Append("\r\n");
            var bytes = Encoding.ASCII.GetBytes(sb.ToString());
            await stream.WriteAsync(bytes, 0, bytes.Length).ConfigureAwait(false);
            return await ReadResponseAsync(stream).ConfigureAwait(false);
        }

        static async Task<Response> ReadResponseAsync(NetworkStream stream)
        {
            var buffer = new List<byte>(4096);
            var one = new byte[1];
            while (true)
            {
                var read = await ReadWithTimeout(stream, one, 1).ConfigureAwait(false);
                if (read == 0) throw new EndOfStreamException();
                buffer.Add(one[0]);
                var n = buffer.Count;
                if (n >= 4 && buffer[n - 4] == '\r' && buffer[n - 3] == '\n' && buffer[n - 2] == '\r' && buffer[n - 1] == '\n') break;
                if (n > 64 * 1024) throw new InvalidDataException("Response too long");
            }
            var head = Encoding.ASCII.GetString(buffer.ToArray());
            var lines = head.Split(new[] { "\r\n" }, StringSplitOptions.RemoveEmptyEntries);
            var r = new Response();
            var status = Regex.Match(lines.Length > 0 ? lines[0] : "", @"^RTSP/\d\.\d\s+(\d{3})\s*(.*)$");
            if (!status.Success) throw new InvalidDataException("Not an RTSP reply");
            r.Status = int.Parse(status.Groups[1].Value);
            r.Reason = status.Groups[2].Value;
            int contentLength = 0;
            for (int i = 1; i < lines.Length; i++)
            {
                var idx = lines[i].IndexOf(':');
                if (idx <= 0) continue;
                var name = lines[i].Substring(0, idx).Trim();
                var value = lines[i].Substring(idx + 1).Trim();
                r.Headers.Add(new KeyValuePair<string, string>(name, value));
                if (name.Equals("Content-Length", StringComparison.OrdinalIgnoreCase)) int.TryParse(value, out contentLength);
            }
            if (contentLength > 0 && contentLength < 256 * 1024)
            {
                var body = new byte[contentLength];
                var got = 0;
                while (got < contentLength)
                {
                    var read = await ReadWithTimeout(stream, body, contentLength - got, got).ConfigureAwait(false);
                    if (read == 0) break;
                    got += read;
                }
                r.Body = Encoding.UTF8.GetString(body, 0, got);
            }
            return r;
        }

        static async Task<int> ReadWithTimeout(NetworkStream stream, byte[] buffer, int count, int offset = 0)
        {
            var read = stream.ReadAsync(buffer, offset, count);
            if (await Task.WhenAny(read, Task.Delay(TimeoutMs)).ConfigureAwait(false) != read) throw new TimeoutException("The recorder stopped answering");
            return await read.ConfigureAwait(false);
        }

        static string BuildAuthorization(List<KeyValuePair<string, string>> headers, string method, string uri, string user, string password)
        {
            string digest = null, basic = null;
            foreach (var h in headers)
            {
                if (!h.Key.Equals("WWW-Authenticate", StringComparison.OrdinalIgnoreCase)) continue;
                if (h.Value.StartsWith("Digest", StringComparison.OrdinalIgnoreCase)) digest = h.Value;
                else if (h.Value.StartsWith("Basic", StringComparison.OrdinalIgnoreCase)) basic = h.Value;
            }
            if (digest != null)
            {
                var p = ParseParams(digest.Substring(6));
                p.TryGetValue("realm", out var realm);
                p.TryGetValue("nonce", out var nonce);
                p.TryGetValue("qop", out var qop);
                p.TryGetValue("opaque", out var opaque);
                var ha1 = Md5(user + ":" + realm + ":" + password);
                var ha2 = Md5(method + ":" + uri);
                var sb = new StringBuilder();
                sb.Append("Digest username=\"").Append(user).Append("\", realm=\"").Append(realm)
                  .Append("\", nonce=\"").Append(nonce).Append("\", uri=\"").Append(uri).Append('"');
                if (!string.IsNullOrEmpty(qop) && qop.Split(',').Length > 0 && Array.Exists(qop.Split(','), q => q.Trim() == "auth"))
                {
                    var cnonce = Guid.NewGuid().ToString("N").Substring(0, 16);
                    const string nc = "00000001";
                    var response = Md5(ha1 + ":" + nonce + ":" + nc + ":" + cnonce + ":auth:" + ha2);
                    sb.Append(", qop=auth, nc=").Append(nc).Append(", cnonce=\"").Append(cnonce).Append("\", response=\"").Append(response).Append('"');
                }
                else
                {
                    sb.Append(", response=\"").Append(Md5(ha1 + ":" + nonce + ":" + ha2)).Append('"');
                }
                if (!string.IsNullOrEmpty(opaque)) sb.Append(", opaque=\"").Append(opaque).Append('"');
                return sb.ToString();
            }
            if (basic != null) return "Basic " + Convert.ToBase64String(Encoding.UTF8.GetBytes(user + ":" + password));
            return null;
        }

        static Dictionary<string, string> ParseParams(string s)
        {
            var d = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (Match m in Regex.Matches(s, @"(\w+)\s*=\s*(?:""([^""]*)""|([^,\s]+))"))
                d[m.Groups[1].Value] = m.Groups[2].Success && m.Groups[2].Length > 0 ? m.Groups[2].Value : m.Groups[3].Value;
            return d;
        }

        static string Md5(string s)
        {
            using (var md5 = MD5.Create())
            {
                var hash = md5.ComputeHash(Encoding.UTF8.GetBytes(s));
                var sb = new StringBuilder(32);
                foreach (var b in hash) sb.Append(b.ToString("x2"));
                return sb.ToString();
            }
        }
    }
}
