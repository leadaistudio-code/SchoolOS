using System.Security.Cryptography;
using MyCampusView.Connect.Core.Config;

namespace MyCampusView.Connect.Core.Tests;

public sealed class SecureCredentialStoreTests
{
    [Fact]
    public void CanReplaceExistingHiddenCredentialsDuringRepair()
    {
        var path = Path.Combine(Path.GetTempPath(), $"mcv-credentials-{Guid.NewGuid():N}.dpapi");
        try
        {
            var store = new SecureCredentialStore(path, DataProtectionScope.LocalMachine);
            store.Save(Credentials("old-secret", "old-tenant"));
            Assert.True(File.GetAttributes(path).HasFlag(FileAttributes.Hidden));

            store.Save(Credentials("new-secret", "new-tenant"));
            var loaded = store.LoadRequired();

            Assert.Equal("new-secret", loaded.ConnectorSecret);
            Assert.Equal("new-tenant", loaded.TenantSlug);
            Assert.True(File.GetAttributes(path).HasFlag(FileAttributes.Hidden));
        }
        finally
        {
            if (File.Exists(path))
            {
                File.SetAttributes(path, FileAttributes.Normal);
                File.Delete(path);
            }
        }
    }

    private static StoredCredentials Credentials(string secret, string tenantSlug) => new()
    {
        ApiBaseUrl = $"https://{tenantSlug}.mycampusview.com",
        ConnectorId = "connector-id",
        ConnectorKey = "connector-key",
        ConnectorSecret = secret,
        TenantSlug = tenantSlug,
    };
}
