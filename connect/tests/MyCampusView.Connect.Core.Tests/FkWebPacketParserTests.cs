using System.Text;
using MyCampusView.Connect.Core.Abstractions;
using MyCampusView.Connect.Core.Adapters.Realtime;

namespace MyCampusView.Connect.Core.Tests;

public sealed class FkWebPacketParserTests
{
    [Fact]
    public void ParsesLegacyAttendanceAndIgnoresBinaryTail()
    {
        var json =
            """{"user_id":"00000123","io_time":"2026-09-08 08:15:00","io_mode":16777216,"note":"brace } in text"}""";
        var body = new byte[] { 1, 2, 3, 4 }
            .Concat(Encoding.UTF8.GetBytes(json))
            .Concat([(byte)0, (byte)255, (byte)'{', (byte)12])
            .ToArray();
        var headers = new Dictionary<string, string?>
        {
            ["cmd_id"] = "RTLogSendAction",
            ["dev_id"] = "device-cloud-id",
            ["trans_id"] = "42",
        };

        var ok = FkWebPacketParser.TryParse(
            body,
            headers,
            "front-gate",
            out var packet,
            out var biometricEvent,
            out var error);

        Assert.True(ok, error);
        Assert.Equal(FkWebPacketKind.Attendance, packet.Kind);
        Assert.Equal("FKDATA_HS102", packet.Protocol);
        Assert.NotNull(biometricEvent);
        Assert.Equal("123", biometricEvent.ExternalUserId);
        Assert.Equal(PunchDirection.In, biometricEvent.Direction);
        Assert.Equal("front-gate", biometricEvent.LocalDeviceId);
    }

    [Fact]
    public void ParsesEbknAttendanceAndUsesHeaderDialect()
    {
        var body = Encoding.UTF8.GetBytes(
            """{"user_id":"45","io_time":"2026/09/08 17:30:00","io_mode":33554432}""");
        var headers = new Dictionary<string, string?>
        {
            ["request_code"] = "realtime_glog",
            ["dev_id"] = "device-cloud-id",
            ["trans_id"] = "99",
        };

        var ok = FkWebPacketParser.TryParse(
            body,
            headers,
            "front-gate",
            out var packet,
            out var biometricEvent,
            out var error);

        Assert.True(ok, error);
        Assert.Equal("EBKN_FKWEB", packet.Protocol);
        Assert.Equal("99", packet.TransactionId);
        Assert.Equal(PunchDirection.Out, biometricEvent!.Direction);
    }

    [Fact]
    public void DoesNotAcceptMalformedAttendance()
    {
        var headers = new Dictionary<string, string?>
        {
            ["request_code"] = "realtime_glog",
            ["dev_id"] = "device-cloud-id",
        };

        var ok = FkWebPacketParser.TryParse(
            Encoding.UTF8.GetBytes("""{"user_id":"12"}"""),
            headers,
            "front-gate",
            out _,
            out var biometricEvent,
            out var error);

        Assert.False(ok);
        Assert.Null(biometricEvent);
        Assert.Contains("missing", error, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void GeneratesStableEventIdForRetransmissions()
    {
        var body = Encoding.UTF8.GetBytes(
            """{"user_id":"12","io_time":"2026-09-08 09:00:00","io_mode":0}""");
        var headers = new Dictionary<string, string?>
        {
            ["request_code"] = "realtime_glog",
            ["dev_id"] = "device-cloud-id",
        };

        FkWebPacketParser.TryParse(body, headers, "gate", out _, out var first, out _);
        FkWebPacketParser.TryParse(body, headers, "gate", out _, out var second, out _);

        Assert.Equal(first!.DeviceEventId, second!.DeviceEventId);
        Assert.Equal(first.EnsureDedupeKey(), second.EnsureDedupeKey());
    }
}
