using System.Collections.Concurrent;
using System.Text;
using Microsoft.Extensions.Logging;
using MyCampusView.Connect.Core.Config;

namespace MyCampusView.Connect.Core.Logging;

/// <summary>
/// Simple daily-rotating file logger under %ProgramData%\MyCampusView\Connect\logs.
/// </summary>
public sealed class RotatingFileLoggerProvider : ILoggerProvider
{
    private readonly ConcurrentDictionary<string, RotatingFileLogger> _loggers = new(StringComparer.OrdinalIgnoreCase);
    private readonly string _directory;
    private readonly LogLevel _minLevel;
    private readonly object _writeLock = new();
    private StreamWriter? _writer;
    private string? _currentDate;
    private bool _disposed;

    public RotatingFileLoggerProvider(string? directory = null, LogLevel minLevel = LogLevel.Information)
    {
        ConnectorConfig.EnsureDirectories();
        _directory = directory ?? ConnectorConfig.LogsDirectory;
        _minLevel = minLevel;
        Directory.CreateDirectory(_directory);
    }

    public ILogger CreateLogger(string categoryName) =>
        _loggers.GetOrAdd(categoryName, name => new RotatingFileLogger(name, this));

    internal void Write(LogLevel level, string category, string message, Exception? exception)
    {
        if (_disposed || level < _minLevel)
        {
            return;
        }

        var line = new StringBuilder()
            .Append(DateTimeOffset.Now.ToString("yyyy-MM-dd HH:mm:ss.fff zzz"))
            .Append(" [")
            .Append(level.ToString().ToUpperInvariant())
            .Append("] ")
            .Append(category)
            .Append(": ")
            .Append(message);

        if (exception is not null)
        {
            line.AppendLine().Append(exception);
        }

        lock (_writeLock)
        {
            EnsureWriter_NoLock();
            _writer!.WriteLine(line.ToString());
            _writer.Flush();
        }
    }

    private void EnsureWriter_NoLock()
    {
        var today = DateTime.Now.ToString("yyyyMMdd");
        if (_writer is not null && string.Equals(_currentDate, today, StringComparison.Ordinal))
        {
            return;
        }

        _writer?.Dispose();
        _currentDate = today;
        var path = Path.Combine(_directory, $"connect-{today}.log");
        _writer = new StreamWriter(new FileStream(path, FileMode.Append, FileAccess.Write, FileShare.ReadWrite), Encoding.UTF8)
        {
            AutoFlush = true,
        };

        TryPruneOldLogs_NoLock(keepDays: 14);
    }

    private void TryPruneOldLogs_NoLock(int keepDays)
    {
        try
        {
            var cutoff = DateTime.Now.Date.AddDays(-keepDays);
            foreach (var file in Directory.EnumerateFiles(_directory, "connect-*.log"))
            {
                var name = Path.GetFileNameWithoutExtension(file);
                if (name.Length >= 8 &&
                    DateTime.TryParseExact(
                        name[^8..],
                        "yyyyMMdd",
                        null,
                        System.Globalization.DateTimeStyles.None,
                        out var fileDate) &&
                    fileDate < cutoff)
                {
                    File.Delete(file);
                }
            }
        }
        catch
        {
            // pruning is best-effort
        }
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        lock (_writeLock)
        {
            _writer?.Dispose();
            _writer = null;
        }

        _loggers.Clear();
    }

    private sealed class RotatingFileLogger : ILogger
    {
        private readonly string _category;
        private readonly RotatingFileLoggerProvider _provider;

        public RotatingFileLogger(string category, RotatingFileLoggerProvider provider)
        {
            _category = category;
            _provider = provider;
        }

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => logLevel >= _provider._minLevel;

        public void Log<TState>(
            LogLevel logLevel,
            EventId eventId,
            TState state,
            Exception? exception,
            Func<TState, Exception?, string> formatter)
        {
            if (!IsEnabled(logLevel))
            {
                return;
            }

            _provider.Write(logLevel, _category, formatter(state, exception), exception);
        }
    }
}
