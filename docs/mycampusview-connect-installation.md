# MyCampusView Connect — Installation

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

- Brand: `Realtime`, Model: `RS9W` — requires vendor SDK (not in repo)
- Brand: `Simulator` — only when `AllowSimulator=true` (never in Production)

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
