using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace MyCampusView.Connect;

/// <summary>
/// Thin hosted worker that keeps the process alive for Windows Service hosting.
/// Device sync / upload / heartbeat live in <see cref="Core.Services.SyncService"/>.
/// </summary>
public sealed class Worker : BackgroundService
{
    private readonly ILogger<Worker> _logger;
    private readonly IHostEnvironment _environment;

    public Worker(ILogger<Worker> logger, IHostEnvironment environment)
    {
        _logger = logger;
        _environment = environment;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation(
            "MyCampusView Connect worker online (env={Env}, machine={Machine})",
            _environment.EnvironmentName,
            Environment.MachineName);

        try
        {
            await Task.Delay(Timeout.Infinite, stoppingToken).ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // graceful stop
        }

        _logger.LogInformation("MyCampusView Connect worker stopping");
    }
}
