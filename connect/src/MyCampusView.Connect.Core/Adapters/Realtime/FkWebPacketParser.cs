using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using MyCampusView.Connect.Core.Abstractions;

namespace MyCampusView.Connect.Core.Adapters.Realtime;

public enum FkWebPacketKind
{
    Attendance,
    Heartbeat,
    Enrollment,
    CommandPoll,
    CommandResult,
    Unknown,
}

public sealed record FkWebPacket(
    FkWebPacketKind Kind,
    string Protocol,
    string? DeviceId,
    string? TransactionId,
    JsonElement? Json);

/// <summary>Parses the two common FKWeb dialects used by RS9W-family firmware.</summary>
public static class FkWebPacketParser
{
    private static readonly string[] TimeFormats =
    [
        "yyyy-MM-dd HH:mm:ss",
        "yyyy/MM/dd HH:mm:ss",
        "yyyyMMddHHmmss",
        "dd-MM-yyyy HH:mm:ss",
        "O",
    ];

    public static bool TryParse(
        ReadOnlySpan<byte> body,
        IReadOnlyDictionary<string, string?> headers,
        string localDeviceId,
        out FkWebPacket packet,
        out BiometricEvent? biometricEvent,
        out string? error)
    {
        var requestCode = Header(headers, "request_code");
        var commandId = Header(headers, "cmd_id");
        var deviceId = Header(headers, "dev_id");
        var transactionId = Header(headers, "trans_id");
        var protocol = string.IsNullOrWhiteSpace(requestCode) ? "FKDATA_HS102" : "EBKN_FKWEB";
        var json = ExtractJson(body);
        var kind = Classify(requestCode, commandId, json);

        packet = new FkWebPacket(kind, protocol, deviceId, transactionId, json);
        biometricEvent = null;
        error = null;

        if (kind != FkWebPacketKind.Attendance)
        {
            return kind != FkWebPacketKind.Unknown;
        }

        if (json is null || json.Value.ValueKind != JsonValueKind.Object)
        {
            error = "Attendance packet did not contain a valid JSON object";
            return false;
        }

        var root = json.Value;
        var userId = FirstString(root, "user_id", "userId", "pin", "enroll_id", "enrollid");
        var timeText = FirstString(root, "io_time", "time", "verify_time", "timestamp", "record_time");
        if (string.IsNullOrWhiteSpace(userId) || string.IsNullOrWhiteSpace(timeText))
        {
            error = "Attendance packet is missing user_id or io_time";
            return false;
        }

        if (!TryParseDeviceTime(timeText, out var deviceTime))
        {
            error = $"Unsupported device time format: {timeText}";
            return false;
        }

        var ioMode = FirstString(root, "io_mode", "direction", "in_out", "status");
        var verifyMode = FirstString(root, "verify_mode", "verify_type", "verification", "verifymode");
        var eventId = FirstString(root, "log_id", "record_id", "event_id", "id");
        eventId ??= StablePacketId(deviceId ?? localDeviceId, body);

        biometricEvent = new BiometricEvent
        {
            LocalDeviceId = localDeviceId,
            ExternalUserId = NormalizeUserId(userId),
            DeviceLocalAt = deviceTime,
            VerificationMethod = ParseVerificationMethod(verifyMode),
            Direction = ParseDirection(ioMode),
            DeviceEventId = eventId,
            RawPayload = new Dictionary<string, object?>
            {
                ["protocol"] = protocol,
                ["deviceId"] = deviceId,
                ["transactionId"] = transactionId,
                ["requestCode"] = requestCode,
                ["commandId"] = commandId,
                ["ioMode"] = ioMode,
                ["verifyMode"] = verifyMode,
            },
        };
        return true;
    }

    public static JsonElement? ExtractJson(ReadOnlySpan<byte> body)
    {
        var start = body.IndexOf((byte)'{');
        if (start < 0) return null;

        var depth = 0;
        var inString = false;
        var escaped = false;
        for (var i = start; i < body.Length; i++)
        {
            var current = body[i];
            if (escaped)
            {
                escaped = false;
                continue;
            }
            if (inString)
            {
                if (current == (byte)'\\') escaped = true;
                else if (current == (byte)'"') inString = false;
                continue;
            }
            if (current == (byte)'"') inString = true;
            else if (current == (byte)'{') depth++;
            else if (current == (byte)'}' && --depth == 0)
            {
                try
                {
                    using var document = JsonDocument.Parse(body.Slice(start, i - start + 1).ToArray());
                    return document.RootElement.Clone();
                }
                catch (JsonException)
                {
                    return null;
                }
            }
        }
        return null;
    }

    private static FkWebPacketKind Classify(string? requestCode, string? commandId, JsonElement? json)
    {
        var code = (requestCode ?? commandId ?? "").Trim().ToLowerInvariant();
        if (code.Contains("realtime_glog") || code.Contains("rtlog") || code.Contains("logsend"))
            return FkWebPacketKind.Attendance;
        if (code.Contains("enroll")) return FkWebPacketKind.Enrollment;
        if (code == "receive_cmd") return FkWebPacketKind.CommandPoll;
        if (code == "send_cmd_result") return FkWebPacketKind.CommandResult;

        if (json is { ValueKind: JsonValueKind.Object } root)
        {
            if (!string.IsNullOrWhiteSpace(FirstString(root, "user_id", "userId", "pin")) &&
                !string.IsNullOrWhiteSpace(FirstString(root, "io_time", "time", "verify_time")))
                return FkWebPacketKind.Attendance;
            if (root.TryGetProperty("fk_info", out _)) return FkWebPacketKind.Heartbeat;
        }
        return FkWebPacketKind.Unknown;
    }

    private static string? Header(IReadOnlyDictionary<string, string?> headers, string name) =>
        headers.FirstOrDefault(pair => pair.Key.Equals(name, StringComparison.OrdinalIgnoreCase)).Value;

    private static string? FirstString(JsonElement root, params string[] names)
    {
        foreach (var name in names)
        {
            if (!root.TryGetProperty(name, out var value)) continue;
            return value.ValueKind switch
            {
                JsonValueKind.String => value.GetString(),
                JsonValueKind.Number => value.GetRawText(),
                _ => null,
            };
        }
        return null;
    }

    private static bool TryParseDeviceTime(string value, out DateTimeOffset result)
    {
        foreach (var format in TimeFormats)
        {
            if (DateTimeOffset.TryParseExact(
                    value,
                    format,
                    CultureInfo.InvariantCulture,
                    DateTimeStyles.AllowWhiteSpaces | DateTimeStyles.AssumeLocal,
                    out result))
                return true;
        }
        return DateTimeOffset.TryParse(
            value,
            CultureInfo.InvariantCulture,
            DateTimeStyles.AllowWhiteSpaces | DateTimeStyles.AssumeLocal,
            out result);
    }

    private static string NormalizeUserId(string value)
    {
        var trimmed = value.Trim();
        var normalized = trimmed.TrimStart('0');
        return normalized.Length == 0 ? "0" : normalized;
    }

    private static PunchDirection ParseDirection(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return PunchDirection.Unknown;
        var normalized = value.Trim().ToUpperInvariant();
        if (normalized is "IN" or "CHECKIN" or "CHECK_IN" or "0" or "16777216")
            return PunchDirection.In;
        if (normalized is "OUT" or "CHECKOUT" or "CHECK_OUT" or "1" or "33554432")
            return PunchDirection.Out;
        return PunchDirection.Unknown;
    }

    private static VerificationMethod ParseVerificationMethod(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return VerificationMethod.Unknown;
        var normalized = value.Trim().ToUpperInvariant();
        if (normalized.Contains("FINGER")) return VerificationMethod.Fingerprint;
        if (normalized.Contains("CARD") || normalized.Contains("RFID")) return VerificationMethod.Rfid;
        if (normalized.Contains("FACE")) return VerificationMethod.Face;
        if (normalized.Contains("PIN") || normalized.Contains("PASSWORD")) return VerificationMethod.Pin;
        return VerificationMethod.Unknown;
    }

    private static string StablePacketId(string deviceId, ReadOnlySpan<byte> body)
    {
        var deviceBytes = Encoding.UTF8.GetBytes(deviceId);
        var combined = new byte[deviceBytes.Length + body.Length];
        deviceBytes.CopyTo(combined, 0);
        body.CopyTo(combined.AsSpan(deviceBytes.Length));
        return Convert.ToHexString(SHA256.HashData(combined)).ToLowerInvariant();
    }
}
