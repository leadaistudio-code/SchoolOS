# SOP: Connect an RS9W Directly to MyCampusView (No Local PC)

## When to use this

Use this method when a school has no Windows PC that can run MyCampusView
Connect. The RS9W sends attendance over the internet to the dedicated
MyCampusView FKWeb Cloud Gateway.

```text
RS9W → Internet → FKWeb Cloud Gateway → MyCampusView attendance
```

Do not enter the normal school website as the RS9W Web Server URL. Every device
receives a private gateway URL created by MyCampusView.

## Requirements

- Realtime RS9W with `FkWeb` Server-Client mode
- Reliable internet connection at the school
- Outbound internet access from the biometric device
- School administrator access to MyCampusView
- RS9W Cloud ID
- Student Admission Numbers and/or staff Employee Codes

## Setup

### 1. Register the internet-connected device

1. Sign in to the correct school.
2. Open **Settings → Biometric → Devices**.
3. Under **Connect a device without a local PC**, enter:
   - Device name, for example `Main Gate RS9W`
   - Cloud ID exactly as displayed on the terminal
   - Whether it is used for students, staff or both
   - Location, if required
4. Select **Create internet connection**.
5. Copy the Web Server URL immediately. The private token in this URL is shown
   only once.

Treat the generated URL like a password. Do not send it through public groups
or include it in screenshots.

### 2. Configure the RS9W

On the terminal:

1. Open **Communication**.
2. Open **Server-Client Mode**.
3. Select `FkWeb`.
4. Paste the complete URL shown by MyCampusView into **Web Server URL**.
5. Save the settings.
6. Restart the terminal.

The URL includes a Railway proxy hostname, port, private device token and
`hdata.aspx` path. Enter the complete value without changing it.

### 3. Test

1. Make one fingerprint punch.
2. Open **Settings → Biometric → Event logs**.
3. Confirm the correct device user ID, time and device appear.
4. Open **Settings → Biometric → Devices** and confirm the device is `ONLINE`.

If no event appears, confirm:

- The RS9W has working internet access.
- `FkWeb` is selected.
- The complete private URL was entered.
- The Cloud ID registered in MyCampusView exactly matches the terminal.
- The school firewall permits outbound connections to the hostname and port
  shown in the URL.

### 4. Map users

For a student:

1. Open **Settings → Biometric → User mapping**.
2. Enter the device user ID.
3. Select **Student**.
4. Enter the Admission Number.
5. Save.

For a staff member:

1. Enter the device user ID.
2. Select **Staff member**.
3. Enter the Employee Code.
4. Save.

### 5. Confirm attendance

Make another punch after mapping. The Event log should show `PROCESSED`, and
the appropriate Student Attendance or Staff Attendance register should update.

## Status meanings

| Status | Meaning | Action |
| --- | --- | --- |
| `PROCESSED` | Attendance was updated | No action |
| `UNMAPPED` | Device user is not linked | Create a user mapping |
| `CONFLICT` | Manual attendance disagrees with the punch | Review, correct if appropriate, then reprocess |
| `SKIPPED` | Duplicate or disabled attendance option | Review settings |
| `FAILED` | MyCampusView could not process it | Contact support with the event time |

## Security

- The gateway is separate from the main web application.
- Every device has a long, random URL token.
- The Cloud ID must also match the registered terminal.
- Payload size, request rate and concurrent connections are limited.
- MyCampusView stores the attendance event before acknowledging the terminal.
- Duplicate terminal retries do not create duplicate attendance.
- Disable the device in MyCampusView immediately if its private URL is exposed.

## Internet outage

RS9W terminals normally retain unacknowledged punches and retry when the
internet returns. Confirm this behavior with the school's firmware during
commissioning. MyCampusView safely deduplicates retried packets.

## Used-device warning

A terminal previously used elsewhere may upload its stored historical punches.
Confirm and back up its data before connecting it to a new school. Never run
unverified commands that clear terminal users or attendance logs.
