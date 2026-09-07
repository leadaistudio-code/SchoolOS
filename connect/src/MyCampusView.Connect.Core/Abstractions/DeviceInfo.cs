namespace MyCampusView.Connect.Core.Abstractions;

public enum DevicePurpose
{
    Student,
    Staff,
    Both,
    AccessOnly,
}

public enum DeviceOnlineStatus
{
    Online,
    Offline,
    Syncing,
    Error,
    Disabled,
}

/// <summary>
/// Local device registration payload mirrored to the cloud gateway.
/// </summary>
public sealed class DeviceInfo
{
    public required string LocalDeviceId { get; init; }

    public required string Name { get; init; }

    public required string Brand { get; init; }

    public required string Model { get; init; }

    public string? LocationLabel { get; init; }

    public DevicePurpose Purpose { get; init; } = DevicePurpose.Both;

    public string? SerialNumber { get; init; }

    public string? MachineNumber { get; init; }

    public string? NetworkAddress { get; init; }

    public int? Port { get; init; }

    public string? ConnectionPassword { get; init; }

    public string? Firmware { get; init; }

    public int? UserCount { get; init; }

    public DeviceOnlineStatus Status { get; set; } = DeviceOnlineStatus.Offline;

    public string? LastError { get; set; }

    public int? ClockDriftSec { get; set; }

    public bool SyncEnabled { get; init; } = true;

    public string ToApiPurpose() => Purpose switch
    {
        DevicePurpose.Student => "STUDENT",
        DevicePurpose.Staff => "STAFF",
        DevicePurpose.AccessOnly => "ACCESS_ONLY",
        _ => "BOTH",
    };

    public string ToApiStatus() => Status switch
    {
        DeviceOnlineStatus.Online => "ONLINE",
        DeviceOnlineStatus.Offline => "OFFLINE",
        DeviceOnlineStatus.Syncing => "SYNCING",
        DeviceOnlineStatus.Error => "ERROR",
        DeviceOnlineStatus.Disabled => "DISABLED",
        _ => "OFFLINE",
    };
}
