# SOP: Set Up an RS9W Biometric Device for a New School

## Purpose

Use this procedure to connect a Realtime RS9W biometric terminal to a new
MyCampusView school without using the vendor SDK.

If the school has no local Windows PC, use
[SOP: Connect an RS9W Directly to MyCampusView](cloud-biometric-no-pc-sop.md)
instead.

The terminal sends punches to **MyCampusView Connect** on a Windows PC. Connect
stores them safely and uploads them to the correct school over HTTPS.

## Important rule

Use a separate Connect installation for each school. A connector is paired to
one school only. Re-pairing an existing connector disconnects it from its
current school.

## Responsibility

- **School administrator:** generates the pairing code and maps device users.
- **IT person:** reserves IP addresses, installs Connect and configures RS9W.
- **Attendance operator:** verifies student and staff attendance.

## Requirements

- Realtime RS9W with **FkWeb** mode
- Windows 10/11 or Windows Server PC at the school
- .NET 8 runtime installed
- PC and RS9W connected to the same trusted local network
- School administrator login for MyCampusView
- MyCampusView Connect release files
- Administrator access on the Windows PC

## Information to collect

Record these values before starting:

| Item | Example |
| --- | --- |
| School URL | `https://new-school.mycampusview.com` |
| Connect PC fixed IP | `192.168.1.40` |
| RS9W fixed IP | `192.168.1.224` |
| RS9W Cloud ID | Shown under Communication settings |
| Connector name | `Main Gate Connector` |
| Listener port | `8080` |

Do not publish the Cloud ID or pairing code. The pairing code is temporary and
can be used only once.

## Procedure

### 1. Prepare the network

1. Connect the Windows PC and RS9W to the same router/network.
2. In the router, reserve a fixed IP for the PC.
3. Reserve a fixed IP for the RS9W.
4. From the PC, verify that the device responds:

   ```powershell
   Test-Connection RS9W_IP -Count 2
   ```

5. Do not expose TCP port `8080` to the public internet.

### 2. Generate a school pairing code

1. Sign in to the new school's MyCampusView website.
2. Open **Settings → Biometric → Connectors**.
3. Select **Generate pairing code**.
4. Copy the `MCV-XXXX-XXXX` code.
5. Complete pairing before the code expires.

### 3. Pair the Connect PC

Open PowerShell as Administrator in the project `connect` directory:

```powershell
.\scripts\publish.ps1

.\artifacts\publish\Setup\MyCampusView.Connect.Setup.exe `
  "https://new-school.mycampusview.com" `
  "MCV-XXXX-XXXX" `
  "Main Gate Connector"
```

Replace the URL, pairing code and connector name.

Expected result:

```text
Paired successfully.
```

If the code is invalid, used or expired, generate a new code. Never reuse a
pairing code from another school.

### 4. Configure the RS9W in Connect

Open:

```text
C:\ProgramData\MyCampusView\Connect\config.json
```

Use this configuration:

```json
{
  "ApiBaseUrl": "https://new-school.mycampusview.com",
  "FkWebListenPrefix": "http://+:8080/",
  "FkWebMaxBodyBytes": 1048576,
  "AllowSimulator": false,
  "Devices": [
    {
      "LocalDeviceId": "main-gate-rs9w",
      "Name": "Main Gate RS9W",
      "Brand": "Realtime",
      "Model": "RS9W",
      "ConnectionMode": "FKWEB_PUSH",
      "PushDeviceId": "CLOUD_ID_SHOWN_ON_DEVICE",
      "NetworkAddress": "RS9W_IP",
      "Purpose": "BOTH",
      "SyncEnabled": true
    }
  ]
}
```

Rules:

- `ApiBaseUrl` must be the new school's URL.
- `PushDeviceId` must exactly match the RS9W Cloud ID.
- `NetworkAddress` must be the reserved RS9W IP.
- Use a different `LocalDeviceId` for each device.
- Use `Purpose: BOTH` for student and staff attendance.

### 5. Install the Windows service

From Administrator PowerShell:

```powershell
.\scripts\install-service.ps1 `
  -PublishDir ".\artifacts\publish\Connect" `
  -EnableFkWeb `
  -FkWebPort 8080
```

Confirm the service and listener:

```powershell
Get-Service MyCampusViewConnect
Test-NetConnection localhost -Port 8080
```

Expected results:

- Service status: `Running`
- TCP test: `True`

The installer permits port `8080` only from the local subnet.

### 6. Configure the RS9W terminal

On the terminal:

1. Open **Communication**.
2. Open **Server-Client Mode**.
3. Select `FkWeb`.
4. Set **Web Server URL** to:

   ```text
   http://CONNECT_PC_IP:8080/hdata.aspx
   ```

   Example:

   ```text
   http://192.168.1.40:8080/hdata.aspx
   ```

5. Keep the terminal's existing local TCP port unchanged.
6. Save the settings.
7. Restart the terminal.

### 7. Test the connection

1. Make one fingerprint punch.
2. In MyCampusView, open **Settings → Biometric → Event logs**.
3. Confirm the event shows:
   - Correct device
   - Correct device user ID
   - Correct date and time
4. On the PC, open:

   ```text
   %ProgramData%\MyCampusView\Connect\logs
   ```

5. Confirm the latest log contains:

   ```text
   FKWeb punch queued
   Uploaded batch: accepted=1
   ```

The first connection may send historical punches stored on the terminal.

### 8. Map student device users

1. Open **Settings → Biometric → User mapping**.
2. Enter the **Device User ID**.
3. Select **Student**.
4. Enter the student's **Admission Number**.
5. Select **Save mapping**.

The system reprocesses eligible unmatched events after saving.

### 9. Map staff device users

1. Open **Settings → Biometric → User mapping**.
2. Enter the **Device User ID**.
3. Select **Staff member**.
4. Enter the staff member's **Employee Code**.
5. Select **Save mapping**.

Ensure the staff record has an employee code before mapping.

### 10. Verify attendance

1. Make another punch for a mapped student or staff member.
2. Confirm the Event log status becomes `PROCESSED`.
3. Check the appropriate Student Attendance or Staff Attendance register.

Status meanings:

| Status | Meaning | Action |
| --- | --- | --- |
| `PROCESSED` | Attendance updated | No action |
| `UNMAPPED` | Device user is not mapped | Create a user mapping |
| `CONFLICT` | Punch conflicts with manually marked attendance | Review attendance, then reprocess if appropriate |
| `SKIPPED` | Duplicate or attendance setting prevented processing | Review event details/settings |
| `FAILED` | Processing error | Review the error and local logs |

## Historical-data warning

A previously used RS9W may send all stored punches when first connected.
Before connecting a used terminal:

1. Confirm its users and historical logs belong to the new school.
2. Back up required attendance.
3. Ask the authorized school administrator/vendor before clearing device data.
4. Never experiment with commands that clear enrollments or logs.

## Troubleshooting

### No event appears

Check:

1. Connect service is running.
2. PC and terminal IP addresses have not changed.
3. RS9W Web Server URL uses the Connect PC IP, not the school website.
4. Port `8080` is reachable.
5. FkWeb mode is selected.
6. Cloud ID matches `PushDeviceId`.

### Event appears as UNMAPPED

Map the device user to a student Admission Number or staff Employee Code.

### Event appears as CONFLICT

The person may already be manually marked absent. Correct the manual attendance
only when appropriate, then select **Reprocess**.

### Local diagnostic locations

```text
%ProgramData%\MyCampusView\Connect\logs
%ProgramData%\MyCampusView\Connect\fkweb-diagnostics
%ProgramData%\MyCampusView\Connect\queue.db
```

Do not delete `queue.db` or `credentials.dpapi`.

## Handover checklist

- [ ] Correct school URL used
- [ ] Connector visible under the correct school's Biometric settings
- [ ] Connect PC has reserved IP
- [ ] RS9W has reserved IP
- [ ] Cloud ID and source IP configured
- [ ] Windows service is running automatically
- [ ] Port `8080` is limited to the local network
- [ ] Test event uploaded
- [ ] Student mapping tested
- [ ] Staff mapping tested
- [ ] Attendance register verified
- [ ] School IT person knows where local logs are stored

## Removing the connector

From Administrator PowerShell:

```powershell
.\scripts\uninstall-service.ps1
```

This removes the Windows service and firewall rule but leaves credentials,
configuration, logs and queued events under ProgramData for safety.
