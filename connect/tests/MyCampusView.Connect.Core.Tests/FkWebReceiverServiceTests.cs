using System.Net;
using System.Net.Sockets;
using System.Text;
using Microsoft.Extensions.Logging.Abstractions;
using MyCampusView.Connect.Core.Abstractions;
using MyCampusView.Connect.Core.Config;
using MyCampusView.Connect.Core.Services;

namespace MyCampusView.Connect.Core.Tests;

public sealed class FkWebReceiverServiceTests
{
    [Fact]
    public async Task AcknowledgesOnlyAfterQueueAcceptsPunch()
    {
        var port = FreeTcpPort();
        var queue = new RecordingQueue();
        var config = new ConnectorConfig
        {
            FkWebListenPrefix = $"http://127.0.0.1:{port}/",
            Devices =
            [
                new DeviceConfigEntry
                {
                    LocalDeviceId = "main-gate",
                    Brand = "Realtime",
                    Model = "RS9W",
                    ConnectionMode = "FKWEB_PUSH",
                    PushDeviceId = "cloud-device-1",
                    NetworkAddress = "127.0.0.1",
                },
            ],
        };

        await using var receiver = new FkWebReceiverService(
            config,
            queue,
            NullLogger<FkWebReceiverService>.Instance);
        await receiver.StartAsync(CancellationToken.None);

        using var client = new HttpClient();
        using var request = new HttpRequestMessage(
            HttpMethod.Post,
            $"http://127.0.0.1:{port}/hdata.aspx");
        request.Headers.TryAddWithoutValidation("request_code", "realtime_glog");
        request.Headers.TryAddWithoutValidation("dev_id", "cloud-device-1");
        request.Headers.TryAddWithoutValidation("trans_id", "77");
        request.Content = new ByteArrayContent(Encoding.UTF8.GetBytes(
            """{"user_id":"0009","io_time":"2026-09-08 08:00:00","io_mode":0}"""));

        using var response = await client.SendAsync(request);
        var queued = await queue.Event.Task.WaitAsync(TimeSpan.FromSeconds(5));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("9", queued.ExternalUserId);
        Assert.Equal("main-gate", queued.LocalDeviceId);
        Assert.True(response.Headers.TryGetValues("response_code", out var values));
        Assert.Contains("OK", values);
        await receiver.StopAsync(CancellationToken.None);
    }

    [Fact]
    public async Task RejectsAnUnknownDeviceIdentity()
    {
        var port = FreeTcpPort();
        var queue = new RecordingQueue();
        var config = new ConnectorConfig
        {
            FkWebListenPrefix = $"http://127.0.0.1:{port}/",
            Devices =
            [
                new DeviceConfigEntry
                {
                    LocalDeviceId = "main-gate",
                    Brand = "Realtime",
                    Model = "RS9W",
                    ConnectionMode = "FKWEB_PUSH",
                    PushDeviceId = "expected-device",
                    NetworkAddress = "127.0.0.1",
                },
            ],
        };

        await using var receiver = new FkWebReceiverService(
            config,
            queue,
            NullLogger<FkWebReceiverService>.Instance);
        await receiver.StartAsync(CancellationToken.None);

        using var client = new HttpClient();
        using var request = new HttpRequestMessage(
            HttpMethod.Post,
            $"http://127.0.0.1:{port}/hdata.aspx");
        request.Headers.TryAddWithoutValidation("request_code", "realtime_glog");
        request.Headers.TryAddWithoutValidation("dev_id", "wrong-device");
        request.Content = new ByteArrayContent(Encoding.UTF8.GetBytes(
            """{"user_id":"9","io_time":"2026-09-08 08:00:00"}"""));

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.False(queue.Event.Task.IsCompleted);
        await receiver.StopAsync(CancellationToken.None);
    }

    private static int FreeTcpPort()
    {
        var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var port = ((IPEndPoint)listener.LocalEndpoint).Port;
        listener.Stop();
        return port;
    }

    private sealed class RecordingQueue : IEventQueue
    {
        public TaskCompletionSource<BiometricEvent> Event { get; } =
            new(TaskCreationOptions.RunContinuationsAsynchronously);

        public Task InitializeAsync(CancellationToken cancellationToken = default) => Task.CompletedTask;

        public Task EnqueueAsync(BiometricEvent biometricEvent, CancellationToken cancellationToken = default)
        {
            Event.TrySetResult(biometricEvent);
            return Task.CompletedTask;
        }

        public Task EnqueueManyAsync(
            IEnumerable<BiometricEvent> events,
            CancellationToken cancellationToken = default)
        {
            foreach (var item in events) Event.TrySetResult(item);
            return Task.CompletedTask;
        }

        public Task<IReadOnlyList<QueuedEvent>> DequeueBatchAsync(
            int maxCount,
            CancellationToken cancellationToken = default) =>
            Task.FromResult((IReadOnlyList<QueuedEvent>)[]);

        public Task MarkUploadedAsync(IEnumerable<long> ids, CancellationToken cancellationToken = default) =>
            Task.CompletedTask;

        public Task MarkFailedAsync(
            IEnumerable<long> ids,
            string error,
            TimeSpan retryAfter,
            CancellationToken cancellationToken = default) =>
            Task.CompletedTask;

        public Task MarkDeadAsync(
            IEnumerable<long> ids,
            string error,
            CancellationToken cancellationToken = default) =>
            Task.CompletedTask;

        public Task<int> GetPendingCountAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult(0);

        public Task<string?> GetCheckpointAsync(
            string localDeviceId,
            CancellationToken cancellationToken = default) =>
            Task.FromResult<string?>(null);

        public Task SetCheckpointAsync(
            string localDeviceId,
            string checkpoint,
            CancellationToken cancellationToken = default) =>
            Task.CompletedTask;

        public ValueTask DisposeAsync() => ValueTask.CompletedTask;
    }
}
