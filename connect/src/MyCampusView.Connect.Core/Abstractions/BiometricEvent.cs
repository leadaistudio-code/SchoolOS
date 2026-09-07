namespace MyCampusView.Connect.Core.Abstractions;

public enum VerificationMethod
{
    Fingerprint,
    Rfid,
    Pin,
    Face,
    Unknown,
}

public enum PunchDirection
{
    In,
    Out,
    Unknown,
}

/// <summary>
/// Attendance punch captured from a biometric device, ready for cloud ingest.
/// </summary>
public sealed class BiometricEvent
{
    public required string LocalDeviceId { get; init; }

    public required string ExternalUserId { get; init; }

    /// <summary>Device-local punch time as ISO-8601 with offset when possible.</summary>
    public required DateTimeOffset DeviceLocalAt { get; init; }

    public VerificationMethod VerificationMethod { get; init; } = VerificationMethod.Unknown;

    public PunchDirection Direction { get; init; } = PunchDirection.Unknown;

    public string? DeviceEventId { get; init; }

    /// <summary>Stable idempotency key; generated when omitted.</summary>
    public string? DedupeKey { get; set; }

    public Dictionary<string, object?>? RawPayload { get; init; }

    public string EnsureDedupeKey()
    {
        if (!string.IsNullOrWhiteSpace(DedupeKey))
        {
            return DedupeKey;
        }

        if (!string.IsNullOrWhiteSpace(DeviceEventId))
        {
            DedupeKey = $"{LocalDeviceId}:{DeviceEventId}".Length > 240
                ? $"{LocalDeviceId}:{DeviceEventId}"[..240]
                : $"{LocalDeviceId}:{DeviceEventId}";
            return DedupeKey;
        }

        var built = string.Join('|',
            LocalDeviceId,
            ExternalUserId,
            DeviceLocalAt.ToString("O"),
            Direction.ToString().ToUpperInvariant());

        DedupeKey = built.Length > 240 ? built[..240] : built;
        return DedupeKey;
    }

    public string ToApiVerificationMethod() => VerificationMethod switch
    {
        VerificationMethod.Fingerprint => "FINGERPRINT",
        VerificationMethod.Rfid => "RFID",
        VerificationMethod.Pin => "PIN",
        VerificationMethod.Face => "FACE",
        _ => "UNKNOWN",
    };

    public string ToApiDirection() => Direction switch
    {
        PunchDirection.In => "IN",
        PunchDirection.Out => "OUT",
        _ => "UNKNOWN",
    };
}
