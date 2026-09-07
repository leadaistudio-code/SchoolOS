using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace MyCampusView.Connect.Core.Config;

public sealed class StoredCredentials
{
    public required string ApiBaseUrl { get; init; }

    public required string ConnectorId { get; init; }

    public required string ConnectorKey { get; init; }

    public required string ConnectorSecret { get; init; }

    public string? ConnectorName { get; init; }

    public string? TenantId { get; init; }

    public string? TenantName { get; init; }

    public string? TenantSlug { get; init; }

    public DateTimeOffset PairedAt { get; init; } = DateTimeOffset.UtcNow;
}

/// <summary>
/// Persists the connector secret using Windows DPAPI (CurrentUser scope by default).
/// Falls back to LocalMachine when running as a Windows Service without an interactive user profile.
/// </summary>
public sealed class SecureCredentialStore
{
    private readonly string _path;
    private readonly DataProtectionScope _scope;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = false,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    public SecureCredentialStore(string? path = null, DataProtectionScope? scope = null)
    {
        ConnectorConfig.EnsureDirectories();
        _path = path ?? ConnectorConfig.CredentialsPath;
        _scope = scope ?? DetectScope();
    }

    public static DataProtectionScope DetectScope()
    {
        // Prefer CurrentUser when a real user profile is loaded; LocalMachine for SYSTEM service accounts.
        try
        {
            var userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            if (!string.IsNullOrWhiteSpace(userProfile) &&
                !userProfile.Contains("systemprofile", StringComparison.OrdinalIgnoreCase) &&
                Directory.Exists(userProfile))
            {
                return DataProtectionScope.CurrentUser;
            }
        }
        catch
        {
            // ignore and fall through
        }

        return DataProtectionScope.LocalMachine;
    }

    public bool Exists() => File.Exists(_path);

    public void Save(StoredCredentials credentials)
    {
        var json = JsonSerializer.Serialize(credentials, JsonOptions);
        var plain = Encoding.UTF8.GetBytes(json);
        var protectedBytes = ProtectedData.Protect(plain, optionalEntropy: null, scope: _scope);
        var directory = Path.GetDirectoryName(_path);
        if (!string.IsNullOrEmpty(directory))
        {
            Directory.CreateDirectory(directory);
        }

        File.WriteAllBytes(_path, protectedBytes);
        TryHardenAcl(_path);
    }

    public StoredCredentials? TryLoad()
    {
        if (!File.Exists(_path))
        {
            return null;
        }

        var protectedBytes = File.ReadAllBytes(_path);
        byte[] plain;
        try
        {
            plain = ProtectedData.Unprotect(protectedBytes, optionalEntropy: null, scope: _scope);
        }
        catch (CryptographicException)
        {
            // Retry alternate scope (service vs interactive pairing mismatch).
            var alternate = _scope == DataProtectionScope.CurrentUser
                ? DataProtectionScope.LocalMachine
                : DataProtectionScope.CurrentUser;
            plain = ProtectedData.Unprotect(protectedBytes, optionalEntropy: null, scope: alternate);
        }

        var json = Encoding.UTF8.GetString(plain);
        return JsonSerializer.Deserialize<StoredCredentials>(json, JsonOptions);
    }

    public StoredCredentials LoadRequired()
    {
        return TryLoad()
               ?? throw new InvalidOperationException(
                   $"No connector credentials found at '{_path}'. Run MyCampusView.Connect.Setup to pair.");
    }

    public void Delete()
    {
        if (File.Exists(_path))
        {
            File.Delete(_path);
        }
    }

    private static void TryHardenAcl(string path)
    {
        try
        {
            // Best-effort: hide from casual browsing; ACL hardening is OS-admin responsibility.
            var attrs = File.GetAttributes(path);
            if ((attrs & FileAttributes.Hidden) == 0)
            {
                File.SetAttributes(path, attrs | FileAttributes.Hidden);
            }
        }
        catch
        {
            // non-fatal
        }
    }
}
