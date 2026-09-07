using MyCampusView.Connect.Core.Abstractions;

namespace MyCampusView.Connect.Core.Adapters.Realtime;

/// <summary>
/// Stub adapter for Realtime RS9W / compatible terminals.
/// The vendor SDK/DLL is NOT shipped with MyCampusView Connect.
/// Install the manufacturer SDK separately and replace this stub before production use.
/// </summary>
public sealed class RealtimeRS9WAdapter : IBiometricDeviceAdapter
{
    private const string SdkMissingMessage =
        "Realtime RS9W vendor SDK is not installed with this build of MyCampusView Connect. " +
        "Obtain the Realtime biometric SDK/DLL from the device vendor, place it beside the Connect binaries " +
        "(or register it per vendor docs), then use a non-stub RealtimeRS9WAdapter implementation. " +
        "This stub refuses all hardware calls so Connect never fakes device communication.";

    public RealtimeRS9WAdapter(DeviceInfo deviceInfo)
    {
        DeviceInfo = deviceInfo;
        LocalDeviceId = deviceInfo.LocalDeviceId;
        Capabilities = DeviceCapabilities.RealtimeStub;
        DeviceInfo.Status = DeviceOnlineStatus.Error;
        DeviceInfo.LastError = SdkMissingMessage;
    }

    public string LocalDeviceId { get; }

    public DeviceInfo DeviceInfo { get; }

    public DeviceCapabilities Capabilities { get; }

    public Task ConnectAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        throw new NotSupportedException(SdkMissingMessage);
    }

    public Task DisconnectAsync(CancellationToken cancellationToken = default)
    {
        // Safe no-op: never connected without the SDK.
        return Task.CompletedTask;
    }

    public Task<bool> TestConnectionAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        throw new NotSupportedException(SdkMissingMessage);
    }

    public Task<(IReadOnlyList<BiometricEvent> Events, string? NextCheckpoint)> GetNewAttendanceLogsAsync(
        string? checkpoint,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        throw new NotSupportedException(SdkMissingMessage);
    }

    public Task<IReadOnlyList<string>> ReadUserIdsAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        throw new NotSupportedException(SdkMissingMessage);
    }

    public Task SyncDeviceTimeAsync(DateTimeOffset serverTime, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        throw new NotSupportedException(SdkMissingMessage);
    }

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;
}
