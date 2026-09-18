# MyCampusView Connect — Installation

For the complete new-school procedure and handover checklist, see
[SOP: Set Up an RS9W Biometric Device for a New School](biometric-new-school-sop.md).

## Prerequisites

- Windows 10/11 or Windows Server (x64)
- .NET 8 runtime (or SDK for building)
- Outbound HTTPS to your MyCampusView school host
- LAN reachability to the biometric device (for real hardware)

## Build / publish

```powershell
cd connect
dotnet build MyCampusView.Connect.sln -c Release
.\scripts\publish.ps1
```

## Install as Windows service

Run elevated:

```powershell
.\scripts\install-service.ps1
```

The service starts at boot and runs without an interactive login.

Uninstall:

```powershell
.\scripts\uninstall-service.ps1
```

## Pairing

1. In MyCampusView: **Settings → Biometric → Connectors → Generate pairing code**
2. On the school PC run **MyCampusView Connect Setup** (or the Setup console project)
3. Enter the school HTTPS base URL (e.g. `https://apni-pathshala.mycampusview.com`) and the pairing code (`MCV-XXXX-XXXX`)
4. Setup stores the connector secret with Windows DPAPI under ProgramData

## Add a device

In Connect configuration (see `connect/README.md`):

- Brand: `Realtime`, Model: `RS9W`, ConnectionMode: `FKWEB_PUSH` — SDK-free push receiver
- Brand: `Realtime`, Model: `RS9W`, ConnectionMode: `SDK` — requires vendor SDK
- Brand: `Simulator` — only when `AllowSimulator=true` (never in Production)

## Realtime RS9W without the SDK (FKWeb)

The terminal must push to a Windows PC on the same private network. Reserve a
fixed LAN address for both the RS9W and the Connect PC before configuring it.

Edit `%ProgramData%\MyCampusView\Connect\config.json`:

```json
{
  "ApiBaseUrl": "https://your-school.mycampusview.com",
  "FkWebListenPrefix": "http://+:8080/",
  "FkWebMaxBodyBytes": 1048576,
  "Devices": [
    {
      "LocalDeviceId": "main-gate-rs9w",
      "Name": "Main Gate RS9W",
      "Brand": "Realtime",
      "Model": "RS9W",
      "ConnectionMode": "FKWEB_PUSH",
      "PushDeviceId": "ENTER_THE_CLOUD_ID_FROM_THE_DEVICE",
      "NetworkAddress": "192.168.1.224",
      "Purpose": "BOTH",
      "SyncEnabled": true
    }
  ]
}
```

`PushDeviceId` is the Cloud Id shown on the terminal. Keep it private.
`NetworkAddress` is the terminal's reserved IP and is checked on every packet.

Publish and install from an elevated PowerShell:

```powershell
cd connect
.\scripts\publish.ps1
.\scripts\install-service.ps1 -EnableFkWeb -FkWebPort 8080
```

On the RS9W:

1. Open **Communication**.
2. Keep **Server-Client Mode** as `FkWeb`.
3. Leave the terminal's existing TCP port `5005` unchanged.
4. Set **Web Server URL** to
   `http://CONNECT_PC_LAN_IP:8080/hdata.aspx`.
5. Save, return to the main screen, and make one test punch.

Check `%ProgramData%\MyCampusView\Connect\logs\connect-YYYYMMDD.log` for
`FKWeb punch queued`. Unrecognized firmware packets are retained under
`fkweb-diagnostics`; they are not acknowledged or discarded.

## Data folder

`%ProgramData%\MyCampusView\Connect\`

- `queue.db` — offline event queue
- `checkpoints/` — per-device sync checkpoints
- `logs/` — rotated operational logs
- credentials via DPAPI — not plain text

## Upgrade

1. Stop the service
2. Publish new binaries over the install folder
3. Start the service

Do **not** delete `queue.db` during upgrade — pending offline events live there.

## Manual upgrade note

Auto-update of executables is not implemented in v1. Download a signed build from your IT channel and replace files as above.
