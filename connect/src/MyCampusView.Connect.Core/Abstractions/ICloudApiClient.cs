namespace MyCampusView.Connect.Core.Abstractions;

public sealed class PairRequest
{
    public required string Code { get; init; }
    public string? Hostname { get; init; }
    public string? OsInfo { get; init; }
    public string? ConnectorVersion { get; init; }
    public string? Name { get; init; }
}

public sealed class PairResult
{
    public required string ConnectorId { get; init; }
    public required string ConnectorKey { get; init; }
    public required string ConnectorSecret { get; init; }
    public required string ConnectorName { get; init; }
    public PairTenantInfo? Tenant { get; init; }
}

public sealed class PairTenantInfo
{
    public string? Id { get; init; }
    public string? Name { get; init; }
    public string? Slug { get; init; }
    public string? Timezone { get; init; }
}

public sealed class HeartbeatRequest
{
    public string? ConnectorVersion { get; init; }
    public string? Hostname { get; init; }
    public string? OsInfo { get; init; }
    public int? Devices { get; init; }
    public int? PendingEvents { get; init; }
}

public sealed class HeartbeatResult
{
    public bool Ok { get; init; }
    public string? ServerTime { get; init; }
}

public sealed class DeviceUpsertResult
{
    public string? Id { get; init; }
    public string? LocalDeviceId { get; init; }
    public string? Name { get; init; }
    public string? Status { get; init; }
}

public sealed class EventBatchResult
{
    public int Accepted { get; init; }
    public int Duplicate { get; init; }
    public int Rejected { get; init; }
    public IReadOnlyList<EventBatchItemResult> Results { get; init; } = Array.Empty<EventBatchItemResult>();
}

public sealed class EventBatchItemResult
{
    public string DedupeKey { get; init; } = "";
    public string Outcome { get; init; } = "";
    public string? EventId { get; init; }
    public string? Error { get; init; }
}

public sealed class ConnectorCommand
{
    public required string Id { get; init; }
    public required string Type { get; init; }
    public object? Payload { get; init; }
    public string? DeviceId { get; init; }
    public string? LocalDeviceId { get; init; }
    public string? DeviceName { get; init; }
    public DateTimeOffset? CreatedAt { get; init; }
}

public sealed class CommandResultReport
{
    public required string Status { get; init; }
    public Dictionary<string, object?>? Result { get; init; }
    public string? Error { get; init; }
}

/// <summary>
/// HTTP client for MyCampusView device-gateway machine endpoints.
/// </summary>
public interface ICloudApiClient
{
    string ApiBaseUrl { get; }

    void SetApiBaseUrl(string apiBaseUrl);

    void SetCredentials(string connectorSecret);

    Task<PairResult> PairAsync(PairRequest request, CancellationToken cancellationToken = default);

    Task<HeartbeatResult> HeartbeatAsync(HeartbeatRequest request, CancellationToken cancellationToken = default);

    Task<DeviceUpsertResult> UpsertDeviceAsync(DeviceInfo device, CancellationToken cancellationToken = default);

    Task<EventBatchResult> UploadEventBatchAsync(
        IReadOnlyList<BiometricEvent> events,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<ConnectorCommand>> ClaimCommandsAsync(CancellationToken cancellationToken = default);

    Task ReportCommandResultAsync(
        string commandId,
        CommandResultReport report,
        CancellationToken cancellationToken = default);
}
