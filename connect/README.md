# MyCampusView Connect

Windows biometric device gateway for [MyCampusView](https://mycampusview.com) school ERP.

This is a **.NET 8 Worker Service** that pairs to a school tenant, receives or polls local biometric terminals, queues punches in SQLite under ProgramData, and uploads batches to the cloud device-gateway API.

> **Realtime RS9W:** SDK-free attendance is supported through the terminal's
> `FkWeb` push mode. SDK polling remains a separate optional mode and still
> requires the manufacturer DLL.

## Solution layout

```
connect/
  MyCampusView.Connect.sln
  scripts/          publish + Windows Service install/uninstall
  src/
    MyCampusView.Connect/          Worker (Windows Service host)
    MyCampusView.Connect.Core/     Adapters, queue, cloud client, sync
    MyCampusView.Connect.Setup/    Interactive pairing console
```

## Requirements

- Windows 10/11 or Windows Server
- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0) to build
- .NET 8 Desktop/Runtime on the school PC to run (framework-dependent publish)
- A MyCampusView tenant with Biometric module and a fresh pairing code

## Build

```powershell
cd connect
dotnet build MyCampusView.Connect.sln -c Release
```

Publish binaries:

```powershell
.\scripts\publish.ps1
```

Outputs:

- `artifacts\publish\Connect\MyCampusView.Connect.exe`
- `artifacts\publish\Setup\MyCampusView.Connect.Setup.exe`

## Pairing

1. In MyCampusView (school admin) open **Biometric** → create a pairing code (valid ~30 minutes).
2. On the school PC, run Setup (elevated recommended so LocalMachine DPAPI works well for the service account):

```powershell
.\artifacts\publish\Setup\MyCampusView.Connect.Setup.exe
```

Or non-interactive:

```powershell
.\artifacts\publish\Setup\MyCampusView.Connect.Setup.exe `
  "https://your-school-host" `
  "MCV-XXXX-XXXX" `
  "Office Front Desk"
```

Setup calls `POST /api/v1/device-gateway/pair`, then stores:

| Path | Contents |
|------|----------|
| `%ProgramData%\MyCampusView\Connect\credentials.dpapi` | Connector secret (Windows DPAPI) |
| `%ProgramData%\MyCampusView\Connect\config.json` | API base URL + device list overlay |

## Configure devices

Edit `%ProgramData%\MyCampusView\Connect\config.json`:

```json
{
  "ApiBaseUrl": "https://your-school-host",
  "AllowSimulator": false,
  "HeartbeatIntervalSeconds": 30,
  "Devices": [
    {
      "LocalDeviceId": "gate-1",
      "Name": "Main Gate",
      "Brand": "Realtime",
      "Model": "RS9W",
      "ConnectionMode": "FKWEB_PUSH",
      "PushDeviceId": "CLOUD_ID_FROM_THE_TERMINAL",
      "NetworkAddress": "192.168.1.224",
      "Purpose": "BOTH",
      "SyncEnabled": true
    }
  ]
}
```

Supported `Brand` values in this build:

| Brand | Behavior |
|-------|----------|
| `Simulator` | Lab punches only when `AllowSimulator` is `true` |
| `Realtime` / `RealtimeRS9W` / `RS9W` + `FKWEB_PUSH` | SDK-free local HTTP push receiver |
| `Realtime` / `RealtimeRS9W` / `RS9W` + `SDK` | Stub until the vendor SDK is installed |

## Install as a Windows Service

```powershell
# From an elevated PowerShell
.\scripts\publish.ps1
.\scripts\install-service.ps1 -EnableFkWeb -FkWebPort 8080
```

Uninstall:

```powershell
.\scripts\uninstall-service.ps1
```

Service name: `MyCampusViewConnect` (display name **MyCampusView Connect**).  
Install sets `DOTNET_ENVIRONMENT=Production` so the simulator stays **off** unless you explicitly set `"AllowSimulator": true` in ProgramData config (not recommended on live campuses).

## Simulator mode

Use only for development / demos.

1. Set environment to Development when running the worker interactively, **or** set `"AllowSimulator": true` in ProgramData `config.json`.
2. Add a device with `"Brand": "Simulator"`.
3. `appsettings.Development.json` already includes a sample simulator device and `AllowSimulator: true`.

Production defaults:

- `appsettings.json` → `AllowSimulator: false`
- Empty `Devices` list (no simulator device by default)
- Worker refuses Simulator brands in Production unless `AllowSimulator` is explicitly true

```powershell
cd src\MyCampusView.Connect
$env:DOTNET_ENVIRONMENT = "Development"
dotnet run
```

## Runtime data

All durable state lives under:

```
%ProgramData%\MyCampusView\Connect\
  queue.db          SQLite durable event queue + checkpoints
  credentials.dpapi DPAPI-protected connector secret
  config.json       Ops overlay (URL, devices, intervals)
  logs\connect-YYYYMMDD.log
  checkpoints\      Human-readable checkpoint mirrors
  fkweb-diagnostics\ Unknown FKWeb packets retained for safe diagnosis
```

## Cloud API surface used

Authenticated with `Authorization: Bearer <connectorSecret>` (except pair):

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/device-gateway/pair` | Exchange pairing code |
| POST | `/api/v1/device-gateway/heartbeat` | ~30s liveness |
| POST | `/api/v1/device-gateway/devices` | Upsert local device |
| POST | `/api/v1/device-gateway/events/batch` | Batch punch upload |
| GET | `/api/v1/device-gateway/commands` | Claim pending commands |
| POST | `/api/v1/device-gateway/commands/{id}/result` | Report command outcome |

Sync loop features: per-device checkpoints, batch upload, exponential backoff with jitter, dead-letter after max attempts, command handling (`TEST_CONNECTION`, `SYNC_DEVICE`, `READ_USERS`, `REFRESH_INFO`, `SYNC_DEVICE_TIME`).

## Realtime RS9W FKWeb push

For an RS9W configured with `ConnectionMode: FKWEB_PUSH`, set the terminal's
**Web Server URL** to:

```text
http://CONNECT_PC_LAN_IP:8080/hdata.aspx
```

Keep **Server-Client Mode** set to `FkWeb`. The connector accepts both common
FKData HS102 and EBKN FKWeb packet/acknowledgement variants. It validates the
`dev_id` against `PushDeviceId` and, when `NetworkAddress` is configured,
rejects packets from any other source IP. Attendance is acknowledged only
after SQLite has durably accepted it, so retries are safe.

Reserve fixed DHCP addresses for the terminal and Connect PC. The firewall rule
created by `-EnableFkWeb` permits only the private local subnet.

## Realtime SDK polling note

`RealtimeRS9WAdapter` implements `IBiometricDeviceAdapter` fully but every hardware method throws:

> Realtime RS9W vendor SDK is not installed with this build…

Replace that class with a vendor-backed implementation when the DLL is licensed and deployed beside the Connect binaries.
