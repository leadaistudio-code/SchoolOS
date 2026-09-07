using System.Globalization;
using System.Text.Json;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Logging;
using MyCampusView.Connect.Core.Abstractions;
using MyCampusView.Connect.Core.Config;

namespace MyCampusView.Connect.Core.Queue;

/// <summary>
/// SQLite-backed durable event queue and checkpoint store under ProgramData.
/// </summary>
public sealed class SqliteEventQueue : IEventQueue
{
    private readonly string _dbPath;
    private readonly ILogger<SqliteEventQueue> _logger;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private SqliteConnection? _connection;
    private bool _disposed;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    public SqliteEventQueue(ILogger<SqliteEventQueue> logger, string? dbPath = null)
    {
        _logger = logger;
        ConnectorConfig.EnsureDirectories();
        _dbPath = dbPath ?? ConnectorConfig.QueueDbPath;
    }

    public async Task InitializeAsync(CancellationToken cancellationToken = default)
    {
        await _gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            if (_connection is not null)
            {
                return;
            }

            var directory = Path.GetDirectoryName(_dbPath);
            if (!string.IsNullOrEmpty(directory))
            {
                Directory.CreateDirectory(directory);
            }

            var connection = new SqliteConnection(new SqliteConnectionStringBuilder
            {
                DataSource = _dbPath,
                Mode = SqliteOpenMode.ReadWriteCreate,
                Cache = SqliteCacheMode.Shared,
            }.ToString());

            await connection.OpenAsync(cancellationToken).ConfigureAwait(false);

            await using (var cmd = connection.CreateCommand())
            {
                cmd.CommandText =
                    """
                    PRAGMA journal_mode=WAL;
                    PRAGMA synchronous=NORMAL;
                    PRAGMA foreign_keys=ON;

                    CREATE TABLE IF NOT EXISTS event_queue (
                      id INTEGER PRIMARY KEY AUTOINCREMENT,
                      dedupe_key TEXT NOT NULL UNIQUE,
                      payload_json TEXT NOT NULL,
                      status TEXT NOT NULL DEFAULT 'pending',
                      attempts INTEGER NOT NULL DEFAULT 0,
                      created_at TEXT NOT NULL,
                      next_attempt_at TEXT NULL,
                      last_error TEXT NULL
                    );

                    CREATE INDEX IF NOT EXISTS ix_event_queue_status_next
                      ON event_queue(status, next_attempt_at, id);

                    CREATE TABLE IF NOT EXISTS checkpoints (
                      local_device_id TEXT PRIMARY KEY,
                      checkpoint TEXT NOT NULL,
                      updated_at TEXT NOT NULL
                    );
                    """;
                await cmd.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
            }

            _connection = connection;
            _logger.LogInformation("SQLite event queue ready at {Path}", _dbPath);
        }
        finally
        {
            _gate.Release();
        }
    }

    public Task EnqueueAsync(BiometricEvent biometricEvent, CancellationToken cancellationToken = default) =>
        EnqueueManyAsync(new[] { biometricEvent }, cancellationToken);

    public async Task EnqueueManyAsync(
        IEnumerable<BiometricEvent> events,
        CancellationToken cancellationToken = default)
    {
        await EnsureReadyAsync(cancellationToken).ConfigureAwait(false);
        await _gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            var connection = _connection!;
            await using var tx = (SqliteTransaction)await connection.BeginTransactionAsync(cancellationToken)
                .ConfigureAwait(false);

            foreach (var evt in events)
            {
                var dedupe = evt.EnsureDedupeKey();
                var payload = JsonSerializer.Serialize(new SerializedEvent
                {
                    LocalDeviceId = evt.LocalDeviceId,
                    ExternalUserId = evt.ExternalUserId,
                    DeviceLocalAt = evt.DeviceLocalAt,
                    VerificationMethod = evt.ToApiVerificationMethod(),
                    Direction = evt.ToApiDirection(),
                    DeviceEventId = evt.DeviceEventId,
                    DedupeKey = dedupe,
                    RawPayload = evt.RawPayload,
                }, JsonOptions);

                await using var cmd = connection.CreateCommand();
                cmd.Transaction = tx;
                cmd.CommandText =
                    """
                    INSERT INTO event_queue (dedupe_key, payload_json, status, attempts, created_at)
                    VALUES ($dedupe, $payload, 'pending', 0, $created)
                    ON CONFLICT(dedupe_key) DO NOTHING;
                    """;
                cmd.Parameters.AddWithValue("$dedupe", dedupe);
                cmd.Parameters.AddWithValue("$payload", payload);
                cmd.Parameters.AddWithValue("$created", DateTimeOffset.UtcNow.ToString("O"));
                await cmd.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
            }

            await tx.CommitAsync(cancellationToken).ConfigureAwait(false);
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task<IReadOnlyList<QueuedEvent>> DequeueBatchAsync(
        int maxCount,
        CancellationToken cancellationToken = default)
    {
        await EnsureReadyAsync(cancellationToken).ConfigureAwait(false);
        await _gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            var connection = _connection!;
            var now = DateTimeOffset.UtcNow.ToString("O");
            var items = new List<QueuedEvent>();

            await using var select = connection.CreateCommand();
            select.CommandText =
                """
                SELECT id, dedupe_key, payload_json, attempts, created_at, next_attempt_at, last_error, status
                FROM event_queue
                WHERE status = 'pending'
                  AND (next_attempt_at IS NULL OR next_attempt_at <= $now)
                ORDER BY id ASC
                LIMIT $limit;
                """;
            select.Parameters.AddWithValue("$now", now);
            select.Parameters.AddWithValue("$limit", maxCount);

            await using var reader = await select.ExecuteReaderAsync(cancellationToken).ConfigureAwait(false);
            while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
            {
                items.Add(ReadQueuedEvent(reader));
            }

            if (items.Count == 0)
            {
                return items;
            }

            await using var tx = (SqliteTransaction)await connection.BeginTransactionAsync(cancellationToken)
                .ConfigureAwait(false);
            foreach (var item in items)
            {
                await using var update = connection.CreateCommand();
                update.Transaction = tx;
                update.CommandText =
                    """
                    UPDATE event_queue
                    SET status = 'uploading', attempts = attempts + 1
                    WHERE id = $id AND status = 'pending';
                    """;
                update.Parameters.AddWithValue("$id", item.Id);
                await update.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
            }

            await tx.CommitAsync(cancellationToken).ConfigureAwait(false);
            return items;
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task MarkUploadedAsync(IEnumerable<long> ids, CancellationToken cancellationToken = default)
    {
        await UpdateStatusAsync(ids, "done", error: null, nextAttemptAt: null, cancellationToken)
            .ConfigureAwait(false);
    }

    public async Task MarkFailedAsync(
        IEnumerable<long> ids,
        string error,
        TimeSpan retryAfter,
        CancellationToken cancellationToken = default)
    {
        var next = DateTimeOffset.UtcNow.Add(retryAfter).ToString("O");
        await UpdateStatusAsync(ids, "pending", error, next, cancellationToken).ConfigureAwait(false);
    }

    public async Task MarkDeadAsync(
        IEnumerable<long> ids,
        string error,
        CancellationToken cancellationToken = default)
    {
        await UpdateStatusAsync(ids, "dead", error, nextAttemptAt: null, cancellationToken)
            .ConfigureAwait(false);
    }

    public async Task<int> GetPendingCountAsync(CancellationToken cancellationToken = default)
    {
        await EnsureReadyAsync(cancellationToken).ConfigureAwait(false);
        await _gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            await using var cmd = _connection!.CreateCommand();
            cmd.CommandText =
                "SELECT COUNT(*) FROM event_queue WHERE status IN ('pending', 'uploading');";
            var result = await cmd.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false);
            return Convert.ToInt32(result, CultureInfo.InvariantCulture);
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task<string?> GetCheckpointAsync(
        string localDeviceId,
        CancellationToken cancellationToken = default)
    {
        await EnsureReadyAsync(cancellationToken).ConfigureAwait(false);
        await _gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            await using var cmd = _connection!.CreateCommand();
            cmd.CommandText = "SELECT checkpoint FROM checkpoints WHERE local_device_id = $id;";
            cmd.Parameters.AddWithValue("$id", localDeviceId);
            var value = await cmd.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false);
            return value is string s ? s : value?.ToString();
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task SetCheckpointAsync(
        string localDeviceId,
        string checkpoint,
        CancellationToken cancellationToken = default)
    {
        await EnsureReadyAsync(cancellationToken).ConfigureAwait(false);
        await _gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            await using var cmd = _connection!.CreateCommand();
            cmd.CommandText =
                """
                INSERT INTO checkpoints (local_device_id, checkpoint, updated_at)
                VALUES ($id, $checkpoint, $updated)
                ON CONFLICT(local_device_id) DO UPDATE SET
                  checkpoint = excluded.checkpoint,
                  updated_at = excluded.updated_at;
                """;
            cmd.Parameters.AddWithValue("$id", localDeviceId);
            cmd.Parameters.AddWithValue("$checkpoint", checkpoint);
            cmd.Parameters.AddWithValue("$updated", DateTimeOffset.UtcNow.ToString("O"));
            await cmd.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);

            // Mirror to file for ops visibility.
            try
            {
                var file = Path.Combine(ConnectorConfig.CheckpointsDirectory, SanitizeFileName(localDeviceId) + ".txt");
                await File.WriteAllTextAsync(file, checkpoint, cancellationToken).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Could not mirror checkpoint file for {Device}", localDeviceId);
            }
        }
        finally
        {
            _gate.Release();
        }
    }

    public async ValueTask DisposeAsync()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        await _gate.WaitAsync().ConfigureAwait(false);
        try
        {
            if (_connection is not null)
            {
                await _connection.DisposeAsync().ConfigureAwait(false);
                _connection = null;
            }
        }
        finally
        {
            _gate.Release();
            _gate.Dispose();
        }
    }

    private async Task UpdateStatusAsync(
        IEnumerable<long> ids,
        string status,
        string? error,
        string? nextAttemptAt,
        CancellationToken cancellationToken)
    {
        var idList = ids.ToList();
        if (idList.Count == 0)
        {
            return;
        }

        await EnsureReadyAsync(cancellationToken).ConfigureAwait(false);
        await _gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            await using var tx = (SqliteTransaction)await _connection!.BeginTransactionAsync(cancellationToken)
                .ConfigureAwait(false);

            foreach (var id in idList)
            {
                await using var cmd = _connection.CreateCommand();
                cmd.Transaction = tx;
                cmd.CommandText =
                    """
                    UPDATE event_queue
                    SET status = $status,
                        last_error = $error,
                        next_attempt_at = $next
                    WHERE id = $id;
                    """;
                cmd.Parameters.AddWithValue("$status", status);
                cmd.Parameters.AddWithValue("$error", (object?)error ?? DBNull.Value);
                cmd.Parameters.AddWithValue("$next", (object?)nextAttemptAt ?? DBNull.Value);
                cmd.Parameters.AddWithValue("$id", id);
                await cmd.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
            }

            await tx.CommitAsync(cancellationToken).ConfigureAwait(false);
        }
        finally
        {
            _gate.Release();
        }
    }

    private async Task EnsureReadyAsync(CancellationToken cancellationToken)
    {
        if (_connection is null)
        {
            await InitializeAsync(cancellationToken).ConfigureAwait(false);
        }
    }

    private static QueuedEvent ReadQueuedEvent(SqliteDataReader reader)
    {
        return new QueuedEvent
        {
            Id = reader.GetInt64(0),
            DedupeKey = reader.GetString(1),
            PayloadJson = reader.GetString(2),
            Attempts = reader.GetInt32(3),
            CreatedAt = DateTimeOffset.Parse(reader.GetString(4), CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind),
            NextAttemptAt = reader.IsDBNull(5)
                ? null
                : DateTimeOffset.Parse(reader.GetString(5), CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind),
            LastError = reader.IsDBNull(6) ? null : reader.GetString(6),
            Status = ParseStatus(reader.GetString(7)),
        };
    }

    private static QueuedEventStatus ParseStatus(string status) => status.ToLowerInvariant() switch
    {
        "uploading" => QueuedEventStatus.Uploading,
        "done" => QueuedEventStatus.Done,
        "dead" => QueuedEventStatus.Dead,
        _ => QueuedEventStatus.Pending,
    };

    private static string SanitizeFileName(string value)
    {
        foreach (var c in Path.GetInvalidFileNameChars())
        {
            value = value.Replace(c, '_');
        }

        return value;
    }

    internal sealed class SerializedEvent
    {
        public string LocalDeviceId { get; set; } = "";
        public string ExternalUserId { get; set; } = "";
        public DateTimeOffset DeviceLocalAt { get; set; }
        public string VerificationMethod { get; set; } = "UNKNOWN";
        public string Direction { get; set; } = "UNKNOWN";
        public string? DeviceEventId { get; set; }
        public string? DedupeKey { get; set; }
        public Dictionary<string, object?>? RawPayload { get; set; }
    }

    public static BiometricEvent DeserializePayload(string payloadJson)
    {
        var dto = JsonSerializer.Deserialize<SerializedEvent>(payloadJson, JsonOptions)
                  ?? throw new InvalidOperationException("Invalid queued event payload");

        return new BiometricEvent
        {
            LocalDeviceId = dto.LocalDeviceId,
            ExternalUserId = dto.ExternalUserId,
            DeviceLocalAt = dto.DeviceLocalAt,
            VerificationMethod = dto.VerificationMethod.ToUpperInvariant() switch
            {
                "FINGERPRINT" => VerificationMethod.Fingerprint,
                "RFID" => VerificationMethod.Rfid,
                "PIN" => VerificationMethod.Pin,
                "FACE" => VerificationMethod.Face,
                _ => VerificationMethod.Unknown,
            },
            Direction = dto.Direction.ToUpperInvariant() switch
            {
                "IN" => PunchDirection.In,
                "OUT" => PunchDirection.Out,
                _ => PunchDirection.Unknown,
            },
            DeviceEventId = dto.DeviceEventId,
            DedupeKey = dto.DedupeKey,
            RawPayload = dto.RawPayload,
        };
    }
}
