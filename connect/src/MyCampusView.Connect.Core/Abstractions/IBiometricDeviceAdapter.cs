namespace MyCampusView.Connect.Core.Abstractions;

/// <summary>
/// Vendor-specific bridge to a biometric terminal.
/// Implementations must not pretend to talk to hardware without a real SDK.
/// </summary>
public interface IBiometricDeviceAdapter : IAsyncDisposable
{
    string LocalDeviceId { get; }

    DeviceInfo DeviceInfo { get; }

    DeviceCapabilities Capabilities { get; }

    Task ConnectAsync(CancellationToken cancellationToken = default);

    Task DisconnectAsync(CancellationToken cancellationToken = default);

    Task<bool> TestConnectionAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Pull new attendance logs since <paramref name="checkpoint"/> (opaque cursor or ISO timestamp).
    /// Returns events plus an updated checkpoint to persist after successful enqueue.
    /// </summary>
    Task<(IReadOnlyList<BiometricEvent> Events, string? NextCheckpoint)> GetNewAttendanceLogsAsync(
        string? checkpoint,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<string>> ReadUserIdsAsync(CancellationToken cancellationToken = default);

    Task SyncDeviceTimeAsync(DateTimeOffset serverTime, CancellationToken cancellationToken = default);
}
