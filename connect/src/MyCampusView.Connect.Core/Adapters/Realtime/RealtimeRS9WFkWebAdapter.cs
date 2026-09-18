using MyCampusView.Connect.Core.Abstractions;

namespace MyCampusView.Connect.Core.Adapters.Realtime;

/// <summary>
/// Passive registration adapter for RS9W terminals that push through FKWeb.
/// The HTTP receiver owns communication; this adapter prevents SDK polling.
/// </summary>
public sealed class RealtimeRS9WFkWebAdapter : IBiometricDeviceAdapter
{
    public RealtimeRS9WFkWebAdapter(DeviceInfo deviceInfo)
    {
        DeviceInfo = deviceInfo;
        LocalDeviceId = deviceInfo.LocalDeviceId;
        Capabilities = DeviceCapabilities.PushOnly;
        DeviceInfo.Status = DeviceOnlineStatus.Offline;
        DeviceInfo.LastError = "Waiting for the first FKWeb packet";
    }

    public string LocalDeviceId { get; }
    public DeviceInfo DeviceInfo { get; }
    public DeviceCapabilities Capabilities { get; }

    public Task ConnectAsync(CancellationToken cancellationToken = default) => Task.CompletedTask;
    public Task DisconnectAsync(CancellationToken cancellationToken = default) => Task.CompletedTask;

    public Task<bool> TestConnectionAsync(CancellationToken cancellationToken = default) =>
        Task.FromResult(false);

    public Task<(IReadOnlyList<BiometricEvent> Events, string? NextCheckpoint)> GetNewAttendanceLogsAsync(
        string? checkpoint,
        CancellationToken cancellationToken = default) =>
        Task.FromResult(((IReadOnlyList<BiometricEvent>)Array.Empty<BiometricEvent>(), checkpoint));

    public Task<IReadOnlyList<string>> ReadUserIdsAsync(CancellationToken cancellationToken = default) =>
        Task.FromResult((IReadOnlyList<string>)Array.Empty<string>());

    public Task SyncDeviceTimeAsync(
        DateTimeOffset serverTime,
        CancellationToken cancellationToken = default) =>
        Task.CompletedTask;

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;
}
