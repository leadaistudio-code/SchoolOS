using Microsoft.Extensions.Logging;
using MyCampusView.Connect.Core.Abstractions;
using MyCampusView.Connect.Core.Adapters.Realtime;
using MyCampusView.Connect.Core.Config;

namespace MyCampusView.Connect.Core.Adapters;

public static class BiometricAdapterFactory
{
    public static IBiometricDeviceAdapter Create(
        DeviceConfigEntry entry,
        ConnectorConfig config,
        string environmentName,
        ILoggerFactory loggerFactory)
    {
        if (string.IsNullOrWhiteSpace(entry.LocalDeviceId))
        {
            throw new InvalidOperationException("Device LocalDeviceId is required.");
        }

        var info = entry.ToDeviceInfo();

        if (entry.IsSimulatorBrand())
        {
            if (!config.AllowSimulator)
            {
                throw new InvalidOperationException(
                    $"Device '{entry.LocalDeviceId}' has Brand=Simulator but Connector:AllowSimulator is false. " +
                    "Simulator mode is blocked (especially for Production).");
            }

            if (string.Equals(environmentName, "Production", StringComparison.OrdinalIgnoreCase) &&
                !config.AllowSimulator)
            {
                throw new InvalidOperationException(
                    "Refusing to create SimulatedBiometricAdapter in Production without explicit AllowSimulator.");
            }

            return new SimulatedBiometricAdapter(
                info,
                loggerFactory.CreateLogger($"Simulator:{entry.LocalDeviceId}"));
        }

        if (entry.IsRealtimeBrand())
        {
            return new RealtimeRS9WAdapter(info);
        }

        throw new NotSupportedException(
            $"Unsupported biometric brand '{entry.Brand}' for device '{entry.LocalDeviceId}'. " +
            "Supported brands in this build: Simulator (lab only), Realtime / RealtimeRS9W (requires vendor SDK).");
    }
}
