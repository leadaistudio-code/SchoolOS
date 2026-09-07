namespace MyCampusView.Connect.Core.Abstractions;

/// <summary>
/// Features supported by a connected biometric device / adapter.
/// </summary>
public sealed class DeviceCapabilities
{
    public bool CanReadAttendanceLogs { get; init; }

    public bool CanTestConnection { get; init; }

    public bool CanReadUsers { get; init; }

    public bool CanSyncDeviceTime { get; init; }

    public bool IsSimulated { get; init; }

    public static DeviceCapabilities Simulator { get; } = new()
    {
        CanReadAttendanceLogs = true,
        CanTestConnection = true,
        CanReadUsers = true,
        CanSyncDeviceTime = false,
        IsSimulated = true,
    };

    public static DeviceCapabilities RealtimeStub { get; } = new()
    {
        CanReadAttendanceLogs = false,
        CanTestConnection = false,
        CanReadUsers = false,
        CanSyncDeviceTime = false,
        IsSimulated = false,
    };
}
