using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;
using MyCampusView.Connect.Core.Abstractions;
using MyCampusView.Connect.Core.Config;

namespace MyCampusView.Connect.Core.Cloud;

public sealed class CloudApiClient : ICloudApiClient
{
    private readonly HttpClient _http;
    private readonly ConnectorConfig _config;
    private readonly ILogger<CloudApiClient> _logger;
    private string? _bearerSecret;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public CloudApiClient(HttpClient http, ConnectorConfig config, ILogger<CloudApiClient> logger)
    {
        _http = http;
        _config = config;
        _logger = logger;
        ApplyBaseAddress();
    }

    public string ApiBaseUrl => _config.ApiBaseUrl;

    public void SetCredentials(string connectorSecret)
    {
        _bearerSecret = connectorSecret;
        _http.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", connectorSecret);
    }

    public void SetApiBaseUrl(string apiBaseUrl)
    {
        _config.ApiBaseUrl = apiBaseUrl.Trim().TrimEnd('/');
        ApplyBaseAddress();
    }

    private void ApplyBaseAddress()
    {
        if (string.IsNullOrWhiteSpace(_config.ApiBaseUrl))
        {
            return;
        }

        var uri = _config.GetApiBaseUri();
        _http.BaseAddress = uri;
        if (!_http.DefaultRequestHeaders.UserAgent.Any())
        {
            _http.DefaultRequestHeaders.UserAgent.ParseAdd(
                $"MyCampusView.Connect/{_config.ConnectorVersion}");
        }
    }

    public async Task<PairResult> PairAsync(PairRequest request, CancellationToken cancellationToken = default)
    {
        ApplyBaseAddress();
        var body = new
        {
            code = request.Code,
            hostname = request.Hostname,
            osInfo = request.OsInfo,
            connectorVersion = request.ConnectorVersion ?? _config.ConnectorVersion,
            name = request.Name,
        };

        using var response = await _http.PostAsJsonAsync(
            "api/v1/device-gateway/pair",
            body,
            JsonOptions,
            cancellationToken).ConfigureAwait(false);

        var envelope = await ReadEnvelopeAsync<PairResultDto>(response, cancellationToken).ConfigureAwait(false);
        if (envelope.Data is null)
        {
            throw new CloudApiException(response.StatusCode, envelope.Error?.Code, envelope.Error?.Message ?? "Pairing failed");
        }

        return new PairResult
        {
            ConnectorId = envelope.Data.ConnectorId,
            ConnectorKey = envelope.Data.ConnectorKey,
            ConnectorSecret = envelope.Data.ConnectorSecret,
            ConnectorName = envelope.Data.ConnectorName,
            Tenant = envelope.Data.Tenant is null
                ? null
                : new PairTenantInfo
                {
                    Id = envelope.Data.Tenant.Id,
                    Name = envelope.Data.Tenant.Name,
                    Slug = envelope.Data.Tenant.Slug,
                    Timezone = envelope.Data.Tenant.Timezone,
                },
        };
    }

    public async Task<HeartbeatResult> HeartbeatAsync(
        HeartbeatRequest request,
        CancellationToken cancellationToken = default)
    {
        EnsureAuthenticated();
        var body = new
        {
            connectorVersion = request.ConnectorVersion ?? _config.ConnectorVersion,
            hostname = request.Hostname,
            osInfo = request.OsInfo,
            devices = request.Devices,
            pendingEvents = request.PendingEvents,
        };

        using var response = await _http.PostAsJsonAsync(
            "api/v1/device-gateway/heartbeat",
            body,
            JsonOptions,
            cancellationToken).ConfigureAwait(false);

        var envelope = await ReadEnvelopeAsync<HeartbeatResultDto>(response, cancellationToken).ConfigureAwait(false);
        if (envelope.Data is null)
        {
            throw new CloudApiException(response.StatusCode, envelope.Error?.Code, envelope.Error?.Message ?? "Heartbeat failed");
        }

        return new HeartbeatResult
        {
            Ok = envelope.Data.Ok,
            ServerTime = envelope.Data.ServerTime,
        };
    }

    public async Task<DeviceUpsertResult> UpsertDeviceAsync(
        DeviceInfo device,
        CancellationToken cancellationToken = default)
    {
        EnsureAuthenticated();
        var body = new
        {
            localDeviceId = device.LocalDeviceId,
            name = device.Name,
            brand = device.Brand,
            model = device.Model,
            locationLabel = device.LocationLabel,
            purpose = device.ToApiPurpose(),
            serialNumber = device.SerialNumber,
            machineNumber = device.MachineNumber,
            networkAddress = device.NetworkAddress,
            port = device.Port,
            connectionPassword = device.ConnectionPassword,
            firmware = device.Firmware,
            userCount = device.UserCount,
            status = device.ToApiStatus(),
            lastError = device.LastError,
            clockDriftSec = device.ClockDriftSec,
            syncEnabled = device.SyncEnabled,
        };

        using var response = await _http.PostAsJsonAsync(
            "api/v1/device-gateway/devices",
            body,
            JsonOptions,
            cancellationToken).ConfigureAwait(false);

        var envelope = await ReadEnvelopeAsync<DeviceUpsertResultDto>(response, cancellationToken).ConfigureAwait(false);
        if (envelope.Data is null)
        {
            throw new CloudApiException(response.StatusCode, envelope.Error?.Code, envelope.Error?.Message ?? "Device upsert failed");
        }

        return new DeviceUpsertResult
        {
            Id = envelope.Data.Id,
            LocalDeviceId = envelope.Data.LocalDeviceId,
            Name = envelope.Data.Name,
            Status = envelope.Data.Status,
        };
    }

    public async Task<EventBatchResult> UploadEventBatchAsync(
        IReadOnlyList<BiometricEvent> events,
        CancellationToken cancellationToken = default)
    {
        EnsureAuthenticated();
        if (events.Count == 0)
        {
            return new EventBatchResult();
        }

        var payload = new
        {
            events = events.Select(e =>
            {
                e.EnsureDedupeKey();
                return new
                {
                    localDeviceId = e.LocalDeviceId,
                    externalUserId = e.ExternalUserId,
                    deviceLocalAt = e.DeviceLocalAt.ToString("O"),
                    verificationMethod = e.ToApiVerificationMethod(),
                    direction = e.ToApiDirection(),
                    deviceEventId = e.DeviceEventId,
                    dedupeKey = e.DedupeKey,
                    rawPayload = e.RawPayload,
                };
            }).ToArray(),
        };

        using var response = await _http.PostAsJsonAsync(
            "api/v1/device-gateway/events/batch",
            payload,
            JsonOptions,
            cancellationToken).ConfigureAwait(false);

        var envelope = await ReadEnvelopeAsync<EventBatchResultDto>(response, cancellationToken).ConfigureAwait(false);
        if (envelope.Data is null)
        {
            throw new CloudApiException(response.StatusCode, envelope.Error?.Code, envelope.Error?.Message ?? "Event batch upload failed");
        }

        return new EventBatchResult
        {
            Accepted = envelope.Data.Accepted,
            Duplicate = envelope.Data.Duplicate,
            Rejected = envelope.Data.Rejected,
            Results = (envelope.Data.Results ?? Array.Empty<EventBatchItemResultDto>())
                .Select(r => new EventBatchItemResult
                {
                    DedupeKey = r.DedupeKey ?? "",
                    Outcome = r.Outcome ?? "",
                    EventId = r.EventId,
                    Error = r.Error,
                })
                .ToList(),
        };
    }

    public async Task<IReadOnlyList<ConnectorCommand>> ClaimCommandsAsync(
        CancellationToken cancellationToken = default)
    {
        EnsureAuthenticated();
        using var response = await _http.GetAsync("api/v1/device-gateway/commands", cancellationToken)
            .ConfigureAwait(false);

        var envelope = await ReadEnvelopeAsync<List<ConnectorCommandDto>>(response, cancellationToken)
            .ConfigureAwait(false);
        if (envelope.Data is null)
        {
            throw new CloudApiException(response.StatusCode, envelope.Error?.Code, envelope.Error?.Message ?? "Command poll failed");
        }

        return envelope.Data.Select(c => new ConnectorCommand
        {
            Id = c.Id,
            Type = c.Type,
            Payload = c.Payload,
            DeviceId = c.DeviceId,
            LocalDeviceId = c.LocalDeviceId,
            DeviceName = c.DeviceName,
            CreatedAt = c.CreatedAt,
        }).ToList();
    }

    public async Task ReportCommandResultAsync(
        string commandId,
        CommandResultReport report,
        CancellationToken cancellationToken = default)
    {
        EnsureAuthenticated();
        var body = new
        {
            status = report.Status,
            result = report.Result,
            error = report.Error,
        };

        using var response = await _http.PostAsJsonAsync(
            $"api/v1/device-gateway/commands/{Uri.EscapeDataString(commandId)}/result",
            body,
            JsonOptions,
            cancellationToken).ConfigureAwait(false);

        var envelope = await ReadEnvelopeAsync<object>(response, cancellationToken).ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
        {
            throw new CloudApiException(
                response.StatusCode,
                envelope.Error?.Code,
                envelope.Error?.Message ?? "Command result report failed");
        }
    }

    private void EnsureAuthenticated()
    {
        ApplyBaseAddress();
        if (string.IsNullOrWhiteSpace(_bearerSecret) &&
            _http.DefaultRequestHeaders.Authorization is null)
        {
            throw new InvalidOperationException("Cloud API credentials have not been set. Pair the connector first.");
        }
    }

    private async Task<ApiEnvelope<T>> ReadEnvelopeAsync<T>(
        HttpResponseMessage response,
        CancellationToken cancellationToken)
    {
        var raw = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
        if (string.IsNullOrWhiteSpace(raw))
        {
            if (!response.IsSuccessStatusCode)
            {
                throw new CloudApiException(response.StatusCode, null, $"HTTP {(int)response.StatusCode} with empty body");
            }

            return new ApiEnvelope<T>();
        }

        try
        {
            var envelope = JsonSerializer.Deserialize<ApiEnvelope<T>>(raw, JsonOptions) ?? new ApiEnvelope<T>();
            if (!response.IsSuccessStatusCode && envelope.Error is not null)
            {
                _logger.LogWarning(
                    "Cloud API {Status}: {Code} {Message}",
                    (int)response.StatusCode,
                    envelope.Error.Code,
                    envelope.Error.Message);
            }

            return envelope;
        }
        catch (JsonException ex)
        {
            throw new CloudApiException(
                response.StatusCode,
                "PARSE_ERROR",
                $"Could not parse API response: {ex.Message}. Body starts with: {Truncate(raw, 200)}");
        }
    }

    private static string Truncate(string value, int max) =>
        value.Length <= max ? value : value[..max] + "…";

    private sealed class ApiEnvelope<T>
    {
        public T? Data { get; set; }
        public ApiError? Error { get; set; }
    }

    private sealed class ApiError
    {
        public string? Code { get; set; }
        public string? Message { get; set; }
    }

    private sealed class PairResultDto
    {
        public string ConnectorId { get; set; } = "";
        public string ConnectorKey { get; set; } = "";
        public string ConnectorSecret { get; set; } = "";
        public string ConnectorName { get; set; } = "";
        public PairTenantDto? Tenant { get; set; }
    }

    private sealed class PairTenantDto
    {
        public string? Id { get; set; }
        public string? Name { get; set; }
        public string? Slug { get; set; }
        public string? Timezone { get; set; }
    }

    private sealed class HeartbeatResultDto
    {
        public bool Ok { get; set; }
        public string? ServerTime { get; set; }
    }

    private sealed class DeviceUpsertResultDto
    {
        public string? Id { get; set; }
        public string? LocalDeviceId { get; set; }
        public string? Name { get; set; }
        public string? Status { get; set; }
    }

    private sealed class EventBatchResultDto
    {
        public int Accepted { get; set; }
        public int Duplicate { get; set; }
        public int Rejected { get; set; }
        public List<EventBatchItemResultDto>? Results { get; set; }
    }

    private sealed class EventBatchItemResultDto
    {
        public string? DedupeKey { get; set; }
        public string? Outcome { get; set; }
        public string? EventId { get; set; }
        public string? Error { get; set; }
    }

    private sealed class ConnectorCommandDto
    {
        public string Id { get; set; } = "";
        public string Type { get; set; } = "";
        public object? Payload { get; set; }
        public string? DeviceId { get; set; }
        public string? LocalDeviceId { get; set; }
        public string? DeviceName { get; set; }
        public DateTimeOffset? CreatedAt { get; set; }
    }
}

public sealed class CloudApiException : Exception
{
    public CloudApiException(System.Net.HttpStatusCode statusCode, string? code, string message)
        : base(message)
    {
        StatusCode = statusCode;
        Code = code;
    }

    public System.Net.HttpStatusCode StatusCode { get; }
    public string? Code { get; }
}
