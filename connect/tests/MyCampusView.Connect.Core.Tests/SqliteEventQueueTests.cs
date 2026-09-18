using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Logging.Abstractions;
using MyCampusView.Connect.Core.Abstractions;
using MyCampusView.Connect.Core.Queue;

namespace MyCampusView.Connect.Core.Tests;

public sealed class SqliteEventQueueTests
{
    [Fact]
    public async Task RestartReturnsAbandonedUploadToPending()
    {
        var path = Path.Combine(Path.GetTempPath(), $"mcv-queue-{Guid.NewGuid():N}.db");
        try
        {
            await using (var first = new SqliteEventQueue(
                             NullLogger<SqliteEventQueue>.Instance,
                             path))
            {
                await first.InitializeAsync();
                await first.EnqueueAsync(new BiometricEvent
                {
                    LocalDeviceId = "gate",
                    ExternalUserId = "9",
                    DeviceLocalAt = new DateTimeOffset(2026, 9, 8, 8, 0, 0, TimeSpan.FromHours(5.5)),
                    DeviceEventId = "event-1",
                });

                var claimed = await first.DequeueBatchAsync(1);
                Assert.Single(claimed);
                Assert.Equal(QueuedEventStatus.Pending, claimed[0].Status);
            }

            await using (var restarted = new SqliteEventQueue(
                             NullLogger<SqliteEventQueue>.Instance,
                             path))
            {
                await restarted.InitializeAsync();

                var recovered = await restarted.DequeueBatchAsync(1);
                Assert.Single(recovered);
                Assert.Equal("gate:event-1", recovered[0].DedupeKey);
            }
        }
        finally
        {
            SqliteConnection.ClearAllPools();
            foreach (var suffix in new[] { "", "-wal", "-shm" })
            {
                var file = path + suffix;
                if (File.Exists(file)) File.Delete(file);
            }
        }
    }
}
