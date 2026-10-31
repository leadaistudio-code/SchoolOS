# MyCampusView Connect — Installation

For the complete new-school procedure and handover checklist, see
[SOP: Set Up an RS9W Biometric Device for a New School](biometric-new-school-sop.md).

## One-click installer (recommended)

`MyCampusView-Connect-Setup.exe` is a single self-contained file: no .NET,
PowerShell or config editing on the school PC.

1. In MyCampusView open **Settings → Biometric → Connectors** and click
   **Download for Windows**, then **Generate pairing code**.
2. Run the downloaded file on a PC on the same network as the terminals and
   accept the Windows permission prompt. If SmartScreen shows "Windows protected
   your PC", click **More info → Run anyway**.
3. Type the pairing code, add each terminal (name + Cloud ID from
   **Menu → Comm → Cloud server**; IP optional), and click **Install**.
4. Setup installs to `C:\Program Files\MyCampusView\Connect`, registers the
   `MyCampusViewConnect` Windows service (auto start, restarts on failure), opens
   the firewall port for the local subnet, adds Start-menu/desktop shortcuts and
   an Apps & features entry, then checks the service, the cloud connection and
   the listening port.
5. On each terminal set the **Web Server URL** to the address shown on the last
   page, e.g. `http://192.168.1.20:8080/hdata.aspx`.

Opening the app again later shows a status window: service state, cloud
connection, terminal URL, recent activity, and buttons to edit terminals,
re-pair, restart, open logs or uninstall. Running a newer setup file upgrades in
place and keeps the existing pairing.

Unattended install (elevated prompt, e.g. via remote support):

```powershell
MyCampusView-Connect-Setup.exe --silent --code=MCV-ABCD-EFGH [--name="Front Office PC"] [--port=8080] [--no-desktop-shortcut]
MyCampusView-Connect-Setup.exe --uninstall --quiet [--remove-data]
```

Silent install exits `0` when everything is verified, `2` when installed but the
service or cloud check did not pass, and `1` on failure (details in
`%ProgramData%\MyCampusView\Connect\logs\setup.log`). Terminals are then added
from the app's **Terminals…** button.

Rebuild the installer from source with `connect\scripts\build-installer.ps1`; it
writes `public\downloads\MyCampusView-Connect-Setup.exe`, which the app serves.

The sections below describe the older script-based install.

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
