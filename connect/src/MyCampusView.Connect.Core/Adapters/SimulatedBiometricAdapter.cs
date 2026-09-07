using Microsoft.Extensions.Logging;
using MyCampusView.Connect.Core.Abstractions;
using MyCampusView.Connect.Core.Config;

namespace MyCampusView.Connect.Core.Adapters;

/// <summary>
/// Generates realistic attendance punches for lab / Development use only.
/// Activated only when device Brand is Simulator and Connector:AllowSimulator is true.
/// Never enable AllowSimulator in Production by default.
/// </summary>
public sealed class SimulatedBiometricAdapter : IBiometricDeviceAdapter
{
    private readonly ILogger _logger;
    private readonly Random _random;
    private readonly List<string> _users;
    private bool _connected;
    private int _eventSeq;

    public SimulatedBiometricAdapter(DeviceInfo deviceInfo, ILogger logger, int? seed = null)
    {
        DeviceInfo = deviceInfo;
        LocalDeviceId = deviceInfo.LocalDeviceId;
        _logger = logger;
        _random = seed.HasValue ? new Random(seed.Value) : new Random();
        _users = BuildDemoUsers(deviceInfo.LocalDeviceId);
        Capabilities = DeviceCapabilities.Simulator;
    }

    public string LocalDeviceId { get; }

    public DeviceInfo DeviceInfo { get; }

    public DeviceCapabilities Capabilities { get; }

    public static void EnsureAllowed(ConnectorConfig config, string environmentName)
    {
        if (!config.AllowSimulator)
        {
            throw new InvalidOperationException(
                "SimulatedBiometricAdapter is disabled. Set Connector:AllowSimulator=true only for non-production lab use.");
        }

        if (string.Equals(environmentName, "Production", StringComparison.OrdinalIgnoreCase) &&
            !config.AllowSimulator)
        {
            throw new InvalidOperationException(
                "Simulator must never be the default in Production. Explicit AllowSimulator=true is required and strongly discouraged.");
        }
    }

    public Task ConnectAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        _connected = true;
        DeviceInfo.Status = DeviceOnlineStatus.Online;
        DeviceInfo.LastError = null;
        DeviceInfo.Firmware = "sim-1.0.0";
        DeviceInfo.UserCount = _users.Count;
        DeviceInfo.SerialNumber ??= $"SIM-{LocalDeviceId.ToUpperInvariant()}";
        _logger.LogInformation("Simulator device {DeviceId} connected ({Users} demo users)", LocalDeviceId, _users.Count);
        return Task.CompletedTask;
    }

    public Task DisconnectAsync(CancellationToken cancellationToken = default)
    {
        _connected = false;
        DeviceInfo.Status = DeviceOnlineStatus.Offline;
        return Task.CompletedTask;
    }

    public Task<bool> TestConnectionAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_connected);
    }

    public Task<(IReadOnlyList<BiometricEvent> Events, string? NextCheckpoint)> GetNewAttendanceLogsAsync(
        string? checkpoint,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        EnsureConnected();

        var since = ParseCheckpoint(checkpoint);
        var now = DateTimeOffset.Now;

        // Emit 0–3 punches per poll, spaced after the checkpoint.
        var count = _random.Next(0, 4);
        var events = new List<BiometricEvent>(count);
        var cursor = since;

        for (var i = 0; i < count; i++)
        {
            cursor = cursor.AddSeconds(_random.Next(5, 90));
            if (cursor > now)
            {
                cursor = now;
            }

            _eventSeq++;
            var user = _users[_random.Next(_users.Count)];
            var method = PickMethod();
            var direction = _random.NextDouble() < 0.55 ? PunchDirection.In : PunchDirection.Out;
            var deviceEventId = $"sim-{LocalDeviceId}-{_eventSeq:D8}";

            events.Add(new BiometricEvent
            {
                LocalDeviceId = LocalDeviceId,
                ExternalUserId = user,
                DeviceLocalAt = cursor,
                VerificationMethod = method,
                Direction = direction,
                DeviceEventId = deviceEventId,
                RawPayload = new Dictionary<string, object?>
                {
                    ["source"] = "simulator",
                    ["seq"] = _eventSeq,
                },
            });
        }

        var nextCheckpoint = (events.Count > 0 ? events[^1].DeviceLocalAt : now).ToString("O");
        return Task.FromResult(((IReadOnlyList<BiometricEvent>)events, (string?)nextCheckpoint));
    }

    public Task<IReadOnlyList<string>> ReadUserIdsAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        EnsureConnected();
        return Task.FromResult((IReadOnlyList<string>)_users.ToList());
    }

    public Task SyncDeviceTimeAsync(DateTimeOffset serverTime, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        EnsureConnected();
        DeviceInfo.ClockDriftSec = (int)Math.Round((DateTimeOffset.Now - serverTime).TotalSeconds);
        _logger.LogInformation(
            "Simulator {DeviceId} noted clock drift {Drift}s vs server",
            LocalDeviceId,
            DeviceInfo.ClockDriftSec);
        return Task.CompletedTask;
    }

    public ValueTask DisposeAsync()
    {
        _connected = false;
        return ValueTask.CompletedTask;
    }

    private void EnsureConnected()
    {
        if (!_connected)
        {
            throw new InvalidOperationException($"Simulator device {LocalDeviceId} is not connected.");
        }
    }

    private VerificationMethod PickMethod()
    {
        var roll = _random.NextDouble();
        if (roll < 0.55) return VerificationMethod.Fingerprint;
        if (roll < 0.75) return VerificationMethod.Face;
        if (roll < 0.90) return VerificationMethod.Rfid;
        return VerificationMethod.Pin;
    }

    private static DateTimeOffset ParseCheckpoint(string? checkpoint)
    {
        if (!string.IsNullOrWhiteSpace(checkpoint) &&
            DateTimeOffset.TryParse(checkpoint, out var parsed))
        {
            return parsed;
        }

        return DateTimeOffset.Now.AddMinutes(-2);
    }

    private static List<string> BuildDemoUsers(string deviceId)
    {
        // Stable-looking external IDs similar to device enroll numbers.
        var hash = Math.Abs(deviceId.GetHashCode(StringComparison.Ordinal));
        var users = new List<string>();
        for (var i = 1; i <= 12; i++)
        {
            users.Add($"{1000 + (hash % 900) + i}");
        }

        return users;
    }
}
