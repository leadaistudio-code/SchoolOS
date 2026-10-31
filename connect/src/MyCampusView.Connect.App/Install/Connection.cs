using Microsoft.Extensions.Logging.Abstractions;
using MyCampusView.Connect.Core.Abstractions;
using MyCampusView.Connect.Core.Cloud;
using MyCampusView.Connect.Core.Config;

namespace MyCampusView.Connect.App.Install;

/// <summary>Talks to MyCampusView: pairing and a liveness check with the stored credential.</summary>
static class Connection
{
    public static string NormalizeServer(string? raw)
    {
        var s = (raw ?? "").Trim().TrimEnd('/');
        if (s.Length == 0) return AppInfo.DefaultServer;
        if (!s.Contains("://")) s = "https://" + s;
        if (!Uri.TryCreate(s, UriKind.Absolute, out var uri) || (uri.Scheme != "https" && uri.Scheme != "http"))
        {
            throw new ArgumentException("That server address is not a valid web address.");
        }
        return uri.GetLeftPart(UriPartial.Authority);
    }

    /// <summary>Accepts "MCV-ABCD-EFGH", "mcv abcd efgh" or "MCVABCDEFGH" and returns the display form.</summary>
    public static string NormalizeCode(string? raw)
    {
        var compact = new string((raw ?? "").Where(char.IsLetterOrDigit).ToArray()).ToUpperInvariant();
        if (compact.StartsWith("MCV") && compact.Length == 11)
        {
            return $"MCV-{compact.Substring(3, 4)}-{compact.Substring(7, 4)}";
        }
        return (raw ?? "").Trim().ToUpperInvariant();
    }

    public static StoredCredentials? Current()
    {
        try { return new SecureCredentialStore().TryLoad(); }
        catch { return null; }
    }

    /// <param name="connectorName">Null keeps the name chosen when the code was generated.</param>
    public static async Task<StoredCredentials> PairAsync(string server, string code, string? connectorName, CancellationToken ct)
    {
        if (code.Count(char.IsLetterOrDigit) < 6)
        {
            throw new InvalidOperationException("That pairing code is too short. It looks like MCV-ABCD-EFGH.");
        }
        // A code works once: make sure the credential can be saved before spending it.
        EnsureCredentialsWritable();

        var config = new ConnectorConfig
        {
            ApiBaseUrl = server,
            ConnectorVersion = AppInfo.Version,
            ConnectorName = connectorName,
        };
        using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(45) };
        var cloud = new CloudApiClient(http, config, NullLogger<CloudApiClient>.Instance);

        PairResult result;
        try
        {
            result = await cloud.PairAsync(new PairRequest
            {
                Code = code,
                Hostname = Environment.MachineName,
                OsInfo = $"{Environment.OSVersion}; .NET {Environment.Version}",
                ConnectorVersion = AppInfo.Version,
                Name = connectorName,
            }, ct).ConfigureAwait(false);
        }
        catch (CloudApiException ex)
        {
            throw new InvalidOperationException(ex.Code switch
            {
                "CONFLICT" => "That pairing code is wrong, already used or expired. Generate a new one in MyCampusView and try again.",
                "RATE_LIMITED" => "Too many attempts. Wait a minute and try again.",
                "VALIDATION_ERROR" => "MyCampusView did not accept that pairing code. Check it and try again.",
                _ => ex.Message,
            });
        }
        catch (HttpRequestException ex)
        {
            throw new InvalidOperationException(
                $"Could not reach {server}. Check this PC's internet connection. ({ex.Message})");
        }
        catch (TaskCanceledException) when (!ct.IsCancellationRequested)
        {
            throw new InvalidOperationException($"{server} did not answer in time. Check the internet connection and try again.");
        }

        var credentials = new StoredCredentials
        {
            ApiBaseUrl = server,
            ConnectorId = result.ConnectorId,
            ConnectorKey = result.ConnectorKey,
            ConnectorSecret = result.ConnectorSecret,
            ConnectorName = result.ConnectorName,
            TenantId = result.Tenant?.Id,
            TenantName = result.Tenant?.Name,
            TenantSlug = result.Tenant?.Slug,
            PairedAt = DateTimeOffset.UtcNow,
        };
        new SecureCredentialStore().Save(credentials);
        SetupLog.Write($"Paired as '{result.ConnectorName}' to {result.Tenant?.Name} ({result.Tenant?.Slug}) via {server}.");
        return credentials;
    }

    static void EnsureCredentialsWritable()
    {
        try
        {
            ConnectorConfig.EnsureDirectories();
            var probe = Path.Combine(ConnectorConfig.ProgramDataRoot, $".write-test-{Guid.NewGuid():N}");
            File.WriteAllText(probe, "");
            File.Delete(probe);
            if (File.Exists(ConnectorConfig.CredentialsPath))
            {
                var attrs = File.GetAttributes(ConnectorConfig.CredentialsPath);
                File.SetAttributes(ConnectorConfig.CredentialsPath, attrs);
                using var _ = new FileStream(ConnectorConfig.CredentialsPath, FileMode.Open, FileAccess.ReadWrite, FileShare.Read);
            }
        }
        catch (Exception e) when (e is UnauthorizedAccessException or IOException)
        {
            throw new InvalidOperationException(
                $"This PC's saved connection cannot be updated ({e.Message}). Run MyCampusView Connect as an administrator and try again — the pairing code has not been used.");
        }
    }

    /// <summary>A heartbeat with the stored secret: proves the internet path and the credential.</summary>
    public static async Task<string?> VerifyAsync(StoredCredentials creds, int deviceCount, CancellationToken ct)
    {
        try
        {
            var config = new ConnectorConfig { ApiBaseUrl = creds.ApiBaseUrl, ConnectorVersion = AppInfo.Version };
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
            var cloud = new CloudApiClient(http, config, NullLogger<CloudApiClient>.Instance);
            cloud.SetCredentials(creds.ConnectorSecret);
            await cloud.HeartbeatAsync(new HeartbeatRequest
            {
                ConnectorVersion = AppInfo.Version,
                Hostname = Environment.MachineName,
                OsInfo = $"{Environment.OSVersion}",
                Devices = deviceCount,
            }, ct).ConfigureAwait(false);
            return null;
        }
        catch (CloudApiException ex) when ((int)ex.StatusCode is 401 or 403)
        {
            return "MyCampusView no longer accepts this PC's connection (it may have been revoked). Pair it again with a new code.";
        }
        catch (Exception ex)
        {
            return $"Could not reach MyCampusView: {ex.Message}";
        }
    }
}
