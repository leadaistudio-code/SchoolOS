namespace MyCampusView.Connect.Core.Abstractions;

public enum QueuedEventStatus
{
    Pending,
    Uploading,
    Done,
    Dead,
}

public sealed class QueuedEvent
{
    public long Id { get; init; }
    public required string DedupeKey { get; init; }
    public required string PayloadJson { get; init; }
    public int Attempts { get; init; }
    public DateTimeOffset CreatedAt { get; init; }
    public DateTimeOffset? NextAttemptAt { get; init; }
    public string? LastError { get; init; }
    public QueuedEventStatus Status { get; init; }
}

/// <summary>
/// Durable local queue for biometric events plus per-device sync checkpoints.
/// </summary>
public interface IEventQueue : IAsyncDisposable
{
    Task InitializeAsync(CancellationToken cancellationToken = default);

    Task EnqueueAsync(BiometricEvent biometricEvent, CancellationToken cancellationToken = default);

    Task EnqueueManyAsync(IEnumerable<BiometricEvent> events, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<QueuedEvent>> DequeueBatchAsync(int maxCount, CancellationToken cancellationToken = default);

    Task MarkUploadedAsync(IEnumerable<long> ids, CancellationToken cancellationToken = default);

    Task MarkFailedAsync(IEnumerable<long> ids, string error, TimeSpan retryAfter, CancellationToken cancellationToken = default);

    Task MarkDeadAsync(IEnumerable<long> ids, string error, CancellationToken cancellationToken = default);

    Task<int> GetPendingCountAsync(CancellationToken cancellationToken = default);

    Task<string?> GetCheckpointAsync(string localDeviceId, CancellationToken cancellationToken = default);

    Task SetCheckpointAsync(string localDeviceId, string checkpoint, CancellationToken cancellationToken = default);
}
