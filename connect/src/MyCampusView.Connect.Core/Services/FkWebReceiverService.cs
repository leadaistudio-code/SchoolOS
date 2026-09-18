using System.Net;
using System.Security.Cryptography;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using MyCampusView.Connect.Core.Abstractions;
using MyCampusView.Connect.Core.Adapters.Realtime;
using MyCampusView.Connect.Core.Config;

namespace MyCampusView.Connect.Core.Services;

/// <summary>
/// Local SDK-free HTTP receiver for Realtime RS9W FKWeb push packets.
/// A packet is acknowledged only after its attendance event is durable in SQLite.
/// </summary>
public sealed class FkWebReceiverService : IHostedService, IAsyncDisposable
{
    private readonly ConnectorConfig _config;
    private readonly IEventQueue _queue;
    private readonly ILogger<FkWebReceiverService> _logger;
    private readonly List<DeviceConfigEntry> _devices;
    private HttpListener? _listener;
    private CancellationTokenSource? _cts;
    private Task? _listenTask;

    public FkWebReceiverService(
        ConnectorConfig config,
        IEventQueue queue,
        ILogger<FkWebReceiverService> logger)
    {
        _config = config;
        _queue = queue;
        _logger = logger;
        _devices = config.Devices
            .Where(device => device.SyncEnabled && device.IsRealtimeBrand() && device.IsFkWebPush())
            .ToList();
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        if (_devices.Count == 0)
        {
            _logger.LogInformation("FKWeb receiver disabled; no FKWEB_PUSH devices configured");
            return Task.CompletedTask;
        }

        var missingIdentity = _devices.FirstOrDefault(device => string.IsNullOrWhiteSpace(device.PushDeviceId));
        if (missingIdentity is not null)
        {
            throw new InvalidOperationException(
                $"FKWeb device '{missingIdentity.LocalDeviceId}' requires PushDeviceId from the terminal's Cloud Id.");
        }

        var duplicateIdentity = _devices
            .GroupBy(device => device.PushDeviceId!.Trim(), StringComparer.OrdinalIgnoreCase)
            .FirstOrDefault(group => group.Count() > 1);
        if (duplicateIdentity is not null)
        {
            throw new InvalidOperationException("Each FKWeb device must have a unique PushDeviceId.");
        }

        var prefix = _config.FkWebListenPrefix.Trim();
        if (!prefix.EndsWith('/')) prefix += "/";

        _listener = new HttpListener();
        _listener.Prefixes.Add(prefix);
        try
        {
            _listener.Start();
        }
        catch (HttpListenerException ex)
        {
            throw new InvalidOperationException(
                $"Could not start FKWeb receiver at {prefix}. Run the service as LocalSystem/admin and allow the port in Windows Firewall.",
                ex);
        }

        _cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        _listenTask = Task.Run(() => ListenAsync(_cts.Token), CancellationToken.None);
        _logger.LogInformation(
            "FKWeb receiver listening at {Prefix} for {Count} configured device(s)",
            prefix,
            _devices.Count);
        return Task.CompletedTask;
    }

    public async Task StopAsync(CancellationToken cancellationToken)
    {
        if (_cts is not null) await _cts.CancelAsync().ConfigureAwait(false);
        _listener?.Close();
        if (_listenTask is not null)
        {
            await Task.WhenAny(_listenTask, Task.Delay(Timeout.Infinite, cancellationToken))
                .ConfigureAwait(false);
        }
    }

    private async Task ListenAsync(CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested && _listener?.IsListening == true)
        {
            try
            {
                var context = await _listener.GetContextAsync().WaitAsync(cancellationToken)
                    .ConfigureAwait(false);
                _ = HandleAsync(context, cancellationToken);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                break;
            }
            catch (HttpListenerException) when (_listener?.IsListening != true)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "FKWeb accept loop failed");
            }
        }
    }

    private async Task HandleAsync(HttpListenerContext context, CancellationToken cancellationToken)
    {
        try
        {
            context.Response.KeepAlive = false;

            if (!string.Equals(context.Request.HttpMethod, "POST", StringComparison.OrdinalIgnoreCase) ||
                !IsAcceptedPath(context.Request.Url?.AbsolutePath))
            {
                await RespondAsync(context.Response, 404, []).ConfigureAwait(false);
                return;
            }

            var headers = context.Request.Headers.AllKeys
                .Where(key => key is not null)
                .ToDictionary(key => key!, key => context.Request.Headers[key], StringComparer.OrdinalIgnoreCase);
            var protocolDeviceId = Header(headers, "dev_id");
            var device = FindDevice(protocolDeviceId);
            if (device is null || !RemoteAddressAllowed(device, context.Request.RemoteEndPoint?.Address))
            {
                _logger.LogWarning(
                    "Rejected FKWeb packet from {Remote}; device identity did not match configuration",
                    context.Request.RemoteEndPoint?.Address);
                await RespondAsync(context.Response, 403, []).ConfigureAwait(false);
                return;
            }

            var body = await ReadBodyAsync(
                context.Request.InputStream,
                Math.Clamp(_config.FkWebMaxBodyBytes, 4096, 8 * 1024 * 1024),
                cancellationToken).ConfigureAwait(false);

            var parsed = FkWebPacketParser.TryParse(
                body,
                headers,
                device.LocalDeviceId,
                out var packet,
                out var biometricEvent,
                out var error);

            if (!parsed)
            {
                await SaveDiagnosticAsync(device.LocalDeviceId, headers, body, error, cancellationToken)
                    .ConfigureAwait(false);
                _logger.LogWarning(
                    "Unrecognized FKWeb packet for {Device}: {Error}; packet not acknowledged",
                    device.LocalDeviceId,
                    error ?? "unknown packet type");
                await RespondAsync(context.Response, 422, []).ConfigureAwait(false);
                return;
            }

            if (biometricEvent is not null)
            {
                await _queue.EnqueueAsync(biometricEvent, cancellationToken).ConfigureAwait(false);
                _logger.LogInformation(
                    "FKWeb punch queued: device={Device}, user={User}, time={Time}",
                    device.LocalDeviceId,
                    biometricEvent.ExternalUserId,
                    biometricEvent.DeviceLocalAt);
            }

            await SendAcknowledgementAsync(context.Response, packet).ConfigureAwait(false);
        }
        catch (RequestTooLargeException)
        {
            await RespondAsync(context.Response, 413, []).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "FKWeb request failed");
            if (context.Response.OutputStream.CanWrite)
            {
                await RespondAsync(context.Response, 500, []).ConfigureAwait(false);
            }
        }
    }

    private DeviceConfigEntry? FindDevice(string? protocolDeviceId)
    {
        if (string.IsNullOrWhiteSpace(protocolDeviceId)) return null;
        return _devices.FirstOrDefault(device =>
            string.Equals(device.PushDeviceId?.Trim(), protocolDeviceId.Trim(), StringComparison.OrdinalIgnoreCase));
    }

    private static bool RemoteAddressAllowed(DeviceConfigEntry device, IPAddress? remoteAddress)
    {
        if (string.IsNullOrWhiteSpace(device.NetworkAddress)) return true;
        if (!IPAddress.TryParse(device.NetworkAddress, out var configured) || remoteAddress is null) return false;
        if (configured.IsIPv4MappedToIPv6) configured = configured.MapToIPv4();
        if (remoteAddress.IsIPv4MappedToIPv6) remoteAddress = remoteAddress.MapToIPv4();
        return configured.Equals(remoteAddress);
    }

    private static bool IsAcceptedPath(string? path) =>
        path is "/" or "/hdata.aspx" or "/ebkn";

    private static async Task<byte[]> ReadBodyAsync(
        Stream stream,
        int limit,
        CancellationToken cancellationToken)
    {
        using var output = new MemoryStream();
        var buffer = new byte[8192];
        while (true)
        {
            var read = await stream.ReadAsync(buffer, cancellationToken).ConfigureAwait(false);
            if (read == 0) break;
            if (output.Length + read > limit) throw new RequestTooLargeException();
            await output.WriteAsync(buffer.AsMemory(0, read), cancellationToken).ConfigureAwait(false);
        }
        return output.ToArray();
    }

    private static async Task SendAcknowledgementAsync(HttpListenerResponse response, FkWebPacket packet)
    {
        response.StatusCode = 200;
        response.ContentType = "application/octet-stream";
        response.Headers["response_code"] = "OK";
        if (!string.IsNullOrWhiteSpace(packet.TransactionId))
            response.Headers["trans_id"] = packet.TransactionId;

        if (packet.Protocol == "EBKN_FKWEB")
        {
            await RespondAsync(response, 200, []).ConfigureAwait(false);
            return;
        }

        var text = packet.Kind is FkWebPacketKind.Attendance or FkWebPacketKind.Enrollment
            ? "result=OK"
            : "OK";
        await RespondAsync(response, 200, System.Text.Encoding.ASCII.GetBytes(text)).ConfigureAwait(false);
    }

    private static async Task RespondAsync(HttpListenerResponse response, int status, byte[] body)
    {
        if (!response.OutputStream.CanWrite) return;
        response.StatusCode = status;
        response.ContentLength64 = body.Length;
        if (body.Length > 0) await response.OutputStream.WriteAsync(body).ConfigureAwait(false);
        response.Close();
    }

    private static string? Header(IReadOnlyDictionary<string, string?> headers, string name) =>
        headers.TryGetValue(name, out var value) ? value : null;

    private async Task SaveDiagnosticAsync(
        string localDeviceId,
        IReadOnlyDictionary<string, string?> headers,
        byte[] body,
        string? error,
        CancellationToken cancellationToken)
    {
        ConnectorConfig.EnsureDirectories();
        var hash = Convert.ToHexString(SHA256.HashData(body)).ToLowerInvariant()[..16];
        var stem = $"{DateTimeOffset.UtcNow:yyyyMMdd-HHmmssfff}-{Sanitize(localDeviceId)}-{hash}";
        await File.WriteAllBytesAsync(
            Path.Combine(ConnectorConfig.FkWebDiagnosticsDirectory, stem + ".bin"),
            body,
            cancellationToken).ConfigureAwait(false);
        var metadata = string.Join(
            Environment.NewLine,
            $"error={error}",
            $"remoteDeviceId={Mask(Header(headers, "dev_id"))}",
            $"request_code={Header(headers, "request_code")}",
            $"cmd_id={Header(headers, "cmd_id")}",
            $"trans_id={Header(headers, "trans_id")}",
            $"bytes={body.Length}");
        await File.WriteAllTextAsync(
            Path.Combine(ConnectorConfig.FkWebDiagnosticsDirectory, stem + ".txt"),
            metadata,
            cancellationToken).ConfigureAwait(false);
    }

    private static string Mask(string? value) =>
        string.IsNullOrWhiteSpace(value)
            ? "(missing)"
            : value.Length <= 4 ? "****" : new string('*', value.Length - 4) + value[^4..];

    private static string Sanitize(string value) =>
        string.Concat(value.Select(character => char.IsLetterOrDigit(character) ? character : '_'));

    public async ValueTask DisposeAsync()
    {
        if (_cts is not null)
        {
            await _cts.CancelAsync().ConfigureAwait(false);
            _cts.Dispose();
        }
        _listener?.Close();
    }

    private sealed class RequestTooLargeException : Exception
    {
    }
}
