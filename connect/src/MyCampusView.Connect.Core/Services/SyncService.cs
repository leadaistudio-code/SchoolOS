using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using MyCampusView.Connect.Core.Abstractions;
using MyCampusView.Connect.Core.Adapters;
using MyCampusView.Connect.Core.Config;
using MyCampusView.Connect.Core.Queue;

namespace MyCampusView.Connect.Core.Services;

/// <summary>
/// Polls biometric adapters, enqueues punches, batch-uploads with exponential backoff,
/// heartbeats roughly every 30s, and claims/executes cloud commands.
/// </summary>
public sealed class SyncService : IHostedService, IAsyncDisposable
{
    private readonly ConnectorConfig _config;
    private readonly ICloudApiClient _cloud;
    private readonly IEventQueue _queue;
    private readonly ILogger<SyncService> _logger;
    private readonly ILoggerFactory _loggerFactory;
    private readonly IHostEnvironment _environment;
    private readonly SecureCredentialStore _credentialStore;
    private readonly List<IBiometricDeviceAdapter> _adapters = new();
    private readonly object _adapterGate = new();

    private CancellationTokenSource? _cts;
    private Task? _loopTask;
    private DateTimeOffset _nextHeartbeatUtc = DateTimeOffset.MinValue;
    private DateTimeOffset _nextDevicePollUtc = DateTimeOffset.MinValue;
    private DateTimeOffset _nextCommandPollUtc = DateTimeOffset.MinValue;
    private DateTimeOffset _nextUploadUtc = DateTimeOffset.MinValue;
    private int _uploadFailures;
    private bool _started;

    public SyncService(
        ConnectorConfig config,
        ICloudApiClient cloud,
        IEventQueue queue,
        ILogger<SyncService> logger,
        ILoggerFactory loggerFactory,
        IHostEnvironment environment,
        SecureCredentialStore credentialStore)
    {
        _config = config;
        _cloud = cloud;
        _queue = queue;
        _logger = logger;
        _loggerFactory = loggerFactory;
        _environment = environment;
        _credentialStore = credentialStore;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        if (_started)
        {
            return;
        }

        ConnectorConfig.EnsureDirectories();
        await _queue.InitializeAsync(cancellationToken).ConfigureAwait(false);

        StoredCredentials? credentials = null;
        while (credentials is null)
        {
            cancellationToken.ThrowIfCancellationRequested();
            credentials = _credentialStore.TryLoad();
            if (credentials is null)
            {
                _logger.LogWarning(
                    "Connector is not paired yet. Run MyCampusView.Connect.Setup, then wait — checking again in 30s. Credentials path: {Path}",
                    ConnectorConfig.CredentialsPath);
                await Task.Delay(TimeSpan.FromSeconds(30), cancellationToken).ConfigureAwait(false);
            }
        }

        if (!string.IsNullOrWhiteSpace(credentials.ApiBaseUrl))
        {
            _config.ApiBaseUrl = credentials.ApiBaseUrl;
        }

        _cloud.SetApiBaseUrl(_config.ApiBaseUrl);
        _cloud.SetCredentials(credentials.ConnectorSecret);

        await BuildAdaptersAsync(cancellationToken).ConfigureAwait(false);
        await RegisterDevicesAsync(cancellationToken).ConfigureAwait(false);

        _cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        _loopTask = Task.Run(() => RunLoopAsync(_cts.Token), CancellationToken.None);
        _started = true;
        _logger.LogInformation(
            "SyncService started for connector {ConnectorId} ({Name}) against {Api}",
            credentials.ConnectorId,
            credentials.ConnectorName ?? "Connect",
            _config.ApiBaseUrl);
    }

    public async Task StopAsync(CancellationToken cancellationToken)
    {
        if (!_started)
        {
            return;
        }

        _logger.LogInformation("SyncService stopping…");
        if (_cts is not null)
        {
            await _cts.CancelAsync().ConfigureAwait(false);
        }

        if (_loopTask is not null)
        {
            try
            {
                await Task.WhenAny(_loopTask, Task.Delay(Timeout.Infinite, cancellationToken)).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                // shutting down
            }
        }

        await DisposeAdaptersAsync().ConfigureAwait(false);
        _started = false;
    }

    public async ValueTask DisposeAsync()
    {
        if (_cts is not null)
        {
            await _cts.CancelAsync().ConfigureAwait(false);
            _cts.Dispose();
            _cts = null;
        }

        await DisposeAdaptersAsync().ConfigureAwait(false);
        await _queue.DisposeAsync().ConfigureAwait(false);
    }

    private async Task RunLoopAsync(CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            var now = DateTimeOffset.UtcNow;
            try
            {
                if (now >= _nextHeartbeatUtc)
                {
                    await HeartbeatOnceAsync(cancellationToken).ConfigureAwait(false);
                    _nextHeartbeatUtc = now.AddSeconds(Math.Max(5, _config.HeartbeatIntervalSeconds));
                }

                if (now >= _nextDevicePollUtc)
                {
                    await PollDevicesAsync(cancellationToken).ConfigureAwait(false);
                    _nextDevicePollUtc = now.AddSeconds(Math.Max(5, _config.PollIntervalSeconds));
                }

                if (now >= _nextUploadUtc)
                {
                    await UploadPendingAsync(cancellationToken).ConfigureAwait(false);
                }

                if (now >= _nextCommandPollUtc)
                {
                    await PollCommandsAsync(cancellationToken).ConfigureAwait(false);
                    _nextCommandPollUtc = now.AddSeconds(Math.Max(5, _config.CommandPollIntervalSeconds));
                }
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Sync loop iteration failed");
            }

            try
            {
                await Task.Delay(TimeSpan.FromSeconds(1), cancellationToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private async Task BuildAdaptersAsync(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        lock (_adapterGate)
        {
            _adapters.Clear();
        }

        if (_config.Devices.Count == 0)
        {
            _logger.LogWarning(
                "No devices configured. Add entries under Connector:Devices in appsettings or {Path}",
                ConnectorConfig.LocalConfigPath);
            return;
        }

        // Production safety: never treat simulator as default.
        if (string.Equals(_environment.EnvironmentName, "Production", StringComparison.OrdinalIgnoreCase) &&
            !_config.AllowSimulator)
        {
            var simDevices = _config.Devices.Where(d => d.IsSimulatorBrand()).ToList();
            if (simDevices.Count > 0)
            {
                throw new InvalidOperationException(
                    "Production environment refuses Simulator devices while Connector:AllowSimulator is false. " +
                    "Remove simulator devices or explicitly set AllowSimulator=true (not recommended).");
            }
        }

        foreach (var entry in _config.Devices)
        {
            cancellationToken.ThrowIfCancellationRequested();
            try
            {
                var adapter = BiometricAdapterFactory.Create(
                    entry,
                    _config,
                    _environment.EnvironmentName,
                    _loggerFactory);

                try
                {
                    await adapter.ConnectAsync(cancellationToken).ConfigureAwait(false);
                    _logger.LogInformation(
                        "Attached adapter {Brand}/{Model} for {DeviceId}",
                        entry.Brand,
                        entry.Model,
                        entry.LocalDeviceId);
                }
                catch (NotSupportedException ex)
                {
                    // Keep the stub so the cloud can see ERROR status; do not fake hardware.
                    adapter.DeviceInfo.Status = DeviceOnlineStatus.Error;
                    adapter.DeviceInfo.LastError = ex.Message;
                    _logger.LogError(
                        ex,
                        "Device {DeviceId} ({Brand}) is not usable until the vendor SDK is installed",
                        entry.LocalDeviceId,
                        entry.Brand);
                }

                lock (_adapterGate)
                {
                    _adapters.Add(adapter);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to initialize device {DeviceId}", entry.LocalDeviceId);
            }
        }
    }

    private async Task RegisterDevicesAsync(CancellationToken cancellationToken)
    {
        List<IBiometricDeviceAdapter> snapshot;
        lock (_adapterGate)
        {
            snapshot = _adapters.ToList();
        }

        foreach (var adapter in snapshot)
        {
            try
            {
                var info = adapter.DeviceInfo;
                if (info.Status == DeviceOnlineStatus.Offline && adapter.Capabilities.CanTestConnection)
                {
                    // leave as-is
                }

                await _cloud.UpsertDeviceAsync(info, cancellationToken).ConfigureAwait(false);
                _logger.LogInformation("Registered device {DeviceId} with cloud", info.LocalDeviceId);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Could not register device {DeviceId}", adapter.LocalDeviceId);
            }
        }
    }

    private async Task HeartbeatOnceAsync(CancellationToken cancellationToken)
    {
        int deviceCount;
        lock (_adapterGate)
        {
            deviceCount = _adapters.Count;
        }

        var pending = await _queue.GetPendingCountAsync(cancellationToken).ConfigureAwait(false);
        var result = await _cloud.HeartbeatAsync(new HeartbeatRequest
        {
            ConnectorVersion = _config.ConnectorVersion,
            Hostname = Environment.MachineName,
            OsInfo = $"{Environment.OSVersion}; {Environment.Version}",
            Devices = deviceCount,
            PendingEvents = pending,
        }, cancellationToken).ConfigureAwait(false);

        _logger.LogDebug("Heartbeat ok; serverTime={ServerTime}; pending={Pending}", result.ServerTime, pending);
    }

    private async Task PollDevicesAsync(CancellationToken cancellationToken)
    {
        List<IBiometricDeviceAdapter> snapshot;
        lock (_adapterGate)
        {
            snapshot = _adapters.ToList();
        }

        foreach (var adapter in snapshot)
        {
            if (!adapter.DeviceInfo.SyncEnabled)
            {
                continue;
            }

            if (!adapter.Capabilities.CanReadAttendanceLogs)
            {
                continue;
            }

            try
            {
                adapter.DeviceInfo.Status = DeviceOnlineStatus.Syncing;
                var checkpoint = await _queue.GetCheckpointAsync(adapter.LocalDeviceId, cancellationToken)
                    .ConfigureAwait(false);
                var (events, nextCheckpoint) = await adapter
                    .GetNewAttendanceLogsAsync(checkpoint, cancellationToken)
                    .ConfigureAwait(false);

                if (events.Count > 0)
                {
                    await _queue.EnqueueManyAsync(events, cancellationToken).ConfigureAwait(false);
                    _logger.LogInformation(
                        "Enqueued {Count} punches from {DeviceId}",
                        events.Count,
                        adapter.LocalDeviceId);
                }

                if (!string.IsNullOrWhiteSpace(nextCheckpoint))
                {
                    await _queue.SetCheckpointAsync(adapter.LocalDeviceId, nextCheckpoint, cancellationToken)
                        .ConfigureAwait(false);
                }

                adapter.DeviceInfo.Status = DeviceOnlineStatus.Online;
                adapter.DeviceInfo.LastError = null;
            }
            catch (NotSupportedException ex)
            {
                adapter.DeviceInfo.Status = DeviceOnlineStatus.Error;
                adapter.DeviceInfo.LastError = ex.Message;
                _logger.LogWarning("Device {DeviceId}: {Message}", adapter.LocalDeviceId, ex.Message);
            }
            catch (Exception ex)
            {
                adapter.DeviceInfo.Status = DeviceOnlineStatus.Error;
                adapter.DeviceInfo.LastError = ex.Message;
                _logger.LogError(ex, "Poll failed for device {DeviceId}", adapter.LocalDeviceId);
            }
        }
    }

    private async Task UploadPendingAsync(CancellationToken cancellationToken)
    {
        var batchSize = Math.Clamp(_config.BatchSize, 1, 500);
        var batch = await _queue.DequeueBatchAsync(batchSize, cancellationToken).ConfigureAwait(false);
        if (batch.Count == 0)
        {
            _uploadFailures = 0;
            _nextUploadUtc = DateTimeOffset.UtcNow.AddSeconds(2);
            return;
        }

        var events = new List<BiometricEvent>(batch.Count);
        var ids = new List<long>(batch.Count);
        foreach (var item in batch)
        {
            try
            {
                events.Add(SqliteEventQueue.DeserializePayload(item.PayloadJson));
                ids.Add(item.Id);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Corrupt queue row {Id}; marking dead", item.Id);
                await _queue.MarkDeadAsync(new[] { item.Id }, ex.Message, cancellationToken).ConfigureAwait(false);
            }
        }

        if (events.Count == 0)
        {
            _nextUploadUtc = DateTimeOffset.UtcNow.AddSeconds(2);
            return;
        }

        try
        {
            var result = await _cloud.UploadEventBatchAsync(events, cancellationToken).ConfigureAwait(false);
            await _queue.MarkUploadedAsync(ids, cancellationToken).ConfigureAwait(false);
            _uploadFailures = 0;
            _nextUploadUtc = DateTimeOffset.UtcNow.AddSeconds(1);
            _logger.LogInformation(
                "Uploaded batch: accepted={Accepted} duplicate={Duplicate} rejected={Rejected}",
                result.Accepted,
                result.Duplicate,
                result.Rejected);

            foreach (var item in result.Results.Where(r =>
                         string.Equals(r.Outcome, "rejected", StringComparison.OrdinalIgnoreCase)))
            {
                _logger.LogWarning("Event rejected ({Dedupe}): {Error}", item.DedupeKey, item.Error);
            }
        }
        catch (Exception ex)
        {
            _uploadFailures++;
            var delay = ComputeBackoff(_uploadFailures);
            var maxAttempts = Math.Max(3, _config.MaxUploadAttempts);

            var dead = batch.Where(b => b.Attempts >= maxAttempts).Select(b => b.Id).ToList();
            var retry = ids.Except(dead).ToList();

            if (dead.Count > 0)
            {
                await _queue.MarkDeadAsync(dead, ex.Message, cancellationToken).ConfigureAwait(false);
                _logger.LogError("Moved {Count} events to dead-letter after max attempts", dead.Count);
            }

            if (retry.Count > 0)
            {
                await _queue.MarkFailedAsync(retry, ex.Message, delay, cancellationToken).ConfigureAwait(false);
            }

            _nextUploadUtc = DateTimeOffset.UtcNow.Add(delay);
            _logger.LogWarning(ex, "Batch upload failed; backing off {Delay}s (failure #{N})", delay.TotalSeconds, _uploadFailures);
        }
    }

    private TimeSpan ComputeBackoff(int failureCount)
    {
        var initial = Math.Max(1, _config.InitialBackoffSeconds);
        var max = Math.Max(initial, _config.MaxBackoffSeconds);
        var exp = Math.Min(max, initial * Math.Pow(2, Math.Max(0, failureCount - 1)));
        // Full jitter
        var jitter = Random.Shared.NextDouble() * exp;
        return TimeSpan.FromSeconds(Math.Max(1, jitter));
    }

    private async Task PollCommandsAsync(CancellationToken cancellationToken)
    {
        IReadOnlyList<ConnectorCommand> commands;
        try
        {
            commands = await _cloud.ClaimCommandsAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Command poll failed");
            return;
        }

        if (commands.Count == 0)
        {
            return;
        }

        _logger.LogInformation("Claimed {Count} command(s)", commands.Count);
        foreach (var command in commands)
        {
            await ExecuteCommandAsync(command, cancellationToken).ConfigureAwait(false);
        }
    }

    private async Task ExecuteCommandAsync(ConnectorCommand command, CancellationToken cancellationToken)
    {
        try
        {
            var type = command.Type.Trim().ToUpperInvariant();
            IBiometricDeviceAdapter? adapter = null;
            if (!string.IsNullOrWhiteSpace(command.LocalDeviceId))
            {
                lock (_adapterGate)
                {
                    adapter = _adapters.FirstOrDefault(a =>
                        string.Equals(a.LocalDeviceId, command.LocalDeviceId, StringComparison.OrdinalIgnoreCase));
                }
            }

            switch (type)
            {
                case "TEST_CONNECTION":
                {
                    if (adapter is null)
                    {
                        await FailCommandAsync(command.Id, "Device not found on this connector", cancellationToken)
                            .ConfigureAwait(false);
                        return;
                    }

                    var ok = await adapter.TestConnectionAsync(cancellationToken).ConfigureAwait(false);
                    await _cloud.ReportCommandResultAsync(command.Id, new CommandResultReport
                    {
                        Status = ok ? "SUCCEEDED" : "FAILED",
                        Result = new Dictionary<string, object?>
                        {
                            ["ok"] = ok,
                            ["serialNumber"] = adapter.DeviceInfo.SerialNumber,
                            ["firmware"] = adapter.DeviceInfo.Firmware,
                            ["userCount"] = adapter.DeviceInfo.UserCount,
                        },
                        Error = ok ? null : adapter.DeviceInfo.LastError ?? "Connection test failed",
                    }, cancellationToken).ConfigureAwait(false);
                    break;
                }
                case "SYNC_DEVICE":
                case "REFRESH_INFO":
                {
                    if (adapter is null)
                    {
                        await FailCommandAsync(command.Id, "Device not found on this connector", cancellationToken)
                            .ConfigureAwait(false);
                        return;
                    }

                    await PollSingleDeviceAsync(adapter, cancellationToken).ConfigureAwait(false);
                    await _cloud.UpsertDeviceAsync(adapter.DeviceInfo, cancellationToken).ConfigureAwait(false);
                    await _cloud.ReportCommandResultAsync(command.Id, new CommandResultReport
                    {
                        Status = "SUCCEEDED",
                        Result = new Dictionary<string, object?>
                        {
                            ["status"] = adapter.DeviceInfo.ToApiStatus(),
                            ["serialNumber"] = adapter.DeviceInfo.SerialNumber,
                            ["firmware"] = adapter.DeviceInfo.Firmware,
                            ["userCount"] = adapter.DeviceInfo.UserCount,
                        },
                    }, cancellationToken).ConfigureAwait(false);
                    break;
                }
                case "READ_USERS":
                {
                    if (adapter is null)
                    {
                        await FailCommandAsync(command.Id, "Device not found on this connector", cancellationToken)
                            .ConfigureAwait(false);
                        return;
                    }

                    var users = await adapter.ReadUserIdsAsync(cancellationToken).ConfigureAwait(false);
                    await _cloud.ReportCommandResultAsync(command.Id, new CommandResultReport
                    {
                        Status = "SUCCEEDED",
                        Result = new Dictionary<string, object?>
                        {
                            ["userCount"] = users.Count,
                            ["users"] = users.Take(500).ToArray(),
                        },
                    }, cancellationToken).ConfigureAwait(false);
                    break;
                }
                case "SYNC_DEVICE_TIME":
                {
                    if (adapter is null)
                    {
                        await FailCommandAsync(command.Id, "Device not found on this connector", cancellationToken)
                            .ConfigureAwait(false);
                        return;
                    }

                    await adapter.SyncDeviceTimeAsync(DateTimeOffset.UtcNow, cancellationToken).ConfigureAwait(false);
                    await _cloud.ReportCommandResultAsync(command.Id, new CommandResultReport
                    {
                        Status = "SUCCEEDED",
                        Result = new Dictionary<string, object?>
                        {
                            ["clockDriftSec"] = adapter.DeviceInfo.ClockDriftSec,
                        },
                    }, cancellationToken).ConfigureAwait(false);
                    break;
                }
                default:
                    await FailCommandAsync(command.Id, $"Unsupported command type: {command.Type}", cancellationToken)
                        .ConfigureAwait(false);
                    break;
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Command {Id} ({Type}) failed", command.Id, command.Type);
            await FailCommandAsync(command.Id, ex.Message, cancellationToken).ConfigureAwait(false);
        }
    }

    private async Task PollSingleDeviceAsync(IBiometricDeviceAdapter adapter, CancellationToken cancellationToken)
    {
        if (!adapter.Capabilities.CanReadAttendanceLogs)
        {
            return;
        }

        var checkpoint = await _queue.GetCheckpointAsync(adapter.LocalDeviceId, cancellationToken).ConfigureAwait(false);
        var (events, nextCheckpoint) = await adapter.GetNewAttendanceLogsAsync(checkpoint, cancellationToken)
            .ConfigureAwait(false);
        if (events.Count > 0)
        {
            await _queue.EnqueueManyAsync(events, cancellationToken).ConfigureAwait(false);
        }

        if (!string.IsNullOrWhiteSpace(nextCheckpoint))
        {
            await _queue.SetCheckpointAsync(adapter.LocalDeviceId, nextCheckpoint, cancellationToken)
                .ConfigureAwait(false);
        }
    }

    private Task FailCommandAsync(string commandId, string error, CancellationToken cancellationToken) =>
        _cloud.ReportCommandResultAsync(commandId, new CommandResultReport
        {
            Status = "FAILED",
            Error = error.Length > 1000 ? error[..1000] : error,
        }, cancellationToken);

    private async Task DisposeAdaptersAsync()
    {
        List<IBiometricDeviceAdapter> snapshot;
        lock (_adapterGate)
        {
            snapshot = _adapters.ToList();
            _adapters.Clear();
        }

        foreach (var adapter in snapshot)
        {
            try
            {
                await adapter.DisconnectAsync().ConfigureAwait(false);
                await adapter.DisposeAsync().ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Adapter dispose error for {DeviceId}", adapter.LocalDeviceId);
            }
        }
    }
}
