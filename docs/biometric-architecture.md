# MyCampusView Connect — Biometric Device Gateway

## Goal

Schools keep existing biometric hardware on their LAN. **MyCampusView Connect** (Windows service) talks to the device and sends outbound HTTPS events to MyCampusView Cloud. The cloud never dials private IPs such as `192.168.1.100`.

```text
Device (Realtime RS9W / Simulator / future brands)
        → MyCampusView Connect (school PC)
        → HTTPS Device Gateway API
        → DeviceRawEvent (immutable)
        → DeviceUserMapping
        → Existing StudentAttendance / StaffAttendance
        → Dashboards / Parent notifications / Campus Assistant
```

## What we reused

| Existing | Role |
|----------|------|
| `GpsIngestToken` + `/api/v1/transport/ingest` | Pattern for machine bearer auth |
| `StudentAttendance` / `StaffAttendance` | No parallel attendance system |
| `AttendanceSource.BIOMETRIC` | Staff source already reserved; student `source` added |
| `tenantDb`, RBAC `module.action`, `audit()`, `notify()` | Tenancy, permissions, audit |
| Settings hub + navigation | Admin UI home |
| Campus Assistant attendance tools | Answers update once attendance rows update |

## No Campus entity

There is no multi-campus table today. Devices use optional `locationLabel` (gate/wing). Do not invent a second campus model.

## No Realtime SDK in-repo

`RealtimeRS9WAdapter` is a stub. `SimulatedBiometricAdapter` is for lab/E2E only and must stay off in Production.

## Cloud models

- `DeviceConnector` — paired Connect install
- `DevicePairingCode` — short-lived single-use code
- `BiometricDevice` — brand-agnostic device
- `DeviceUserMapping` — external user id → Student/Staff
- `DeviceRawEvent` — immutable punches + dedupe key
- `DeviceCommand` — cloud→connector poll commands

## APIs

Machine (bearer = connector secret):

- `POST /api/v1/device-gateway/pair`
- `POST /api/v1/device-gateway/heartbeat`
- `POST /api/v1/device-gateway/devices`
- `POST /api/v1/device-gateway/events/batch`
- `GET  /api/v1/device-gateway/commands`
- `POST /api/v1/device-gateway/commands/:id/result`

Admin (session + `biometric.*`):

- `GET/POST /api/v1/biometric`

## Security

- Pairing codes expire (30m), single-use, tenant-bound
- Connector secret hashed (SHA-256); plaintext shown once
- Tenant resolved from connector identity only
- No fingerprint templates uploaded
- Connection passwords encrypted at rest (`encryptSecret`)

## Offline

Connect stores events in SQLite under `%ProgramData%\MyCampusView\Connect\` until the cloud acknowledges the batch. Retries use exponential backoff. Dedupe keys prevent duplicates on retry.
